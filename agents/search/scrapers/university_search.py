"""Per-user targeted search: for users who named specific
`target_universities`, search each university for openings matching their
keywords/field of study. Uses Tavily with the university name folded into
the query text rather than domain filtering, since users type free-form
names ("ETH Zurich") rather than domains.
"""

from tavily import TavilyClient

from agents.search.scrapers.base import RawListing
from config import settings

SOURCE_NAME = "university_search"


def search_for_university(
    university: str, keywords: list[str], max_results_per_keyword: int = 3
) -> list[RawListing]:
    if not settings.TAVILY_API_KEY:
        raise RuntimeError("TAVILY_API_KEY not set")

    client = TavilyClient(api_key=settings.TAVILY_API_KEY)
    listings: list[RawListing] = []
    terms = keywords or [""]

    for keyword in terms:
        query = f"{university} {keyword} PhD OR Masters open position application deadline".strip()
        result = client.search(query=query, max_results=max_results_per_keyword)

        for item in result.get("results", []):
            listings.append(
                RawListing(
                    title=item.get("title", ""),
                    source_url=item.get("url", ""),
                    source_name=SOURCE_NAME,
                    university=university,
                    snippet=item.get("content", "")[:1000],
                )
            )

    return listings
