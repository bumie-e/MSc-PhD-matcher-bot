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
