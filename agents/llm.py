from functools import lru_cache

from openai import OpenAI

from config import settings


@lru_cache(maxsize=1)
def get_groq_client() -> OpenAI:
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")
    return OpenAI(api_key=settings.GROQ_API_KEY, base_url=settings.GROQ_BASE_URL)
