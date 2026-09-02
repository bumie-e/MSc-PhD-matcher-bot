import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

COOKIE_ENCRYPTION_KEY = os.environ.get("COOKIE_ENCRYPTION_KEY", "")

# Models (Groq) — Llama 3.x was deprecated/removed from Groq's catalog
# after this project started; verified against GET /openai/v1/models on
# 2026-09-02 and switched to the still-available gpt-oss family.
SEARCH_MODEL = "openai/gpt-oss-20b"
MATCH_MODEL = "openai/gpt-oss-120b"
CV_STRUCTURE_MODEL = "openai/gpt-oss-20b"

# Research lab discovery rate limiting
LAB_DISCOVERY_MAX_LABS_PER_USER_PER_RUN = 20
LAB_DISCOVERY_REVISIT_COOLDOWN_DAYS = 7

# LinkedIn scraping
LINKEDIN_MAX_POSTS_PER_USER_PER_RUN = 20
LINKEDIN_HASHTAGS = ["phdposition", "phdopportunity", "mscopportunity"]
