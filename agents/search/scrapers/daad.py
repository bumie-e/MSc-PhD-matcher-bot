"""DAAD scholarship database scraper.

Correction from the original plan: DAAD has no public JSON API — confirmed
by inspecting the live search page, which is a standard web form with
query params, not a documented API. This is a scraper like the others.
"""

import httpx
from bs4 import BeautifulSoup

from agents.search.scrapers.base import RawListing

BASE_URL = "https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/"
SOURCE_NAME = "daad"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; MSc-PhD-Matcher-Bot/1.0; "
        "+https://github.com/) research-opportunity-aggregator"
    )
}

SELECTORS = {
    "result_card": "div.c-teaser, tr.scholarship-row",
    "title_link": "a.c-teaser__link, td a",
    "snippet": ".c-teaser__text, .scholarship-summary",
}


def search(keywords: list[str]) -> list[RawListing]:
    listings: list[RawListing] = []

    with httpx.Client(headers=HEADERS, timeout=20.0, follow_redirects=True) as client:
        for keyword in keywords:
            resp = client.get(BASE_URL, params={"q": keyword})
            if resp.status_code != 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            for card in soup.select(SELECTORS["result_card"]):
                link = card.select_one(SELECTORS["title_link"])
                if not link or not link.get("href"):
                    continue

                title = link.get_text(strip=True)
                href = link["href"]
                source_url = href if href.startswith("http") else f"https://www2.daad.de{href}"

                snippet_el = card.select_one(SELECTORS["snippet"])

                listings.append(
                    RawListing(
                        title=title,
                        source_url=source_url,
                        source_name=SOURCE_NAME,
                        snippet=snippet_el.get_text(strip=True) if snippet_el else "",
                        raw_html=str(card),
                    )
                )

    return listings
