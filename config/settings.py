import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

COOKIE_ENCRYPTION_KEY = os.environ.get("COOKIE_ENCRYPTION_KEY", "")

# The owner's Groq key only structures the shared opportunity pool. Personalised
# work (CV reading, match scoring) uses each user's own key and model; see agents/llm.py.

# Models (Groq) — Llama 3.x was deprecated/removed from Groq's catalog
# after this project started; verified against GET /openai/v1/models on
# 2026-09-02 and switched to the still-available gpt-oss family.
SEARCH_MODEL = "openai/gpt-oss-20b"

# Per-user match cost guard: openings scored per user per run. The user pays
# for these calls on their own key, so a run is capped.
MATCH_MAX_PER_USER_PER_RUN = 40

# An opening is hidden for everyone only when this many distinct users' models
# independently call it a non-posting (one verdict could be prompt-injected).
INVALIDATE_MIN_VOTES = 2

# Keeps the shared pool populated (and browsable) even before anyone has
# filled in their interests.
DEFAULT_SEARCH_KEYWORDS = ["PhD position", "MSc scholarship", "fully funded PhD", "research assistantship"]

# Research lab discovery rate limiting
LAB_DISCOVERY_MAX_LABS_PER_USER_PER_RUN = 20
LAB_DISCOVERY_REVISIT_COOLDOWN_DAYS = 7

