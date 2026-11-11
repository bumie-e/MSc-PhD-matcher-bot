import json

import httpx
import pytest

from agents.llm import LLM, LLMAuthError, LLMModelUnavailable, LLMRateLimitError, LLMUnavailableError
from agents.llm_providers import PROVIDERS, BaseLLMProvider
from agents.schemas import MatchResult, Opportunity, ParsedCV, StructuredResponse


class SampleScore(StructuredResponse):
    score: int


def test_provider_subclasses_must_implement_complete():
    class IncompleteProvider(BaseLLMProvider):
        pass

    with httpx.Client() as client:
        with pytest.raises(TypeError, match="abstract"):
            IncompleteProvider("test-key", "test-model", client)


def test_registered_provider_works_without_facade_changes(monkeypatch):
    calls = []

    class NewProvider(BaseLLMProvider):
        def complete(self, system, user, schema_name, schema, max_tokens):
            calls.append((self.model, system, user, schema_name, schema, max_tokens))
            return '{"score": 77}'

    monkeypatch.setitem(PROVIDERS, "new-provider", NewProvider)
    with LLM("new-provider", "test-key", "custom-model") as llm:
        assert llm.complete_structured("system", "user", SampleScore, max_tokens=512) == SampleScore(score=77)
    assert calls == [("custom-model", "system", "user", "SampleScore", SampleScore.model_json_schema(), 512)]


def _anthropic_llm(handler) -> LLM:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return LLM("anthropic", "sk-ant-test", "claude-test", http_client=client)


def test_anthropic_request_shape_and_parsing():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={
            "stop_reason": "end_turn", "content": [{"type": "text", "text": '{"score": 77}'}],
        })

    result = _anthropic_llm(handler).complete_structured("system prompt", "user text", SampleScore)

    assert result == SampleScore(score=77)
    assert seen["headers"]["x-api-key"] == "sk-ant-test"
    assert seen["headers"]["anthropic-version"] == "2023-06-01"
    assert seen["body"]["model"] == "claude-test"
    assert seen["body"]["messages"] == [{"role": "user", "content": "user text"}]
    assert seen["body"]["system"] == "system prompt"
    assert seen["body"]["output_config"] == {
        "format": {"type": "json_schema", "schema": SampleScore.model_json_schema()},
    }


def test_anthropic_auth_failure_raises_auth_error():
    llm = _anthropic_llm(lambda request: httpx.Response(401, json={"error": {"message": "bad key"}}))
    with pytest.raises(LLMAuthError):
        llm.complete_structured("s", "u", SampleScore)


def test_anthropic_bad_request_skips_instead_of_raising():
    llm = _anthropic_llm(lambda request: httpx.Response(400, json={"error": {"message": "bad"}}))
    assert llm.complete_structured("s", "u", SampleScore) is None


def test_anthropic_persistent_rate_limit_raises_after_retries(monkeypatch):
    monkeypatch.setattr("agents.llm.time.sleep", lambda _: None)
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(429, json={})

    with pytest.raises(LLMRateLimitError):
        _anthropic_llm(handler).complete_structured("s", "u", SampleScore)
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
        llm.complete_structured("s", "u", SampleScore)
    assert "SECRET1234" not in str(auth_exc.value) and "John Doe" not in str(auth_exc.value)

    # Other failures: nothing from the body is printed to the (public) log.
    llm = _anthropic_llm(lambda request: httpx.Response(400, json=secret_body))
    assert llm.complete_structured("s", "u", SampleScore) is None
    out = capsys.readouterr().out
    assert "SECRET1234" not in out and "John Doe" not in out


def _http_llm(provider, handler, model="test-model"):
    return LLM(provider, "test-key", model, http_client=httpx.Client(transport=httpx.MockTransport(handler)))


def _mock_llm(
    provider, text='{"score": 77}', finish_reason=None, refusal=None, seen=None, model="test-model"
):
    def handler(request):
        if seen is not None:
            seen.update(json.loads(request.content))
        if provider == "anthropic":
            body = {
                "stop_reason": finish_reason or "end_turn",
                "content": [{"type": "text", "text": text}],
            }
        elif provider == "deepseek":
            body = {"choices": [{
                "finish_reason": finish_reason or "tool_calls",
                "message": {"role": "assistant", "content": None, "refusal": refusal, "tool_calls": [{
                    "id": "call-result", "type": "function",
                    "function": {"name": "SampleScore", "arguments": text},
                }]},
            }]}
        else:
            body = {"choices": [{
                "finish_reason": finish_reason or "stop",
                "message": {"role": "assistant", "content": text, "refusal": refusal},
            }]}
        return httpx.Response(200, json=body)

    return _http_llm(provider, handler, model)


