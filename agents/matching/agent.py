"""Match Agent — scores each (user, opportunity) pair with Groq (llama-3.3-70b-versatile).

Invoked by .github/workflows/match.yml with opp_ids ("all" or comma-separated)
and an optional user_id (omit to run for all onboarded users).
"""

import argparse
import json

import openai

from agents.llm import get_groq_client
from agents.matching import tools
from config import settings

SCORE_SYSTEM_PROMPT = """You evaluate how well a graduate opportunity matches a candidate.

Score 0-100 based on: field/research alignment, degree requirements met,
GPA/academic fit, relevant experience, funding fit, location/country fit.

Output strictly this JSON shape, no prose:
{
  "score": int (0-100),
  "score_breakdown": {
    "field_alignment": int (0-100),
    "requirements_met": int (0-100),
    "experience_fit": int (0-100),
    "funding_fit": int (0-100),
    "location_fit": int (0-100)
  },
  "summary": string (2-3 sentences),
  "pros": [string],
  "cons": [string],
  "recommendations": [string]
}

Be honest about weaknesses — cons and a lower score are more useful to the
candidate than false encouragement."""


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
        return json.loads(resp.choices[0].message.content)
    except (json.JSONDecodeError, TypeError, IndexError):
        return None


def run(opp_ids: list[str] | None, user_id: str | None = None) -> int:
    users = tools.get_target_users(user_id)
    opportunities = tools.get_opportunities(opp_ids)
    print(f"Matching {len(opportunities)} opportunities against {len(users)} user(s).")

    written = 0
    for user in users:
        cv = tools.get_user_cv(user["id"])
        if not cv:
            print(f"Skipping user {user['id']}: no parsed CV yet.")
            continue

        preferences = tools.get_user_preferences(user["id"])
        for opp in opportunities:
            result = score_match(cv, preferences, opp)
            if result is None:
                continue
            tools.write_match(user["id"], opp["id"], result)
            written += 1

    print(f"Wrote {written} match record(s).")
    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--opp-ids", default="all", help='"all" or comma-separated opportunity ids')
    parser.add_argument("--user-id", default=None)
    args = parser.parse_args()

    ids = None if args.opp_ids == "all" else args.opp_ids.split(",")
    run(ids, args.user_id or None)
