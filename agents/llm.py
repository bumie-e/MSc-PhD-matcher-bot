"""LLM access for the agents.

Two kinds of callers:

* Personalised work (reading a CV, scoring matches) uses the *user's own* API
  key, loaded and decrypted by `get_user_llm(user_id)`. Supported providers are
  Groq, OpenAI, Anthropic, Gemini and DeepSeek. Keys are only sent to their
  respective providers for authentication.
* The shared search agent structures scraped listings into the common
  `opportunities` pool with the project owner's Groq key (`get_owner_llm()`).
  One shared pass, not a per-user cost.

Every provider is wrapped behind `LLM.complete_structured(system, user, schema)`,
which requests JSON Schema output and returns a validated Pydantic model, or
None when the response is unusable. Auth failures raise `LLMAuthError` (the
caller should stop using that key); rate limits raise `LLMRateLimitError`
after a few retries. The selected model must support JSON Schema output.
"""

import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from math import isfinite
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from agents.db import get_client
from agents.llm_providers import (
    PROVIDERS,
    BaseLLMProvider,
    ProviderConnectionError,
    ProviderHTTPError,
    ProviderResponseError,
)
from config import settings

MAX_RETRIES = 3
MAX_RETRY_DELAY = 60.0
ResponseT = TypeVar("ResponseT", bound=BaseModel)


class LLMError(Exception):
    """Base class for provider failures the agents handle explicitly."""


class LLMKeyMissing(LLMError):
    """The user has not connected a usable LLM key."""


class LLMAuthError(LLMError):
    """The provider rejected the key (invalid, revoked, or out of access)."""


class LLMUnavailableError(LLMError):
    """The provider stayed unavailable after bounded retries."""


class LLMRateLimitError(LLMUnavailableError):
    """The provider kept returning rate-limit responses."""


class LLMModelUnavailable(LLMError):
    """The key works, but the chosen model was retired or is not accessible."""


# Error codes providers use when a model no longer exists (OpenAI, Groq).
_MODEL_GONE_CODES = {"model_not_found", "model_decommissioned", "model_not_active", "model_deprecated"}


def _retry_delay(headers: httpx.Headers, attempt: int) -> float:
    """Honor Retry-After (seconds or HTTP date), with exponential backoff otherwise."""
    milliseconds = headers.get("retry-after-ms")
    if milliseconds is not None:
        try:
            delay = float(milliseconds) / 1000
            if isfinite(delay) and delay >= 0:
                return delay
        except ValueError:
            pass
    retry_after = headers.get("retry-after")
    if retry_after is not None:
        try:
            delay = float(retry_after)
        except ValueError:
            try:
                retry_date = parsedate_to_datetime(retry_after)
                delay = (retry_date - datetime.now(timezone.utc)).total_seconds()
            except (ValueError, TypeError, OverflowError):
                delay = -1
        if isfinite(delay) and delay >= 0:
            return delay
    return 2 ** (attempt + 1)


class LLM:
    def __init__(self, provider: str, api_key: str, model: str, http_client: httpx.Client | None = None):
        if provider not in PROVIDERS:
            raise ValueError(f"Unsupported provider: {provider}")
        self.provider = provider
        self.model = model
        self._owns_http = http_client is None
        self._http = http_client or httpx.Client(timeout=120.0)
        self._adapter: BaseLLMProvider = PROVIDERS[provider](api_key, model, self._http)

    def close(self) -> None:
        """Close the connection pool if this instance created it."""
        if self._owns_http:
            self._http.close()

    def __enter__(self) -> "LLM":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    def complete_structured(
        self, system: str, user: str, response_model: type[ResponseT], max_tokens: int = 4096
    ) -> ResponseT | None:
        """Request schema-constrained output; never recover JSON from free text."""
        schema = response_model.model_json_schema()
        for attempt in range(MAX_RETRIES):
            try:
                text = self._adapter.complete(system, user, response_model.__name__, schema, max_tokens)
                if not text:
                    return None
                return response_model.model_validate_json(text, strict=True)
            except ValidationError:
                # Validation errors include input values: never log CV/listing text.
                print(f"{self.provider} returned invalid structured output")
                return None
            except ProviderHTTPError as exc:
                if exc.status in (401, 403):
                    raise LLMAuthError(f"{self.provider} rejected the API key") from None
                if exc.code == "structured_output_unsupported":
                    raise LLMModelUnavailable(
                        f"{self.provider} model {self.model} does not support structured output"
                    ) from None
                if exc.status == 404 or exc.code in _MODEL_GONE_CODES:
                    gone = f"{self.provider} model {self.model} is no longer available"
                    raise LLMModelUnavailable(gone) from None
                if exc.status in (408, 409, 429) or exc.status >= 500:
                    error_type = LLMRateLimitError if exc.status == 429 else LLMUnavailableError
                    delay = _retry_delay(exc.headers, attempt)
                    # A long server delay stops this run; never retry earlier than requested.
                    if attempt == MAX_RETRIES - 1 or delay > MAX_RETRY_DELAY:
                        raise error_type(f"{self.provider} unavailable (HTTP {exc.status})") from None
                    time.sleep(delay)
                    continue
                print(f"{self.provider} request failed (status={exc.status})")
                return None
            except ProviderConnectionError:
                if attempt == MAX_RETRIES - 1:
                    raise LLMUnavailableError(f"{self.provider} could not be reached") from None
                time.sleep(2 ** (attempt + 1))
            except ProviderResponseError:
                print(f"{self.provider} returned an unreadable response")
                return None
        return None


def get_owner_llm() -> LLM:
    """The project owner's Groq key, used only for the shared search pipeline."""
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    return LLM("groq", settings.GROQ_API_KEY, settings.SEARCH_MODEL)


def get_user_llm(user_id: str) -> LLM:
    """Load and decrypt a user's own key. Raises LLMKeyMissing if they have
    none, or if the stored key was previously rejected by the provider."""
    from agents import crypto  # local import: crypto needs COOKIE_ENCRYPTION_KEY only here

    db = get_client()
    resp = (
        db.table("user_llm_keys")
        .select("provider, model, key_enc, status, status_message")
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise LLMKeyMissing("No AI key connected.")
    row = resp.data[0]
    if row["status"] != "valid":
        raise LLMKeyMissing(row.get("status_message") or "Your AI key was rejected. Replace it in Settings.")
    return LLM(row["provider"], crypto.decrypt_cookie(row["key_enc"]), row["model"])


def mark_key_status(user_id: str, status: str, message: str) -> None:
    """Record why a user's key cannot be used right now, so the UI can tell
    them what to fix and the agents stop trying. status: invalid | model_unavailable."""
    db = get_client()
    db.table("user_llm_keys").update({"status": status, "status_message": message[:300]}).eq(
        "user_id", user_id
    ).execute()


def mark_key_invalid(user_id: str, message: str) -> None:
    mark_key_status(user_id, "invalid", message)
