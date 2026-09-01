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
