"""Validation of model output before it touches the database. Models can
return wrong types, out-of-range numbers or oversized text (accidentally, or
because a scraped page or CV tried to steer them), so every field is coerced
or dropped here; callers skip the row when a required field is invalid."""

import re
from datetime import date

CONFIDENCES = ("low", "medium", "high")
BREAKDOWN_KEYS = ("field_alignment", "requirements_met", "experience_fit", "funding_fit", "location_fit")
_URL = re.compile(r"^https?://", re.IGNORECASE)


def text(value, max_len: int, default: str = "") -> str:
    return value.strip()[:max_len] if isinstance(value, str) else default


def opt_text(value, max_len: int) -> str | None:
    out = text(value, max_len)
    return out or None


def text_list(value, max_items: int, max_len: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [text(v, max_len) for v in value[:max_items] if isinstance(v, str) and v.strip()]


def score(value) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return max(0, min(100, int(value)))


def match_result(raw: dict) -> dict | None:
    """Clean a match-scoring result. None when the score is unusable."""
    s = score(raw.get("score"))
    if s is None:
        return None
    breakdown_in = raw.get("score_breakdown") if isinstance(raw.get("score_breakdown"), dict) else {}
    breakdown = {}
    for key in BREAKDOWN_KEYS:
        value = score(breakdown_in.get(key))
        if value is not None:
            breakdown[key] = value
    confidence = raw.get("confidence") if raw.get("confidence") in CONFIDENCES else "medium"
    return {
        "not_an_opportunity": raw.get("not_an_opportunity") is True,
        "score": s,
        "score_breakdown": breakdown,
        "confidence": confidence,
        "summary": text(raw.get("summary"), 1500),
        "pros": text_list(raw.get("pros"), 8, 400),
        "cons": text_list(raw.get("cons"), 8, 400),
        "recommendations": text_list(raw.get("recommendations"), 8, 400),
    }


def _iso_date(value) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None


def opportunity(raw: dict) -> dict | None:
    """Clean a structured listing. None when a required field is missing."""
    title = text(raw.get("title"), 300)
    university = text(raw.get("university"), 200)
    kind = raw.get("type")
    if not title or not university or kind not in ("msc", "phd"):
        return None
    req_in = raw.get("requirements") if isinstance(raw.get("requirements"), dict) else {}
    contact_in = raw.get("contact_info") if isinstance(raw.get("contact_info"), dict) else {}
    url = opt_text(contact_in.get("url"), 500)
    return {
        "title": title,
        "university": university,
        "department": opt_text(raw.get("department"), 200),
        "professor": opt_text(raw.get("professor"), 200),
        "type": kind,
        "deadline": _iso_date(raw.get("deadline")),
        "semester": opt_text(raw.get("semester"), 100),
        "location": text(raw.get("location"), 200),
        "stipend": opt_text(raw.get("stipend"), 300),
        "requirements": {
            "degree": opt_text(req_in.get("degree"), 200),
            "gpa": opt_text(req_in.get("gpa"), 100),
            "other": text_list(req_in.get("other"), 10, 300),
        },
        "how_to_apply": opt_text(raw.get("how_to_apply"), 1000),
        "contact_info": {
            "email": opt_text(contact_in.get("email"), 254),
            "url": url if url and _URL.match(url) else None,
        },
    }


def parsed_cv(raw: dict) -> dict | None:
    """Clean a structured CV. None when there is no usable summary."""
    summary = text(raw.get("summary"), 3000)
    if not summary:
        return None

    def rows(key: str, fields: tuple[str, ...]) -> list[dict]:
        items = raw.get(key)
        if not isinstance(items, list):
            return []
        return [{f: opt_text(i.get(f), 500) for f in fields} for i in items[:20] if isinstance(i, dict)]

    return {
        "education": rows("education", ("degree", "institution", "field", "year")),
        "gpa": opt_text(raw.get("gpa"), 50),
        "research_experience": rows("research_experience", ("role", "institution", "duration", "summary")),
        "publications": text_list(raw.get("publications"), 50, 500),
        "languages": text_list(raw.get("languages"), 20, 100),
        "skills": text_list(raw.get("skills"), 60, 100),
        "summary": summary,
    }
