"""Search Agent — Phase 2 scope: all sources except research lab discovery
(Phase 3) and ResearchGate (Phase 5).

Flow:
  1. Pull every onboarded user's keywords, build one deduplicated global set.
  2. Scrape every keyword-based global source (FindAPhD, FindAMasters,
     PhDportal, UniversityPositions, EURAXESS, Erasmus Mundus, ProFellow,
     DAAD, ScholarshipDB, Fulbright) for those keywords, plus a global
     Tavily catch-all pass.
  3. For each user with a connected LinkedIn cookie, scrape their hashtag
     feed too (per-user because the cookie is per-user).
  4. Drop listings whose source_url is already in `opportunities`.
  5. Ask Groq to normalize each new listing into the opportunities schema.
  6. Write the structured rows to Supabase.

Groq is used for structuring (step 5), not for driving the scrape itself.
"""

import json
import sys

from agents.llm import get_groq_client
from agents.search import tools
from config import settings

STRUCTURE_SYSTEM_PROMPT = """You turn a raw scraped PhD/MSc listing into structured JSON.

Output strictly this JSON shape, no prose:
{
  "title": string,
  "university": string,
  "department": string or null,
  "professor": string or null,
  "type": "msc" or "phd",
  "deadline": "YYYY-MM-DD" or null,
  "semester": string or null,
  "location": string,
  "stipend": string or null,
  "requirements": {"degree": string or null, "gpa": string or null, "other": [string]},
  "how_to_apply": string or null,
  "contact_info": {"email": string or null, "url": string or null}
}

If a field can't be determined from the text, use null (or [] / {} for
requirements/contact_info if entirely unknown). Never invent a deadline."""


def structure_listing(listing: dict) -> dict | None:
    client = get_groq_client()
    user_content = (
        f"Title: {listing['title']}\n"
        f"University (as scraped): {listing.get('university', '')}\n"
        f"Snippet: {listing.get('snippet', '')}\n"
        f"URL: {listing['source_url']}"
    )
    resp = client.chat.completions.create(
        model=settings.SEARCH_MODEL,
        messages=[
            {"role": "system", "content": STRUCTURE_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=2048,
        # See agents/cv/parser.py structure_cv_text for why this is needed.
        extra_body={"reasoning_effort": "low"},
    )
    try:
        structured = json.loads(resp.choices[0].message.content)
    except (json.JSONDecodeError, TypeError, IndexError):
        return None

    structured["source_url"] = listing["source_url"]
    structured["source_name"] = listing["source_name"]
    return structured


def run() -> list[str]:
    user_rows = tools.get_all_user_keywords()
    if not user_rows:
        print("No onboarded users yet — nothing to search for.")
        return []

    keywords = tools.collect_global_keywords(user_rows)
    print(f"Searching {len(keywords)} keyword(s) across all global sources: {keywords}")

    raw_listings = tools.scrape_all_global_sources(keywords)
    print(f"Global sources: {len(raw_listings)} raw listings.")

    try:
        tavily_listings = tools.tavily_search_tool(keywords)
        print(f"Tavily catch-all: {len(tavily_listings)} raw listings.")
        raw_listings.extend(tavily_listings)
    except RuntimeError as exc:
        print(f"Skipping Tavily catch-all: {exc}")

    for row in user_rows:
        linkedin_listings = tools.scrape_linkedin_for_user(row["user_id"])
        if linkedin_listings:
            print(f"LinkedIn (user {row['user_id']}): {len(linkedin_listings)} raw listings.")
            raw_listings.extend(linkedin_listings)

    deduped_by_url = {listing["source_url"]: listing for listing in raw_listings}.values()

    existing_urls = tools.check_existing([listing["source_url"] for listing in deduped_by_url])
    new_listings = [listing for listing in deduped_by_url if listing["source_url"] not in existing_urls]
    print(f"{len(new_listings)} are new (not already in opportunities).")

    structured_opportunities = []
    for listing in new_listings:
        structured = structure_listing(listing)
        if structured:
            structured_opportunities.append(structured)

    new_ids = tools.write_opportunities(structured_opportunities)
    print(f"Wrote {len(new_ids)} new opportunities.")
    return new_ids


if __name__ == "__main__":
    ids = run()
    # Emit for the orchestrator step to pick up via GITHUB_OUTPUT.
    print(f"NEW_OPPORTUNITY_IDS={','.join(ids)}", file=sys.stderr)
