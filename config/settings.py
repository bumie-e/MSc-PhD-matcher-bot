import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

COOKIE_ENCRYPTION_KEY = os.environ.get("COOKIE_ENCRYPTION_KEY", "")

# Models (Groq)
SEARCH_MODEL = "llama-3.1-8b-instant"
MATCH_MODEL = "llama-3.3-70b-versatile"
CV_STRUCTURE_MODEL = "llama-3.1-8b-instant"

# Research lab discovery rate limiting
LAB_DISCOVERY_MAX_LABS_PER_USER_PER_RUN = 20
LAB_DISCOVERY_REVISIT_COOLDOWN_DAYS = 7

# LinkedIn scraping
LINKEDIN_MAX_POSTS_PER_USER_PER_RUN = 20
LINKEDIN_HASHTAGS = ["phdposition", "phdopportunity", "mscopportunity"]
