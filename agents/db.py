from functools import lru_cache

from config import settings
from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_client() -> Client:
    """Service-role Supabase client. Only used inside GitHub Actions —
    never expose this key to the frontend."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
