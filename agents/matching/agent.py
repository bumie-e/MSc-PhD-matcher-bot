"""Match Agent — scores each (user, opportunity) pair with Groq (llama-3.3-70b-versatile).

Invoked by .github/workflows/match.yml with opp_ids ("all" or comma-separated)
and an optional user_id (omit to run for all onboarded users).
"""

import argparse
import json

import openai

from agents import run_log
from agents.llm import get_groq_client
from agents.matching import tools
from config import settings

SCORE_SYSTEM_PROMPT = """You evaluate how well a graduate opportunity matches a candidate.

First check: does the "opportunity" data actually describe one concrete,
applyable-to MSc/PhD position/studentship/scholarship at a specific
institution — not a blog post, listicle, directory page, or other
non-posting content that was mistakenly stored as an opportunity? If it
doesn't hold up as a real opportunity (e.g. no real university, a
title/summary that reads like generic advice content, nothing an
applicant could actually submit an application to), set
"not_an_opportunity": true and you may leave the other fields at their
zero/empty defaults — do not force a plausible-looking score onto it.

Otherwise, set "not_an_opportunity": false and score 0-100 based on:
field/research alignment, degree requirements met, GPA/academic fit,
relevant experience, funding fit, location/country fit.

Output strictly this JSON shape, no prose:
{
  "not_an_opportunity": boolean,
  "score": int (0-100),
  "score_breakdown": {
    "field_alignment": int (0-100),
    "requirements_met": int (0-100),
    "experience_fit": int (0-100),
    "funding_fit": int (0-100),
    "location_fit": int (0-100)
  },
  "confidence": "low" or "medium" or "high",
  "summary": string (2-3 sentences),
  "pros": [string],
  "cons": [string],
  "recommendations": [string]
}

Be honest about weaknesses — cons and a lower score are more useful to the
candidate than false encouragement.

"confidence" reflects how much you actually had to go on, not how good the
match is: "high" when the CV has real detail (education, experience,
skills) and the opportunity has clear requirements/stipend/deadline; "low"
when the CV is sparse or the opportunity listing is vague/missing fields
(e.g. no stated requirements, no deadline, generic "multiple institutions"
university); "medium" otherwise."""


def score_match(cv: dict, preferences: dict, opportunity: dict) -> dict | None:
    client = get_groq_client()
    user_content = json.dumps(
        {
            "candidate_cv": cv.get("parsed", {}),
            "candidate_preferences": {
                "field_of_study": preferences.get("field_of_study"),
                "keywords": preferences.get("keywords"),
                "target_countries": preferences.get("target_countries"),
                "degree_type": preferences.get("degree_type"),
                "funding_required": preferences.get("funding_required"),
            },
            "opportunity": {
                "title": opportunity.get("title"),
                "university": opportunity.get("university"),
                "department": opportunity.get("department"),
                "type": opportunity.get("type"),
                "location": opportunity.get("location"),
                "stipend": opportunity.get("stipend"),
                "requirements": opportunity.get("requirements"),
                "deadline": opportunity.get("deadline"),
            },
        }
    )
    try:
        resp = client.chat.completions.create(
            model=settings.MATCH_MODEL,
            messages=[
                {"role": "system", "content": SCORE_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_completion_tokens=4096,
            # See agents/cv/parser.py structure_cv_text for why this is needed.
            extra_body={"reasoning_effort": "low"},
        )
    except openai.APIError as exc:
        # A single malformed/truncated generation must not take down the
        # whole match run — skip this pair and keep going.
        print(f"Groq scoring failed for opportunity {opportunity.get('id')}: {exc}")
        return None

    try:
        result = json.loads(resp.choices[0].message.content)
    except (json.JSONDecodeError, TypeError, IndexError):
        return None

    if not isinstance(result, dict):
        # Groq occasionally wraps/returns a bare JSON array even under
        # json_object mode — treat as a malformed generation, not a crash.
        print(f"Groq returned non-object JSON for opportunity {opportunity.get('id')}, skipping.")
        return None

    return result


def run(opp_ids: list[str] | None, user_id: str | None = None) -> int:
    users = tools.get_target_users(user_id)
    opportunities = tools.get_opportunities(opp_ids)
    print(f"Matching {len(opportunities)} opportunities against {len(users)} user(s).")

    written = 0
    invalid_opp_ids: set[str] = set()
    for user in users:
        cv = tools.get_user_cv(user["id"])
        if not cv:
            print(f"Skipping user {user['id']}: no parsed CV yet.")
            continue

        preferences = tools.get_user_preferences(user["id"])
        for opp in opportunities:
            if opp["id"] in invalid_opp_ids:
                continue
            result = score_match(cv, preferences, opp)
            if result is None:
                continue
            if result.pop("not_an_opportunity", False):
                print(f"Not a real opportunity, flagging invalid: {opp.get('source_url')}")
                invalid_opp_ids.add(opp["id"])
                continue
            tools.write_match(user["id"], opp["id"], result)
            written += 1

    if invalid_opp_ids:
        tools.mark_opportunities_invalid(list(invalid_opp_ids))
        print(f"Flagged {len(invalid_opp_ids)} opportunity(ies) as invalid.")

    print(f"Wrote {written} match record(s).")
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--opp-ids", default="all", help='"all" or comma-separated opportunity ids')
    parser.add_argument("--user-id", default=None)
    args = parser.parse_args()

    ids = None if args.opp_ids == "all" else args.opp_ids.split(",")
    with run_log.track_run("match", opp_ids=args.opp_ids, user_id=args.user_id) as summary:
        summary["written"] = run(ids, args.user_id or None)
