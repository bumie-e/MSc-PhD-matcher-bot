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
    """Onboarded users to match against. If user_id is given, scope to just them."""
    db = get_client()
    query = db.table("user_profiles").select("id").gte("onboarding_step", 5)
    if user_id:
        query = query.eq("id", user_id)
    resp = query.execute()
    return resp.data


def get_opportunities(opp_ids: list[str] | None) -> list[dict]:
    db = get_client()
    query = db.table("opportunities").select("*")
    if opp_ids:
        query = query.in_("id", opp_ids)
    resp = query.execute()
    return resp.data


def write_match(user_id: str, opportunity_id: str, result: dict) -> None:
    confidence = result.get("confidence")
    if confidence not in ("low", "medium", "high"):
        confidence = "medium"  # matches the column default if Groq omits/mangles the field

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
