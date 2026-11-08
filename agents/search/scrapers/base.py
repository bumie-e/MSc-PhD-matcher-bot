from dataclasses import dataclass, field


@dataclass
class RawListing:
    """Unstructured-ish listing pulled straight off a source page, before
    the search agent (Groq) normalizes it into the opportunities schema."""

    title: str
    source_url: str
    source_name: str
    university: str = ""
    snippet: str = ""
    raw_html: str = ""
    extra: dict = field(default_factory=dict)


MAX_RESPONSE_BYTES = 5_000_000
MAX_REDIRECTS = 5


def _reject_oversized(response) -> None:
    length = response.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_RESPONSE_BYTES:
        raise ValueError(f"response too large ({length} bytes)")


def scraper_client(headers: dict):
    """HTTP client for scrapers: bounded redirects and a response size cap
    (by declared Content-Length), so a hostile page cannot stall or flood a run."""
    import httpx

    return httpx.Client(
        headers=headers,
        timeout=20.0,
        follow_redirects=True,
        max_redirects=MAX_REDIRECTS,
        event_hooks={"response": [_reject_oversized]},
    )