@pytest.mark.parametrize("provider", ["openai", "groq", "gemini"])
def test_openai_compatible_requests_strict_schema(provider):
    seen = {}
    result = _mock_llm(provider, seen=seen).complete_structured("system", "user", SampleScore, max_tokens=512)
    assert result == SampleScore(score=77)
    assert seen["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "SampleScore", "strict": True, "schema": SampleScore.model_json_schema()},
    }
    assert seen["max_completion_tokens"] == 512
    assert seen["messages"] == [{"role": "system", "content": "system"}, {"role": "user", "content": "user"}]


@pytest.mark.parametrize("provider", list(PROVIDERS))
@pytest.mark.parametrize("text", [
    "", "[1, 2, 3]", "no json here", '{"unterminated": ',
    '```json\n{"score": 77}\n```', 'Result: {"score": 77}',
    '{}', '{"score": "77"}', '{"score": true}', '{"score": 77, "unexpected": 1}',
])
def test_unusable_or_schema_invalid_output_is_skipped(provider, text):
    assert _mock_llm(provider, text=text).complete_structured("s", "u", SampleScore) is None


@pytest.mark.parametrize("provider, finish_reason", [
    ("openai", "length"), ("groq", "length"), ("openai", "content_filter"),
    ("anthropic", "max_tokens"), ("anthropic", "refusal"),
    ("gemini", "length"), ("gemini", "content_filter"), ("deepseek", "length"), ("deepseek", "stop"),
])
def test_incomplete_or_refused_output_is_skipped_even_if_json_is_valid(provider, finish_reason):
    llm = _mock_llm(provider, finish_reason=finish_reason)
    assert llm.complete_structured("s", "u", SampleScore) is None


def test_openai_refusal_is_skipped():
    assert _mock_llm("openai", refusal="refused").complete_structured("s", "u", SampleScore) is None


def test_schema_validation_does_not_log_input(capsys):
    llm = _mock_llm("anthropic", text='{"score": "CV text: John Doe, sk-SECRET1234"}')
    assert llm.complete_structured("s", "u", SampleScore) is None
    out = capsys.readouterr().out
    assert "invalid structured output" in out
    assert "John Doe" not in out and "SECRET1234" not in out


@pytest.fixture(params=list(PROVIDERS))
def provider(request):
    return request.param


@pytest.mark.parametrize("status, code, error_type", [
    (401, None, LLMAuthError), (403, None, LLMAuthError),
    (404, "not_found_error", LLMModelUnavailable),
    (400, "model_decommissioned", LLMModelUnavailable),
    (400, "model_not_found", LLMModelUnavailable),
])
def test_permanent_errors_are_consistent_and_not_retried(provider, status, code, error_type, capsys):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"code": code, "message": "SECRET CV TEXT"}})

    with pytest.raises(error_type) as exc:
        _http_llm(provider, handler).complete_structured("s", "u", SampleScore)
    assert len(calls) == 1
    assert "SECRET" not in str(exc.value)
    assert exc.value.__suppress_context__  # Provider bodies must not leak through tracebacks.
    assert "SECRET" not in capsys.readouterr().out


@pytest.mark.parametrize("status", [400, 422])
def test_other_bad_requests_are_skipped_without_retries(provider, status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"code": "json_validate_failed"}})

    assert _http_llm(provider, handler).complete_structured("s", "u", SampleScore) is None
    assert len(calls) == 1


@pytest.mark.parametrize("status", [408, 409, 429, 500, 503, 504, 529])
def test_transient_http_errors_retry_with_the_same_budget(provider, status, monkeypatch):
    sleeps = []
    monkeypatch.setattr("agents.llm.time.sleep", sleeps.append)
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"message": "SECRET"}})

    error_type = LLMRateLimitError if status == 429 else LLMUnavailableError
    with pytest.raises(error_type) as exc:
        _http_llm(provider, handler).complete_structured("s", "u", SampleScore)
    assert len(calls) == 3
    assert sleeps == [2, 4]
    assert "SECRET" not in str(exc.value)


