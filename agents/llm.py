"""LLM access for the agents.

Two kinds of callers:

* Personalised work (reading a CV, scoring matches) uses the *user's own* API
  key, loaded and decrypted by `get_user_llm(user_id)`. Supported providers are
  Groq, OpenAI and Anthropic. The key never leaves the Actions runner.
* The shared search agent structures scraped listings into the common
  `opportunities` pool with the project owner's Groq key (`get_owner_llm()`).
  One shared pass, not a per-user cost.

Every provider is wrapped behind `LLM.complete_json(system, user)`, which
returns a parsed JSON object, or None when the model returned something
unusable. Auth failures raise `LLMAuthError` (the caller should stop using that
key); rate limits raise `LLMRateLimitError` after a few retries.
"""

import json
import re
import time

import httpx
import openai

from agents.db import get_client
from config import settings

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

OPENAI_COMPATIBLE_BASE_URLS = {
    "groq": settings.GROQ_BASE_URL,
    "openai": None,  # SDK default
}

MAX_RETRIES = 3


class LLMError(Exception):
    """Base class for provider failures the agents handle explicitly."""


class LLMKeyMissing(LLMError):
    """The user has not connected a usable LLM key."""


class LLMAuthError(LLMError):
    """The provider rejected the key (invalid, revoked, or out of access)."""


class LLMRateLimitError(LLMError):
    """The provider kept returning rate-limit / overload responses."""


class LLMModelUnavailable(LLMError):
    """The key works, but the chosen model was retired or is not accessible."""


# Error codes providers use when a model no longer exists (OpenAI, Groq).
_MODEL_GONE_CODES = {"model_not_found", "model_decommissioned", "model_not_active", "model_deprecated"}


def _model_is_gone(exc: openai.APIStatusError) -> bool:
    return isinstance(exc, openai.NotFoundError) or getattr(exc, "code", None) in _MODEL_GONE_CODES


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json(text: str | None) -> dict | None:
    """Parse a JSON object out of model text. Tolerates code fences and prose
    around the object (Anthropic has no JSON mode). Returns None unless the
    result is a JSON object."""
    if not text:
        return None
    candidate = _FENCE.sub("", text.strip())
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            parsed = json.loads(candidate[start : end + 1])
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, dict) else None


class LLM:
    def __init__(self, provider: str, api_key: str, model: str, http_client: httpx.Client | None = None):
        if provider not in ("groq", "openai", "anthropic"):
            raise ValueError(f"Unsupported provider: {provider}")
        self.provider = provider
        self.model = model
        self._api_key = api_key
        self._http = http_client or httpx.Client(timeout=120.0)

    def complete_json(self, system: str, user: str, max_tokens: int = 4096) -> dict | None:
        for attempt in range(MAX_RETRIES):
            try:
                if self.provider == "anthropic":
                    text = self._anthropic(system, user, max_tokens)
                else:
                    text = self._openai_compatible(system, user, max_tokens)
                return extract_json(text)
            except (openai.AuthenticationError, openai.PermissionDeniedError) as exc:
                # No provider text in the message: OpenAI echoes a masked key, and
                # these messages end up in public Actions logs.
                raise LLMAuthError(f"{self.provider} rejected the API key") from exc
            except openai.RateLimitError as exc:
                if attempt == MAX_RETRIES - 1:
                    raise LLMRateLimitError(f"{self.provider} rate limit") from exc
                time.sleep(2 ** (attempt + 1))
            except _RetryableHTTP as exc:
                if attempt == MAX_RETRIES - 1:
                    raise LLMRateLimitError(f"{self.provider} is busy or rate limited: {exc}") from exc
                time.sleep(2 ** (attempt + 1))
            except openai.APIStatusError as exc:
                if _model_is_gone(exc):
                    gone = f"{self.provider} model {self.model} is no longer available"
                    raise LLMModelUnavailable(gone) from exc
                status = getattr(exc, "status_code", None)
                print(f"{self.provider} request failed ({type(exc).__name__}, status={status})")
                return None
            except openai.APIError as exc:
                # One malformed or truncated generation must not end the whole run.
                # Log only the error type and status: provider error bodies can
                # contain pieces of the CV or opportunity text.
                status = getattr(exc, "status_code", None)
                print(f"{self.provider} request failed ({type(exc).__name__}, status={status})")
                return None
            except httpx.HTTPError as exc:
                print(f"{self.provider} network error ({type(exc).__name__})")
                return None
        return None

    def _openai_compatible(self, system: str, user: str, max_tokens: int) -> str | None:
        client = openai.OpenAI(
            api_key=self._api_key, base_url=OPENAI_COMPATIBLE_BASE_URLS[self.provider], max_retries=0
        )
        kwargs: dict = {}
        if self.provider == "openai" and re.match(r"^gpt-5", self.model):
            # GPT-5 models reason before answering; keep that small so the token
            # budget is left for the JSON. Older GPT models reject this parameter.
            kwargs["extra_body"] = {"reasoning_effort": "low"}
        if self.provider == "groq":
            # gpt-oss models emit a hidden reasoning trace before the JSON body;
            # without this it can eat the whole token budget and leave empty
            # content (json_validate_failed). Groq-specific, so via extra_body.
            kwargs["extra_body"] = {"reasoning_effort": "low"}
        resp = client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            max_completion_tokens=max_tokens,
            **kwargs,
        )
        return resp.choices[0].message.content if resp.choices else None

    def _anthropic(self, system: str, user: str, max_tokens: int) -> str | None:
        resp = self._http.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": self._api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": max_tokens,
                "system": system + "\n\nRespond with a single JSON object and nothing else.",
                "messages": [{"role": "user", "content": user}],
            },
        )
        if resp.status_code in (401, 403):
            raise LLMAuthError(f"anthropic rejected the API key (HTTP {resp.status_code})")
        if resp.status_code == 404:
            # The messages endpoint exists, so a 404 means this model does not.
            raise LLMModelUnavailable(f"anthropic model {self.model} is no longer available")
        if resp.status_code in (429, 500, 502, 503, 529):
            raise _RetryableHTTP(f"HTTP {resp.status_code}")
        if resp.status_code >= 400:
            print(f"anthropic request failed: HTTP {resp.status_code}")
            return None
        blocks = resp.json().get("content") or []
        return "".join(b.get("text", "") for b in blocks if b.get("type") == "text") or None


class _RetryableHTTP(Exception):
    pass


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
