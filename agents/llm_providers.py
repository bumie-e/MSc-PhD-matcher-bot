"""Provider adapters: translate native requests, responses, and transport errors.

Retries and response-model validation belong to the shared LLM facade.
"""

from abc import ABC, abstractmethod

import httpx
import openai

from config import settings


class ProviderHTTPError(Exception):
    """Safe HTTP metadata. Never include a provider error message or response body."""

    def __init__(self, status: int, code: str | None, headers: httpx.Headers):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.code = code if isinstance(code, str) else None
        self.headers = headers


class ProviderConnectionError(Exception):
    """A timeout or network failure, without provider/request text."""


class ProviderResponseError(Exception):
    """An unreadable provider response, without its contents."""


def _error_code(code: str | None, message: str, param: str | None = None) -> str | None:
    """Recognize a model capability failure without retaining provider text."""
    code = code if isinstance(code, str) else None
    message = message.lower() if isinstance(message, str) else ""
    format_param = isinstance(param, str) and param.startswith("response_format")
    if format_param and code in {"unsupported_parameter", "unsupported_value"}:
        return "structured_output_unsupported"
    if ("model" in message and any(field in message for field in ("json_schema", "response_format"))
            and any(term in message for term in ("not supported", "does not support", "unsupported"))):
        return "structured_output_unsupported"
    return code


class BaseLLMProvider(ABC):
    """Base contract for every provider used by the LLM facade.

    Subclasses implement native API translation in complete(). The facade owns
    retries, response-model validation, and the HTTP client's lifecycle.
    """

    def __init__(self, api_key: str, model: str, http_client: httpx.Client):
        self.model = model
        self._api_key = api_key
        self._http = http_client

    @abstractmethod
    def complete(self, system: str, user: str, schema_name: str, schema: dict, max_tokens: int) -> str | None:
        """Return completed JSON text, or None for a refusal or incomplete response.

        Translate failures into ProviderHTTPError, ProviderConnectionError, or
        ProviderResponseError so callers retain the shared error/retry policy.
        """
        raise NotImplementedError


class OpenAICompatibleProvider(BaseLLMProvider):
    """Shared transport for providers exposing Chat Completions APIs."""

    base_url: str | None = None

    def __init__(self, api_key: str, model: str, http_client: httpx.Client):
        super().__init__(api_key, model, http_client)
        # The facade owns retries. Reuse one SDK client and connection pool.
        self._client = openai.OpenAI(
            api_key=api_key, base_url=self.base_url, max_retries=0, http_client=http_client,
        )

    def request_options(self) -> dict:
        return {}

    def format_options(self, schema_name: str, schema: dict) -> dict:
        return {"response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        }}

    def token_options(self, max_tokens: int) -> dict:
        return {"max_completion_tokens": max_tokens}

    def extract_text(self, resp, schema_name: str) -> str | None:
        if not resp.choices:
            return None
        choice = resp.choices[0]
        if choice.finish_reason != "stop" or choice.message.refusal:
            return None
        text = choice.message.content
        return text if isinstance(text, str) else None

    def complete(self, system: str, user: str, schema_name: str, schema: dict, max_tokens: int) -> str | None:
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                **self.format_options(schema_name, schema),
                **self.token_options(max_tokens),
                **self.request_options(),
            )
        except openai.APIStatusError as exc:
            code = exc.code
            if exc.status_code in (400, 422):
                code = _error_code(code, exc.message, exc.param)
            raise ProviderHTTPError(exc.status_code, code, exc.response.headers) from None
        except (openai.APIConnectionError, httpx.TransportError):
            raise ProviderConnectionError() from None
        except (openai.APIError, ValueError):
            raise ProviderResponseError() from None

        # SDK deserialization can accept missing/wrong fields on a 200 response.
        try:
            return self.extract_text(resp, schema_name)
        except (AttributeError, TypeError, IndexError):
            raise ProviderResponseError() from None


