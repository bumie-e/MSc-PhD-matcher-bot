"""LinkedIn post scraper — per-user `li_at` session cookie, Playwright.

Searches a fixed set of hashtags (see config.settings.LINKEDIN_HASHTAGS)
rather than free-text keywords, since LinkedIn's public hashtag feed is far
more stable to scrape than its full-text search results. The Search Agent
runs this once per user (using that user's own cookie), not once globally.
"""

import hashlib

from playwright.sync_api import sync_playwright

from agents.search.scrapers.base import RawListing
from config import settings

SOURCE_NAME = "linkedin_posts"


def _hashtag_url(tag: str) -> str:
    return f"https://www.linkedin.com/feed/hashtag/{tag}/"


def _pseudo_url(tag: str, text: str) -> str:
    """Stable dedup key: SHA-256 of the normalised post text.

    Python's built-in hash() is salted per process (PYTHONHASHSEED), so it
    yields a different value on every run and breaks dedup.
    """
    normalised = " ".join(text.split())
    digest = hashlib.sha256(normalised.encode("utf-8")).hexdigest()[:16]
    return f"{_hashtag_url(tag)}#{digest}"


def search_for_user(cookie: str, hashtags: list[str] | None = None) -> list[RawListing]:
    """Scrape recent posts from each hashtag feed using the given user's
    li_at cookie. Returns up to LINKEDIN_MAX_POSTS_PER_USER_PER_RUN posts
    total across all hashtags."""
    hashtags = hashtags or settings.LINKEDIN_HASHTAGS
    listings: list[RawListing] = []
    limit = settings.LINKEDIN_MAX_POSTS_PER_USER_PER_RUN

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context()
        context.add_cookies(
            [
                {
                    "name": "li_at",
                    "value": cookie,
                    "domain": ".linkedin.com",
                    "path": "/",
                    "httpOnly": True,
                    "secure": True,
                }
            ]
        )
        page = context.new_page()

        for tag in hashtags:
            if len(listings) >= limit:
                break

            page.goto(_hashtag_url(tag), wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(2000)  # let the feed's initial batch render

            post_els = page.locator("div.feed-shared-update-v2").all()
            for post_el in post_els:
                if len(listings) >= limit:
                    break
                text = post_el.inner_text().strip()
                if not text:
                    continue

                # LinkedIn post permalinks aren't reliably in the DOM without
                # extra clicks; use a content hash as a stable dedup key
                # instead of a real URL, then let the structuring step
                # decide whether this is even a real opportunity.
                pseudo_url = _pseudo_url(tag, text)

                listings.append(
                    RawListing(
                        title=text.splitlines()[0][:120] if text else "",
                        source_url=pseudo_url,
                        source_name=SOURCE_NAME,
                        snippet=text[:1000],
                    )
                )

        browser.close()

    return listings
