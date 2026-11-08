from datetime import datetime, timedelta, timezone

from agents.db import get_client
from agents.redact import err, uid
from agents.search.scrapers import researchgate, tavily_search, university_search
from agents.search.scrapers.base import RawListing
from agents.search.scrapers.registry import GLOBAL_KEYWORD_SCRAPERS
from config import settings


def get_all_user_keywords() -> list[dict]:
    """Return [{user_id, keywords, field_of_study, degree_type, target_countries,
    target_universities}] for every onboarded user, so the search agent can
    build one deduplicated global query set instead of re-searching per user."""
    db = get_client()
    resp = (
        db.table("user_profiles")
        .select("id, keywords, field_of_study, degree_type, target_countries, target_universities")
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
            "target_universities": row["target_universities"] or [],
        }
        for row in resp.data
    ]


def collect_global_keywords(user_rows: list[dict]) -> list[str]:
    seen: set[str] = set()
    for row in user_rows:
        if row["field_of_study"]:
            seen.add(row["field_of_study"])
        seen.update(row["keywords"])
    if not seen:
        # Nobody has set interests yet: still fill the shared, browsable pool.
        seen.update(settings.DEFAULT_SEARCH_KEYWORDS)
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
    """Run every keyword-based scraper (everything except Tavily, which is an explicit catch-all tool)."""
    listings: list[dict] = []
    for source_name in GLOBAL_KEYWORD_SCRAPERS:
        try:
            listings.extend(scrape_source(source_name, keywords))
        except Exception as exc:  # noqa: BLE001 — one source failing shouldn't kill the run
            print(f"[{source_name}] scrape failed: {err(exc)}")
    return listings


def tavily_search_tool(keywords: list[str]) -> list[dict]:
    return _listings_to_dicts(tavily_search.search(keywords))


def scrape_universities_for_user(
    user_id: str, target_universities: list[str], keywords: list[str]
) -> list[dict]:
    """Search each of a user's named target universities for openings
    matching their keywords/field of study. One user's bad/unrecognized
    university name shouldn't block the others."""
    listings: list[dict] = []
    for university in target_universities:
        try:
            listings.extend(_listings_to_dicts(university_search.search_for_university(university, keywords)))
        except Exception as exc:  # noqa: BLE001 — one university failing shouldn't kill the run
            print(f"[university_search] scrape failed for '{university}' (user {uid(user_id)}): {err(exc)}")
    return listings


def scrape_researchgate_for_user(user_id: str, field_of_study: str | None, keywords: list[str]) -> list[dict]:
    """Discover candidate ResearchGate professor profiles for this user's
    field/keywords, skip any visited within the cooldown window, crawl the
    rest, cache the resulting status in lab_visits, and return listings
    for anyone found to be hiring."""
    db = get_client()

    try:
        candidate_urls = researchgate.discover_profiles(
            field_of_study, keywords, max_results=settings.LAB_DISCOVERY_MAX_LABS_PER_USER_PER_RUN
        )
    except Exception as exc:  # noqa: BLE001 — Tavily hiccup shouldn't kill the run
        print(f"[researchgate] profile discovery failed for user {uid(user_id)}: {err(exc)}")
        return []

    if not candidate_urls:
        return []

    cooldown = timedelta(days=settings.LAB_DISCOVERY_REVISIT_COOLDOWN_DAYS)
    cutoff = (datetime.now(timezone.utc) - cooldown).isoformat()
    resp = (
        db.table("lab_visits")
        .select("lab_url, visited_at")
        .eq("user_id", user_id)
        .in_("lab_url", candidate_urls)
        .gte("visited_at", cutoff)
        .execute()
    )
    recently_visited = {row["lab_url"] for row in resp.data}
    to_visit = [url for url in candidate_urls if url not in recently_visited]
    if not to_visit:
        return []

    try:
        results = researchgate.search_for_profiles(to_visit)
    except Exception as exc:  # noqa: BLE001 — Playwright/browser failure shouldn't kill the run
        print(f"[researchgate] crawl failed for user {uid(user_id)}: {err(exc)}")
        return []

    now = datetime.now(timezone.utc).isoformat()
    visit_rows = [
        {"user_id": user_id, "lab_url": url, "status": status, "visited_at": now}
        for url, status, _ in results
    ]
    if visit_rows:
        db.table("lab_visits").upsert(visit_rows, on_conflict="user_id,lab_url").execute()

    return _listings_to_dicts([listing for _, _, listing in results if listing])


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

    try:
        resp = db.table("opportunities").insert(opportunities).execute()
        return [row["id"] for row in resp.data]
    except Exception as exc:  # noqa: BLE001 — one bad row must not lose the whole batch
        print(f"Batch insert failed ({err(exc)}); retrying opportunities one at a time.")
        ids: list[str] = []
        for opp in opportunities:
            try:
                resp = db.table("opportunities").insert(opp).execute()
                ids.extend(row["id"] for row in resp.data)
            except Exception as row_exc:  # noqa: BLE001
                print(f"Skipping opportunity {opp.get('source_url')}: {err(row_exc)}")
        return ids


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