class OpenAIProvider(OpenAICompatibleProvider):
    def request_options(self) -> dict:
        # Older GPT models reject reasoning_effort.
        return {"reasoning_effort": "low"} if self.model.startswith("gpt-5") else {}


class GroqProvider(OpenAICompatibleProvider):
    base_url = settings.GROQ_BASE_URL

    def request_options(self) -> dict:
        # GPT-OSS spends the completion budget on reasoning as well as JSON.
        # Other models may reject this option; leave their defaults alone.
        if self.model in {"openai/gpt-oss-20b", "openai/gpt-oss-120b"}:
            return {"extra_body": {"reasoning_effort": "low"}}
        return {}


class GeminiProvider(OpenAICompatibleProvider):
    base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"

    def request_options(self) -> dict:
        if self.model.startswith(("gemini-2.5-", "gemini-3", "gemini-4")):
            return {"reasoning_effort": "low"}
        return {}


def _inline_schema(schema: dict) -> dict:
    """Inline local references for DeepSeek's strict tool schema parser.

    Keep the original schema unchanged for shared Pydantic validation.
    """
    def expand(node, seen: frozenset[str] = frozenset()):
        if isinstance(node, list):
            return [expand(value, seen) for value in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            ref = node["$ref"]
            if not ref.startswith("#/") or ref in seen:
                raise ValueError("DeepSeek requires non-recursive local schema references")
            target = schema
            for part in ref[2:].split("/"):
                target = target[part.replace("~1", "/").replace("~0", "~")]
            return expand({**target, **{k: v for k, v in node.items() if k != "$ref"}}, seen | {ref})
        return {key: expand(value, seen) for key, value in node.items() if key != "$defs"}

    return expand(schema)


class DeepSeekProvider(OpenAICompatibleProvider):
    # DeepSeek enforces schemas through strict tool calls on its beta endpoint.
    base_url = "https://api.deepseek.com/beta"

    def request_options(self) -> dict:
        # Forced tool selection requires non-thinking mode.
        return {"extra_body": {"thinking": {"type": "disabled"}}}

    def token_options(self, max_tokens: int) -> dict:
        return {"max_tokens": max_tokens}

    def format_options(self, schema_name: str, schema: dict) -> dict:
        return {
            "tools": [{"type": "function", "function": {
                "name": schema_name,
                "description": "Return the requested structured result using every field in this schema.",
                "strict": True,
                "parameters": _inline_schema(schema),
            }}],
            "tool_choice": {"type": "function", "function": {"name": schema_name}},
        }

    def extract_text(self, resp, schema_name: str) -> str | None:
        if not resp.choices:
            return None
        choice = resp.choices[0]
        if choice.finish_reason != "tool_calls" or choice.message.refusal:
            return None
        calls = choice.message.tool_calls or []
        if len(calls) != 1 or calls[0].type != "function" or calls[0].function.name != schema_name:
            return None
        arguments = calls[0].function.arguments
        return arguments if isinstance(arguments, str) else None


class AnthropicProvider(BaseLLMProvider):
    def complete(self, system: str, user: str, schema_name: str, schema: dict, max_tokens: int) -> str | None:
        try:
            resp = self._http.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                    "output_config": {"format": {"type": "json_schema", "schema": schema}},
                },
            )
        except httpx.TransportError:
            raise ProviderConnectionError() from None

        if resp.is_error:
            code = None
            try:
                error = resp.json().get("error") or {}
                code = error.get("code") or error.get("type")
            except (ValueError, AttributeError):
                pass
            raise ProviderHTTPError(resp.status_code, code, resp.headers)
        try:
            body = resp.json()
            if body.get("stop_reason") != "end_turn":
                return None
            blocks = body.get("content") or []
            return "".join(b.get("text", "") for b in blocks if b.get("type") == "text") or None
        except (ValueError, AttributeError, TypeError):
            raise ProviderResponseError() from None


PROVIDERS: dict[str, type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "groq": GroqProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "deepseek": DeepSeekProvider,
}