@pytest.mark.parametrize("error_type", [httpx.ConnectError, httpx.ReadTimeout])
def test_connection_failures_retry_and_stop_the_run(provider, error_type, monkeypatch):
    sleeps = []
    monkeypatch.setattr("agents.llm.time.sleep", sleeps.append)
    calls = []

    def handler(request):
        calls.append(request)
        raise error_type("SECRET CV TEXT", request=request)

    with pytest.raises(LLMUnavailableError) as exc:
        _http_llm(provider, handler).complete_structured("s", "u", SampleScore)
    assert len(calls) == 3
    assert sleeps == [2, 4]
    assert "SECRET" not in str(exc.value)


def test_transient_failure_can_recover(provider, monkeypatch):
    monkeypatch.setattr("agents.llm.time.sleep", lambda _: None)
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(503, json={})
        if provider == "anthropic":
            body = {"stop_reason": "end_turn", "content": [{"type": "text", "text": '{"score": 77}'}]}
        elif provider == "deepseek":
            body = {"choices": [{
                "finish_reason": "tool_calls", "message": {"role": "assistant", "tool_calls": [{
                    "id": "call-result", "type": "function",
                    "function": {"name": "SampleScore", "arguments": '{"score": 77}'},
                }]},
            }]}
        else:
            body = {"choices": [{
                "finish_reason": "stop", "message": {"role": "assistant", "content": '{"score": 77}'},
            }]}
        return httpx.Response(200, json=body)

    assert _http_llm(provider, handler).complete_structured("s", "u", SampleScore) == SampleScore(score=77)
    assert len(calls) == 2


@pytest.mark.parametrize("headers, expected", [
    ({"retry-after": "7"}, [7, 7]),
    ({"retry-after-ms": "1500"}, [1.5, 1.5]),
    ({"retry-after": "invalid"}, [2, 4]),
    ({"retry-after": "NaN"}, [2, 4]),
    ({"retry-after": "-1"}, [2, 4]),
    ({"retry-after": "120"}, []),
])
def test_retry_after_is_respected_or_stops_the_run(provider, headers, expected, monkeypatch):
    sleeps = []
    monkeypatch.setattr("agents.llm.time.sleep", sleeps.append)
    llm = _http_llm(provider, lambda _: httpx.Response(429, json={}, headers=headers))
    with pytest.raises(LLMRateLimitError):
        llm.complete_structured("s", "u", SampleScore)
    assert sleeps == expected


@pytest.mark.parametrize("body", [None, [], {}, {"choices": [{}]}, {"content": [None]}])
def test_malformed_provider_envelopes_do_not_crash(provider, body):
    llm = _http_llm(provider, lambda _: httpx.Response(200, content=json.dumps(body)))
    assert llm.complete_structured("s", "u", SampleScore) is None


@pytest.mark.parametrize("provider, model, effort", [
    ("openai", "gpt-5-mini", "low"), ("openai", "gpt-4.1-mini", None),
    ("groq", "openai/gpt-oss-20b", "low"), ("groq", "openai/gpt-oss-120b", "low"),
    ("groq", "llama-3.3-70b-versatile", None), ("groq", "qwen/qwen3-32b", None),
    ("gemini", "gemini-2.5-flash", "low"), ("gemini", "gemini-3.8-flash", "low"),
    ("gemini", "gemini-2.0-flash", None),
])
def test_reasoning_options_are_model_specific(provider, model, effort):
    seen = {}
    llm = _mock_llm(provider, seen=seen, model=model)
    assert llm.complete_structured("s", "u", SampleScore) == SampleScore(score=77)
    assert seen.get("reasoning_effort") == effort


def test_close_preserves_a_borrowed_http_client(provider):
    llm = _mock_llm(provider)
    with llm:
        assert llm.complete_structured("s", "u", SampleScore) == SampleScore(score=77)
    assert not llm._http.is_closed
    llm._http.close()


def test_context_manager_closes_owned_connection_pool():
    with LLM("anthropic", "test-key", "test-model") as llm:
        assert not llm._http.is_closed
    assert llm._http.is_closed


def test_malformed_error_codes_do_not_crash(provider):
    llm = _http_llm(provider, lambda _: httpx.Response(400, json={"error": {"code": {"unexpected": True}}}))
    assert llm.complete_structured("s", "u", SampleScore) is None


