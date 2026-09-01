"""FindAPhD.com scraper.

Static, paginated HTML. Selectors below match the site's listing markup as of
late 2025 (each result is an `<div class="phd-result">` with a
`.phd-result__title a` link). Sites like this change markup periodically —
if `search()` starts returning zero results, re-inspect the live page and
update SELECTORS before assuming the keyword had no matches.
"""

import httpx
from bs4 import BeautifulSoup

from agents.search.scrapers.base import RawListing

BASE_URL = "https://www.findaphd.com/phds/"
SOURCE_NAME = "findaphd"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; MSc-PhD-Matcher-Bot/1.0; "
        "+https://github.com/) research-opportunity-aggregator"
    )
}

SELECTORS = {
    "result_card": "div.phd-result, div.result",
    "title_link": "a.phd-result__title, h4 a, .result-title a",
    "university": ".instTitle, .phd-result__university, .result-uni",
    "deadline": ".phd-result__key-info .deadline, .fundingSentence",
    "snippet": ".phd-result__description, .result-description",
}


def search(keywords: list[str], max_pages: int = 2) -> list[RawListing]:
    """Search FindAPhD for the given keywords, return raw listings.

    Not exhaustive by design — the search agent runs this per keyword and
    deduplicates by source_url downstream (see tools.check_existing).
    """
    listings: list[RawListing] = []

    with httpx.Client(headers=HEADERS, timeout=20.0, follow_redirects=True) as client:
        for keyword in keywords:
            for page in range(1, max_pages + 1):
                params = {"Keywords": keyword, "PG": page}
                resp = client.get(BASE_URL, params=params)
                if resp.status_code != 200:
                    break

                soup = BeautifulSoup(resp.text, "html.parser")
                cards = soup.select(SELECTORS["result_card"])
                if not cards:
                    break

                for card in cards:
                    link = card.select_one(SELECTORS["title_link"])
                    if not link or not link.get("href"):
                        continue

                    title = link.get_text(strip=True)
                    href = link["href"]
                    source_url = href if href.startswith("http") else f"https://www.findaphd.com{href}"

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
