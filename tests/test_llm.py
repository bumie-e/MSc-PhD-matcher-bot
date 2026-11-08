import json

import httpx
import pytest

from agents.llm import LLM, LLMAuthError, LLMRateLimitError, extract_json


def test_extract_json_plain_fenced_and_wrapped():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Sure! Here you go:\n{"a": {"b": 2}}\nHope that helps.') == {"a": {"b": 2}}


def test_extract_json_rejects_non_objects_and_garbage():
    assert extract_json(None) is None
    assert extract_json("") is None
    assert extract_json("[1, 2, 3]") is None  # bare arrays are not usable
    assert extract_json("no json here") is None
    assert extract_json('{"unterminated": ') is None


def _anthropic_llm(handler) -> LLM:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return LLM("anthropic", "sk-ant-test", "claude-test", http_client=client)


def test_anthropic_request_shape_and_parsing():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"content": [{"type": "text", "text": 'Result: {"score": 77}'}]})

    result = _anthropic_llm(handler).complete_json("system prompt", "user text")

    assert result == {"score": 77}
    assert seen["headers"]["x-api-key"] == "sk-ant-test"
    assert seen["headers"]["anthropic-version"] == "2023-06-01"
    assert seen["body"]["model"] == "claude-test"
    assert seen["body"]["messages"] == [{"role": "user", "content": "user text"}]
    assert seen["body"]["system"].startswith("system prompt")


def test_anthropic_auth_failure_raises_auth_error():
    llm = _anthropic_llm(lambda request: httpx.Response(401, json={"error": {"message": "bad key"}}))
    with pytest.raises(LLMAuthError):
        llm.complete_json("s", "u")


def test_anthropic_bad_request_skips_instead_of_raising():
    llm = _anthropic_llm(lambda request: httpx.Response(400, json={"error": {"message": "bad"}}))
    assert llm.complete_json("s", "u") is None


def test_anthropic_persistent_rate_limit_raises_after_retries(monkeypatch):
    monkeypatch.setattr("agents.llm.time.sleep", lambda _: None)
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(429, json={})

    with pytest.raises(LLMRateLimitError):
        _anthropic_llm(handler).complete_json("s", "u")
    assert len(calls) == 3


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError):
        LLM("grok", "k", "m")


def test_provider_error_bodies_never_reach_exception_messages_or_logs(capsys):
    message = "Incorrect API key provided: sk-ant-SECRET1234. CV text: John Doe, MIT"
    secret_body = {"error": {"message": message}}

    # Auth failure: exception text must not carry the provider's body.
    llm = _anthropic_llm(lambda request: httpx.Response(401, json=secret_body))
    with pytest.raises(LLMAuthError) as auth_exc:
        llm.complete_json("s", "u")
    assert "SECRET1234" not in str(auth_exc.value) and "John Doe" not in str(auth_exc.value)

    # Other failures: nothing from the body is printed to the (public) log.
    llm = _anthropic_llm(lambda request: httpx.Response(400, json=secret_body))
    assert llm.complete_json("s", "u") is None
    out = capsys.readouterr().out
    assert "SECRET1234" not in out and "John Doe" not in out


def _fake_openai(monkeypatch, exc):
    """Make the OpenAI-compatible client raise `exc` on every request."""

    class _Completions:
        def create(self, **kwargs):
            raise exc

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

        def __init__(self, **kwargs):
            pass

    monkeypatch.setattr("agents.llm.openai.OpenAI", _Client)


def _status_error(cls, status, code=None):
    request = httpx.Request("POST", "https://api.example.com/v1/chat/completions")
    response = httpx.Response(status, request=request, json={"error": {"code": code}})
    return cls("error", response=response, body={"code": code})


def test_anthropic_404_means_model_is_gone():
    from agents.llm import LLMModelUnavailable

    llm = _anthropic_llm(lambda request: httpx.Response(404, json={"error": {"type": "not_found_error"}}))
    with pytest.raises(LLMModelUnavailable):
        llm.complete_json("s", "u")


def test_openai_compatible_model_not_found_and_decommissioned(monkeypatch):
    import openai

    from agents.llm import LLMModelUnavailable

    for exc in (
        _status_error(openai.NotFoundError, 404, "model_not_found"),
        _status_error(openai.BadRequestError, 400, "model_decommissioned"),
    ):
        _fake_openai(monkeypatch, exc)
        with pytest.raises(LLMModelUnavailable):
            LLM("groq", "gsk_test", "old-model").complete_json("s", "u")


def test_other_openai_bad_requests_are_skipped_not_treated_as_retired(monkeypatch):
    import openai

    _fake_openai(monkeypatch, _status_error(openai.BadRequestError, 400, "json_validate_failed"))
    assert LLM("groq", "gsk_test", "m").complete_json("s", "u") is None
