from agents import crypto
from agents.db import get_client
from agents.search.scrapers import linkedin_posts, tavily_search
from agents.search.scrapers.base import RawListing
from agents.search.scrapers.registry import GLOBAL_KEYWORD_SCRAPERS


def get_all_user_keywords() -> list[dict]:
    """Return [{user_id, keywords, field_of_study, degree_type, target_countries}]
    for every onboarded user, so the search agent can build one deduplicated
    global query set instead of re-searching per user."""
    db = get_client()
    resp = (
        db.table("user_profiles")
        .select("id, keywords, field_of_study, degree_type, target_countries")
        .gte("onboarding_step", 5)
        .execute()
    )
    return [
        {
            "user_id": row["id"],
            "keywords": row["keywords"] or [],
            "field_of_study": row["field_of_study"],
            "degree_type": row["degree_type"],
            "target_countries": row["target_countries"] or [],
        }
        for row in resp.data
    ]


def collect_global_keywords(user_rows: list[dict]) -> list[str]:
    seen: set[str] = set()
    for row in user_rows:
        if row["field_of_study"]:
            seen.add(row["field_of_study"])
        seen.update(row["keywords"])
    return sorted(seen)


def _listings_to_dicts(listings: list[RawListing]) -> list[dict]:
    return [
        {
            "title": listing.title,
            "source_url": listing.source_url,
            "source_name": listing.source_name,
            "university": listing.university,
            "snippet": listing.snippet,
        }
        for listing in listings
    ]


def scrape_source(source_name: str, keywords: list[str]) -> list[dict]:
    """Run one of the keyword-based scrapers by name. Used both directly by
    the search agent's main loop and as the Groq tool-call target."""
    scraper = GLOBAL_KEYWORD_SCRAPERS.get(source_name)
    if not scraper:
        raise ValueError(f"Unknown source: {source_name}")
    return _listings_to_dicts(scraper(keywords))


def scrape_all_global_sources(keywords: list[str]) -> list[dict]:
    """Run every keyword-based scraper (everything except LinkedIn, which is
    per-user, and Tavily, which is an explicit catch-all tool)."""
    listings: list[dict] = []
    for source_name in GLOBAL_KEYWORD_SCRAPERS:
        try:
            listings.extend(scrape_source(source_name, keywords))
        except Exception as exc:  # noqa: BLE001 — one source failing shouldn't kill the run
            print(f"[{source_name}] scrape failed: {exc}")
    return listings


def tavily_search_tool(keywords: list[str]) -> list[dict]:
    return _listings_to_dicts(tavily_search.search(keywords))


def get_user_linkedin_cookie(user_id: str) -> str | None:
    """Fetch and decrypt a user's li_at cookie. Returns None if the user
    hasn't connected LinkedIn — callers should skip the LinkedIn step, not
    error out."""
    db = get_client()
    resp = db.table("linkedin_sessions").select("cookie_enc").eq("user_id", user_id).execute()
    if not resp.data:
        return None
    return crypto.decrypt_cookie(resp.data[0]["cookie_enc"])


def scrape_linkedin_for_user(user_id: str) -> list[dict]:
    cookie = get_user_linkedin_cookie(user_id)
    if not cookie:
        return []
    try:
        return _listings_to_dicts(linkedin_posts.search_for_user(cookie))
    except Exception as exc:  # noqa: BLE001 — a stale/invalid cookie shouldn't kill the run
        print(f"[linkedin_posts] scrape failed for user {user_id}: {exc}")
        return []


def check_existing(source_urls: list[str]) -> set[str]:
    """Return the subset of source_urls already present in opportunities."""
    if not source_urls:
        return set()
    db = get_client()
    resp = db.table("opportunities").select("source_url").in_("source_url", source_urls).execute()
    return {row["source_url"] for row in resp.data}


def write_opportunities(opportunities: list[dict]) -> list[str]:
    """Insert new opportunity rows, return their ids. `requirements` and
    `contact_info` must already be dicts (JSONB columns)."""
    if not opportunities:
        return []
    db = get_client()
    for opp in opportunities:
        opp.setdefault("requirements", {})
        opp.setdefault("contact_info", {})
    resp = db.table("opportunities").insert(opportunities).execute()
    return [row["id"] for row in resp.data]


TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "scrape_source",
            "description": (
                "Search one named source (findaphd, findamasters, phdportal, "
                "universitypositions, euraxess, erasmus_mundus, profellow, "
                "daad, scholarshipdb, fulbright) for listings matching the given keywords."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "source_name": {"type": "string", "enum": list(GLOBAL_KEYWORD_SCRAPERS)},
                    "keywords": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["source_name", "keywords"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "tavily_search_tool",
            "description": (
                "Catch-all web search for opportunities not covered by a dedicated "
                "source — professor lab pages, niche portals, unlisted openings."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "keywords": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["keywords"],
            },
        },
    },
]


def dispatch_tool_call(name: str, arguments: dict):
    if name == "scrape_source":
        return scrape_source(**arguments)
    if name == "tavily_search_tool":
        return tavily_search_tool(**arguments)
    raise ValueError(f"Unknown tool: {name}")
