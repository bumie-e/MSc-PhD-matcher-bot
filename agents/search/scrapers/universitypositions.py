"""UniversityPositions.eu scraper. European academic job board, structured
HTML listing pages. Selectors unverified against live markup (blocked
automated fetch during dev) — re-inspect the live page if search() returns
zero results.
"""

import httpx
from bs4 import BeautifulSoup

from agents.search.scrapers.base import RawListing

BASE_URL = "https://universitypositions.eu/jobs"
SOURCE_NAME = "universitypositions"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; MSc-PhD-Matcher-Bot/1.0; "
        "+https://github.com/) research-opportunity-aggregator"
    )
}

SELECTORS = {
    "result_card": "div.job-listing, article.job",
    "title_link": "a.job-title, h2 a, h3 a",
    "university": ".job-employer, .organisation",
    "snippet": ".job-description, .job-summary",
}


def search(keywords: list[str]) -> list[RawListing]:
    listings: list[RawListing] = []

    with httpx.Client(headers=HEADERS, timeout=20.0, follow_redirects=True) as client:
        for keyword in keywords:
            resp = client.get(BASE_URL, params={"search": keyword})
            if resp.status_code != 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            for card in soup.select(SELECTORS["result_card"]):
                link = card.select_one(SELECTORS["title_link"])
                if not link or not link.get("href"):
                    continue

                title = link.get_text(strip=True)
                href = link["href"]
                source_url = href if href.startswith("http") else f"https://universitypositions.eu{href}"

                uni_el = card.select_one(SELECTORS["university"])
                snippet_el = card.select_one(SELECTORS["snippet"])

                listings.append(
                    RawListing(
                        title=title,
                        source_url=source_url,
                        source_name=SOURCE_NAME,
                        university=uni_el.get_text(strip=True) if uni_el else "",
                        snippet=snippet_el.get_text(strip=True) if snippet_el else "",
                        raw_html=str(card),
                    )
                )

    return listings
