"""Erasmus Mundus Catalogue scraper (EACEA). Joint master's programmes with
EU funding built in. Selectors unverified against live markup — re-inspect
the live page if search() returns zero results.
"""

import httpx
from bs4 import BeautifulSoup

from agents.search.scrapers.base import RawListing

BASE_URL = "https://eacea.ec.europa.eu/scholarships/erasmus-mundus-catalogue_en"
SOURCE_NAME = "erasmus_mundus"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; MSc-PhD-Matcher-Bot/1.0; "
        "+https://github.com/) research-opportunity-aggregator"
    )
}

SELECTORS = {
    "result_card": "div.views-row, article.node--type-programme",
    "title_link": "h3 a, .programme-title a",
    "snippet": ".programme-description, .field--name-body",
}


def search(keywords: list[str]) -> list[RawListing]:
    """Erasmus Mundus programmes are joint master's — filter client-side
    against the catalogue's full listing rather than a per-keyword query
    param, since the catalogue page doesn't expose fulltext search params."""
    listings: list[RawListing] = []
    keywords_lower = [k.lower() for k in keywords]

    with httpx.Client(headers=HEADERS, timeout=20.0, follow_redirects=True) as client:
        resp = client.get(BASE_URL)
        if resp.status_code != 200:
            return listings

        soup = BeautifulSoup(resp.text, "html.parser")
        for card in soup.select(SELECTORS["result_card"]):
            link = card.select_one(SELECTORS["title_link"])
            if not link or not link.get("href"):
                continue

            title = link.get_text(strip=True)
            snippet_el = card.select_one(SELECTORS["snippet"])
            snippet = snippet_el.get_text(strip=True) if snippet_el else ""

            haystack = f"{title} {snippet}".lower()
            if not any(kw in haystack for kw in keywords_lower):
                continue

            href = link["href"]
            source_url = href if href.startswith("http") else f"https://eacea.ec.europa.eu{href}"

            listings.append(
                RawListing(
                    title=title,
                    source_url=source_url,
                    source_name=SOURCE_NAME,
                    snippet=snippet,
                    raw_html=str(card),
                )
            )

    return listings