def test_http_date_retry_after_is_respected(monkeypatch):
    from datetime import datetime, timezone

    from agents.llm import _retry_delay

    class FixedDatetime:
        @staticmethod
        def now(tz):
            return datetime(2026, 11, 11, 12, 0, 0, tzinfo=timezone.utc)

    monkeypatch.setattr("agents.llm.datetime", FixedDatetime)
    headers = httpx.Headers({"retry-after": "Wed, 11 Nov 2026 12:00:15 GMT"})
    assert _retry_delay(headers, 0) == 15


def test_deepseek_uses_a_forced_strict_tool_and_native_token_parameter():
    seen = {}
    llm = _mock_llm("deepseek", seen=seen)
    assert llm.complete_structured("s", "u", SampleScore, max_tokens=512) == SampleScore(score=77)
    assert "response_format" not in seen
    assert "max_completion_tokens" not in seen
    assert seen["max_tokens"] == 512
    assert seen["thinking"] == {"type": "disabled"}
    assert seen["tool_choice"] == {"type": "function", "function": {"name": "SampleScore"}}
    function = seen["tools"][0]["function"]
    assert function["name"] == "SampleScore"
    assert function["strict"] is True
    assert function["parameters"]["properties"] == SampleScore.model_json_schema()["properties"]


@pytest.mark.parametrize("model", [MatchResult, ParsedCV, Opportunity])
def test_deepseek_inlines_nested_schemas_without_changing_validation_models(model):
    seen = {}
    llm = _mock_llm("deepseek", seen=seen)
    original = model.model_json_schema()
    llm.complete_structured("s", "u", model)
    parameters = seen["tools"][0]["function"]["parameters"]
    serialized = json.dumps(parameters)
    assert '"$ref"' not in serialized
    assert '"$defs"' not in serialized
    assert model.model_json_schema() == original
    if model is MatchResult:
        nested = parameters["properties"]["score_breakdown"]
        assert set(nested["properties"]) == {
            "field_alignment", "requirements_met", "experience_fit", "funding_fit", "location_fit",
        }
        assert nested["additionalProperties"] is False
    elif model is ParsedCV:
        education = parameters["properties"]["education"]["items"]
        assert set(education["properties"]) == {"degree", "institution", "field", "year"}
        assert {"type": "null"} in education["properties"]["field"]["anyOf"]


@pytest.mark.parametrize("calls", [
    [],
    [{"id": "wrong", "type": "function", "function": {"name": "wrong_name", "arguments": '{"score": 77}'}}],
    [
        {"id": "one", "type": "function", "function": {"name": "SampleScore", "arguments": '{"score": 77}'}},
        {"id": "two", "type": "function", "function": {"name": "SampleScore", "arguments": '{"score": 88}'}},
    ],
])
def test_deepseek_rejects_missing_wrong_or_multiple_tool_results(calls):
    body = {"choices": [{
        "finish_reason": "tool_calls", "message": {"role": "assistant", "tool_calls": calls},
    }]}
    llm = _http_llm("deepseek", lambda _: httpx.Response(200, json=body))
    assert llm.complete_structured("s", "u", SampleScore) is None


@pytest.mark.parametrize("provider, endpoint", [
    ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
    ("deepseek", "https://api.deepseek.com/beta/chat/completions"),
])
def test_new_providers_authenticate_only_to_their_own_endpoint(provider, endpoint):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": []})

    assert _http_llm(provider, handler).complete_structured("s", "u", SampleScore) is None
    assert str(requests[0].url) == endpoint
    assert requests[0].headers["authorization"] == "Bearer test-key"


@pytest.mark.parametrize("provider", ["openai", "groq", "gemini"])
@pytest.mark.parametrize("error", [
    {"code": "unsupported_value", "param": "response_format.type", "message": "PRIVATE_PROVIDER_TEXT"},
    {"code": "invalid_request_error", "message": "json_schema is not supported with this model: PRIVATE"},
])
def test_unsupported_structured_output_requires_a_model_change(provider, error, capsys):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(400, json={"error": error})

    with pytest.raises(LLMModelUnavailable, match="does not support structured output") as exc:
        _http_llm(provider, handler).complete_structured("s", "u", SampleScore)
    assert len(calls) == 1
    assert "PRIVATE" not in str(exc.value)
    assert "PRIVATE" not in capsys.readouterr().out
