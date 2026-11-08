"""Search Agent.

Flow:
  1. Pull every onboarded user's keywords, build one deduplicated global set.
  2. Scrape every keyword-based global source (FindAPhD, FindAMasters,
     PhDportal, UniversityPositions, EURAXESS, Erasmus Mundus, ProFellow,
     DAAD, ScholarshipDB, Fulbright) for those keywords, plus a global
     Tavily catch-all pass.
  3. For each user with a connected LinkedIn cookie, scrape their hashtag
     feed too (per-user because the cookie is per-user). Users who named
     specific target_universities also get a per-university Tavily search
     scoped to their own keywords/field of study. Every user also gets a
     ResearchGate professor-profile crawl (Phase 5): discover candidate
     profiles via Tavily, then Playwright-check each one for hiring
     signals, caching visited profiles in lab_visits.
  4. Drop listings whose source_url is already in `opportunities`.
  5. Ask the owner's Groq model to normalize each new listing into the
     opportunities schema (shared pool; personalised scoring is per-user, in
     agents/matching, with each user's own key).
  6. Write the structured rows to Supabase.

The LLM is used for structuring (step 5), not for driving the scrape itself.
"""

import sys

from agents import run_log
from agents.llm import LLM, LLMError, get_owner_llm
from agents.search import tools

STRUCTURE_SYSTEM_PROMPT = """You turn a raw scraped PhD/MSc listing into structured JSON.

First decide: does this text describe one concrete, applyable-to MSc/PhD
position, studentship, or scholarship at a specific institution (e.g. a
program page, a funded position announcement, a call for applications)?

It is NOT a real opportunity if it's a blog post, listicle, "how to fund
your PhD" / "how to find a supervisor" guide, forum or Q&A thread, news
article, ranking page, a scholarship *directory* or search-tool page (as
opposed to one specific scholarship), or anything else that doesn't name
one applyable position/program.

Output strictly this JSON shape, no prose:
{
  "is_opportunity": boolean,
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

If "is_opportunity" is false, the other fields can be left null/empty —
they're discarded. If a field can't be determined from the text, use null
(or [] / {} for requirements/contact_info if entirely unknown). Never
invent a deadline."""


def structure_listing(listing: dict, llm: LLM) -> dict | None:
    user_content = (
        f"Title: {listing['title']}\n"
        f"University (as scraped): {listing.get('university', '')}\n"
        f"Snippet: {listing.get('snippet', '')}\n"
        f"URL: {listing['source_url']}"
    )
    try:
        structured = llm.complete_json(STRUCTURE_SYSTEM_PROMPT, user_content)
    except LLMError as exc:
        # The owner key is shared by everyone, so a rejected key or a rate limit
        # is a run-level problem. Let it surface instead of skipping every listing.
        raise RuntimeError(f"Shared search LLM unavailable: {exc}") from exc

    if structured is None:
        print(f"Unusable structuring output for {listing.get('source_url')}, skipping.")
        return None

    if not structured.pop("is_opportunity", True):
        print(f"Not a real opportunity, skipping: {listing.get('source_url')}")
        return None

    structured["source_url"] = listing["source_url"]
    structured["source_name"] = listing["source_name"]
    if listing["source_name"] == "researchgate":
        # ResearchGate profiles are individual academics, never funded MSc
        # programs, so don't let a borderline read mislabel this as msc.
        structured["type"] = "phd"
    return structured


def run() -> list[str]:
    # The pool is shared and browsable without an account setup, so the search
    # runs even when nobody has filled in interests yet (default keywords).
    user_rows = tools.get_all_user_keywords()
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

        if row["target_universities"]:
            university_keywords = ([row["field_of_study"]] if row["field_of_study"] else []) + row["keywords"]
            university_listings = tools.scrape_universities_for_user(
                row["user_id"], row["target_universities"], university_keywords
            )
            if university_listings:
                n_uni = len(row["target_universities"])
                print(
                    f"University search (user {row['user_id']}, {n_uni} universities): "
                    f"{len(university_listings)} raw listings."
                )
                raw_listings.extend(university_listings)

        researchgate_listings = tools.scrape_researchgate_for_user(
            row["user_id"], row["field_of_study"], row["keywords"]
        )
        if researchgate_listings:
            print(f"ResearchGate (user {row['user_id']}): {len(researchgate_listings)} hiring signal(s).")
            raw_listings.extend(researchgate_listings)

    deduped_by_url = {listing["source_url"]: listing for listing in raw_listings}.values()

    existing_urls = tools.check_existing([listing["source_url"] for listing in deduped_by_url])
    new_listings = [listing for listing in deduped_by_url if listing["source_url"] not in existing_urls]
    print(f"{len(new_listings)} are new (not already in opportunities).")

    llm = get_owner_llm() if new_listings else None
    structured_opportunities = []
    for listing in new_listings:
        structured = structure_listing(listing, llm)
        if structured:
            structured_opportunities.append(structured)

    new_ids = tools.write_opportunities(structured_opportunities)
    print(f"Wrote {len(new_ids)} new opportunities.")
    return new_ids


if __name__ == "__main__":
    with run_log.track_run("search") as summary:
        ids = run()
        summary["new_opportunities"] = len(ids)
    # Emit for the orchestrator step to pick up via GITHUB_OUTPUT.
    print(f"NEW_OPPORTUNITY_IDS={','.join(ids)}", file=sys.stderr)
