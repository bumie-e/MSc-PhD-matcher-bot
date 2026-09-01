"""EURAXESS scraper — covers general EU researcher positions AND MSCA
Doctoral Network postings (MSCA-funded jobs are tagged/filterable within the
same listing set, no separate source needed).

Correction from the original plan: EURAXESS has no public REST/JSON API —
confirmed by inspecting the live search page, which is a standard Drupal
form with URL query params, not a documented API. This is a scraper like
the others, not an API client.
"""

import httpx
from bs4 import BeautifulSoup

from agents.search.scrapers.base import RawListing

BASE_URL = "https://euraxess.ec.europa.eu/jobs/search"
SOURCE_NAME = "euraxess"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; MSc-PhD-Matcher-Bot/1.0; "
        "+https://github.com/) research-opportunity-aggregator"
    )
}

SELECTORS = {
    "result_card": "div.views-row, article.node--type-job",
    "title_link": "h3 a, .job-title a, .field--name-title a",
    "university": ".field--name-field-organisation, .job-employer",
    "snippet": ".field--name-field-offer-description, .job-summary",
}


def search(keywords: list[str]) -> list[RawListing]:
    listings: list[RawListing] = []

    with httpx.Client(headers=HEADERS, timeout=20.0, follow_redirects=True) as client:
        for keyword in keywords:
            resp = client.get(BASE_URL, params={"f[0]": f"search_api_fulltext:{keyword}"})
            if resp.status_code != 200:
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            for card in soup.select(SELECTORS["result_card"]):
                link = card.select_one(SELECTORS["title_link"])
                if not link or not link.get("href"):
                    continue

                title = link.get_text(strip=True)
                href = link["href"]
                source_url = href if href.startswith("http") else f"https://euraxess.ec.europa.eu{href}"

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
