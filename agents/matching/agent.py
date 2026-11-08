"""Match Agent: scores (user, opportunity) pairs with each user's OWN LLM key.

Only users who finished setup and connected a working key are matched; everyone
else simply browses the shared pool. A run is bounded per user (see
settings.MATCH_MAX_PER_USER_PER_RUN) so one key cannot be drained by accident.

Invoked by .github/workflows/match.yml with opp_ids ("all" or comma-separated),
an optional user_id (omit to run for all eligible users), and --rescore to
re-score openings that already have a match (used after a CV is replaced).
"""

import argparse
import json

from agents import run_log, validate
from agents.llm import (
    LLM,
    LLMAuthError,
    LLMError,
    LLMKeyMissing,
    LLMModelUnavailable,
    get_user_llm,
    mark_key_invalid,
    mark_key_status,
)
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
match is: "high" when the candidate summary has real detail (education,
experience, skills) and the opportunity has clear requirements/stipend/
deadline; "low" when the summary is sparse or the opportunity listing is
vague/missing fields (e.g. no stated requirements, no deadline, generic
"multiple institutions" university); "medium" otherwise."""


def score_match(llm: LLM, cv: dict, preferences: dict, opportunity: dict) -> dict | None:
    parsed = cv.get("parsed") or {}
    # CVs parsed before the summary field was added don't have one yet —
    # fall back to the full structured object rather than sending nothing
    # until the user re-uploads and it gets backfilled.
    candidate_profile = parsed.get("summary") or parsed
    payload = json.dumps(
        {
            "candidate_profile": candidate_profile,
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
    user_content = f"<untrusted_data>\n{payload}\n</untrusted_data>"
    result = llm.complete_json(SCORE_SYSTEM_PROMPT, user_content)
    if result is None:
        print(f"Unusable scoring output for opportunity {opportunity.get('id')}, skipping.")
        return None
    cleaned = validate.match_result(result)
    if cleaned is None:
        print(f"Scoring output for opportunity {opportunity.get('id')} failed validation, skipping.")
        return None
    return cleaned


def run(opp_ids: list[str] | None, user_id: str | None = None, rescore: bool = False) -> dict:
    users = tools.get_target_users(user_id)
    opportunities = tools.get_opportunities(opp_ids)
    print(f"Matching up to {len(opportunities)} opportunities for {len(users)} eligible user(s).")

    stats = {
        "users": len(users),
        "written": 0,
        "users_skipped": 0,
        "keys_rejected": 0,
        "models_unavailable": 0,
        "rate_limited": 0,
    }
    # Distinct users whose model said an opening is not a real posting. A single
    # verdict can be steered by hostile page text, so it only hides the opening
    # from that run; it is marked invalid for everyone once enough users agree.
    invalid_votes: dict[str, set[str]] = {}

    for user in users:
        uid = user["id"]
        cv = tools.get_user_cv(uid)
        if not cv:
            print(f"Skipping user {uid[:8]}: no parsed CV yet.")
            stats["users_skipped"] += 1
            continue
        try:
            llm = get_user_llm(uid)
        except LLMKeyMissing:
            print(f"Skipping user {uid[:8]}: no usable AI key.")
            stats["users_skipped"] += 1
            continue

        preferences = tools.get_user_preferences(uid)
        todo = tools.select_opportunities_for_user(
            opportunities,
            preferences,
            tools.get_scored_opportunity_ids(uid),
            settings.MATCH_MAX_PER_USER_PER_RUN,
            rescore=rescore,
        )
        print(f"User {uid[:8]} ({llm.provider}): scoring {len(todo)} opening(s).")

        for opp in todo:
            if uid in invalid_votes.get(opp["id"], set()):
                continue
            try:
                result = score_match(llm, cv, preferences, opp)
            except LLMAuthError:
                print(f"User {uid[:8]}: key rejected, stopping their run.")
                mark_key_invalid(uid, "Your AI provider rejected this key. Replace it in Settings.")
                stats["keys_rejected"] += 1
                break
            except LLMModelUnavailable:
                print(f"User {uid[:8]}: model {llm.model} retired, stopping their run.")
                gone = f"Your model {llm.model} is no longer available. Choose another in Settings."
                mark_key_status(uid, "model_unavailable", gone)
                stats["models_unavailable"] += 1
                break
            except LLMError:
                # Rate limited or overloaded: stop spending this user's calls
                # now. The rest are picked up on the next run.
                print(f"User {uid[:8]}: provider unavailable, stopping their run.")
                stats["rate_limited"] += 1
                break
            if result is None:
                continue
            if result.pop("not_an_opportunity", False):
                print(f"Not a real opportunity, flagging invalid: {opp.get('source_url')}")
                invalid_votes.setdefault(opp["id"], set()).add(uid)
                continue
            tools.write_match(uid, opp["id"], result)
            stats["written"] += 1

    confirmed = [oid for oid, voters in invalid_votes.items() if len(voters) >= settings.INVALIDATE_MIN_VOTES]
    if confirmed:
        tools.mark_opportunities_invalid(confirmed)
        print(f"Flagged {len(confirmed)} opportunity(ies) as invalid.")

    print(f"Wrote {stats['written']} match record(s).")
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--opp-ids", default="all", help='"all" or comma-separated opportunity ids')
    parser.add_argument("--user-id", default=None)
    parser.add_argument("--rescore", action="store_true", help="re-score openings that already have a match")
    args = parser.parse_args()

    ids = None if args.opp_ids == "all" else args.opp_ids.split(",")
    meta = {"opp_ids": args.opp_ids, "user_id": args.user_id, "rescore": args.rescore}
    with run_log.track_run("match", **meta) as summary:
        summary.update(run(ids, args.user_id or None, rescore=args.rescore))
