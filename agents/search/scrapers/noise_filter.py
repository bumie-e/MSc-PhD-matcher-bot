"""Shared domain exclusion list for Tavily-backed searches (tavily_search,
university_search). These are hosts that reliably surface as blogs,
listicles, forums, or social content rather than actual opportunity
postings — excluding them upstream cuts noise before it ever reaches the
Groq structuring step, which is the more expensive/fallible filter.
"""

EXCLUDED_DOMAINS = [
    "reddit.com",
    "quora.com",
    "medium.com",
    "youtube.com",
    "pinterest.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "prepscholar.com",
    "topuniversities.com",
    "shemeansbusiness.com",
]
