"""Tavily web search — catch-all for sources not covered by a dedicated
scraper (professor lab pages, niche portals, unlisted openings). Also the
first step in the Phase 3 research lab discovery loop.
"""

from tavily import TavilyClient

from agents.search.scrapers.base import RawListing
from config import settings

SOURCE_NAME = "tavily"


def search(keywords: list[str], max_results_per_keyword: int = 5) -> list[RawListing]:
    if not settings.TAVILY_API_KEY:
        raise RuntimeError("TAVILY_API_KEY not set")

    client = TavilyClient(api_key=settings.TAVILY_API_KEY)
    listings: list[RawListing] = []

    for keyword in keywords:
        query = f"{keyword} PhD OR MSc opportunity application deadline"
        result = client.search(query=query, max_results=max_results_per_keyword)

        for item in result.get("results", []):
            listings.append(
                RawListing(
                    title=item.get("title", ""),
                    source_url=item.get("url", ""),
                    source_name=SOURCE_NAME,
                    snippet=item.get("content", "")[:1000],
                )
            )

    return listings
