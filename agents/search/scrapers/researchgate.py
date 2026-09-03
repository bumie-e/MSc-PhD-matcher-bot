"""ResearchGate professor profile crawler — Phase 5.

Qualitatively different from the keyword scrapers: instead of a known
listings page, this discovers candidate professor profiles via Tavily
(site:researchgate.net + the user's field/keywords), then uses Playwright
to visit each profile and look for hiring signals in the visible page text
("looking for PhD students", "recruiting", "open position", ...). PhD only
— ResearchGate profiles are academics, not funded MSc programs.

Visited profiles are cached per-user in `lab_visits` (status +
visited_at) so the same profile isn't re-crawled every run; see
agents/search/tools.py for the cooldown logic.
"""

from playwright.sync_api import sync_playwright
from tavily import TavilyClient

from agents.search.scrapers.base import RawListing
from config import settings

SOURCE_NAME = "researchgate"

HIRING_NOW_PHRASES = [
    "looking for a phd student",
    "looking for phd students",
    "seeking phd students",
    "seeking a phd candidate",
    "phd position available",
    "phd positions available",
    "recruiting phd",
    "now recruiting",
    "open phd position",
    "vacancy for a phd",
]
HIRING_SOON_PHRASES = [
    "will be recruiting",
    "planning to recruit",
    "upcoming phd position",
    "expect to have funding",
    "future phd opportunities",
]


def discover_profiles(field_of_study: str | None, keywords: list[str], max_results: int = 10) -> list[str]:
    """Tavily search for candidate ResearchGate profile URLs. Returns a
    deduplicated list of profile URLs, not RawListings — nothing is
    "found" until check_profile confirms a hiring signal."""
    if not settings.TAVILY_API_KEY:
        raise RuntimeError("TAVILY_API_KEY not set")

    terms = [t for t in [field_of_study, *keywords] if t]
    if not terms:
        return []

    client = TavilyClient(api_key=settings.TAVILY_API_KEY)
    urls: list[str] = []
    seen: set[str] = set()

    for term in terms:
        if len(urls) >= max_results:
            break
        query = f"site:researchgate.net {term} professor lab"
        result = client.search(query=query, max_results=5)
        for item in result.get("results", []):
            url = item.get("url", "")
            if "researchgate.net/profile/" in url and url not in seen:
                seen.add(url)
                urls.append(url)
                if len(urls) >= max_results:
                    break

    return urls


def _classify(text: str) -> str:
    lowered = text.lower()
    if any(phrase in lowered for phrase in HIRING_NOW_PHRASES):
        return "hiring_now"
    if any(phrase in lowered for phrase in HIRING_SOON_PHRASES):
        return "hiring_soon"
    return "not_hiring"


def check_profile(page, url: str) -> tuple[str, RawListing | None]:
    """Visit one profile with an already-open Playwright page. Returns
    (status, listing) — listing is only set for hiring_now/hiring_soon."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(1500)
        text = page.locator("body").inner_text()
    except Exception:  # noqa: BLE001 — a single unreachable/blocked profile shouldn't kill the run
        return "unclear", None

    if not text.strip():
        return "unclear", None

    status = _classify(text)
    if status not in ("hiring_now", "hiring_soon"):
        return status, None

    name_line = text.splitlines()[0][:120] if text else "Professor"
    listing = RawListing(
        title=f"PhD opportunity — {name_line}",
        source_url=url,
        source_name=SOURCE_NAME,
        snippet=text[:1000],
        extra={"status": status},
    )
    return status, listing


def search_for_profiles(profile_urls: list[str]) -> list[tuple[str, str, RawListing | None]]:
    """Visit each given profile URL once, returning [(url, status, listing)]."""
    results: list[tuple[str, str, RawListing | None]] = []
    if not profile_urls:
        return results

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        for url in profile_urls:
            status, listing = check_profile(page, url)
            results.append((url, status, listing))
        browser.close()

    return results
