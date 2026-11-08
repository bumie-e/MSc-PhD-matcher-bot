from datetime import date, datetime

from agents.db import get_client


def get_user_cv(user_id: str) -> dict | None:
    db = get_client()
    resp = db.table("user_cv").select("parsed, raw_text").eq("user_id", user_id).eq(
        "parse_status", "done"
    ).order("updated_at", desc=True).limit(1).execute()
    return resp.data[0] if resp.data else None


def get_user_preferences(user_id: str) -> dict | None:
    db = get_client()
    resp = db.table("user_profiles").select("*").eq("id", user_id).single().execute()
    return resp.data


def get_target_users(user_id: str | None = None) -> list[dict]:
    """Users eligible for personalised matching: finished the setup questions
    AND connected an AI key that the provider has not rejected. Everyone else
    can still browse the shared pool; they just get no scores."""
    db = get_client()
    query = db.table("user_profiles").select("id").gte("onboarding_step", 5)
    if user_id:
        query = query.eq("id", user_id)
    candidates = [row["id"] for row in query.execute().data]
    if not candidates:
        return []
    keyed = (
        db.table("user_llm_keys")
        .select("user_id")
        .in_("user_id", candidates)
        .eq("status", "valid")
        .execute()
        .data
    )
    keyed_ids = {row["user_id"] for row in keyed}
    return [{"id": uid} for uid in candidates if uid in keyed_ids]


def get_scored_opportunity_ids(user_id: str) -> set[str]:
    db = get_client()
    resp = db.table("matches").select("opportunity_id").eq("user_id", user_id).execute()
    return {row["opportunity_id"] for row in resp.data}


def select_opportunities_for_user(
    opportunities: list[dict],
    preferences: dict,
    already_scored: set[str],
    cap: int,
    today: date | None = None,
    rescore: bool = False,
) -> list[dict]:
    """Choose which openings are worth spending this user's API credit on.

    Skips: ones already scored (unless rescoring after a new CV), ones whose
    deadline has passed, and ones of a degree type the user did not ask for.
    The rest are ordered soonest deadline first (unknown deadlines last, then
    newest) and truncated to `cap`, so a single run has a bounded cost."""
    today = today or date.today()
    degree = preferences.get("degree_type") or "both"

    def deadline_of(opp: dict) -> date | None:
        raw = opp.get("deadline")
        try:
            return date.fromisoformat(raw) if raw else None
        except ValueError:
            return None

    eligible = []
    for opp in opportunities:
        if not rescore and opp["id"] in already_scored:
            continue
        if degree in ("msc", "phd") and opp.get("type") != degree:
            continue
        d = deadline_of(opp)
        if d is not None and d < today:
            continue
        eligible.append((opp, d))

    eligible.sort(key=lambda pair: (pair[1] is None, pair[1] or date.max, -(_created_rank(pair[0]))))
    return [opp for opp, _ in eligible[:cap]]


def _created_rank(opp: dict) -> float:
    raw = opp.get("created_at") or ""
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def get_opportunities(opp_ids: list[str] | None) -> list[dict]:
    db = get_client()
    query = db.table("opportunities").select("*").eq("is_valid", True)
    if opp_ids:
        query = query.in_("id", opp_ids)
    resp = query.execute()
    return resp.data


def mark_opportunities_invalid(opportunity_ids: list[str]) -> None:
    """Flag opportunities the match agent determined aren't real postings
    (e.g. blog/listicle content that slipped past the search agent's
    structuring gate) so they stop being matched or shown."""
    if not opportunity_ids:
        return
    db = get_client()
    db.table("opportunities").update({"is_valid": False}).in_("id", opportunity_ids).execute()


def write_match(user_id: str, opportunity_id: str, result: dict) -> None:
    confidence = result.get("confidence")
    if confidence not in ("low", "medium", "high"):
        confidence = "medium"  # matches the column default if the model omits/mangles the field

    db = get_client()
    db.table("matches").upsert(
        {
            "user_id": user_id,
            "opportunity_id": opportunity_id,
            "score": result["score"],
            "score_breakdown": result.get("score_breakdown", {}),
            "confidence": confidence,
            "summary": result.get("summary", ""),
            "pros": result.get("pros", []),
            "cons": result.get("cons", []),
            "recommendations": result.get("recommendations", []),
        },
        on_conflict="user_id,opportunity_id",
    ).execute()
