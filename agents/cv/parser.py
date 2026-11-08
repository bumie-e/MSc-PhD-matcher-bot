"""CV parser: downloads a user's uploaded PDF from Supabase Storage, extracts
raw text with PyMuPDF, then asks the *user's own* LLM (their API key, see
agents/llm.py) to structure it. Invoked by
.github/workflows/parse-cv.yml with user_id and storage_path inputs.
"""

import argparse
import sys
import tempfile

import pymupdf as fitz

from agents import run_log
from agents.db import get_client
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

STORAGE_BUCKET = "cvs"

STRUCTURE_SYSTEM_PROMPT = """You extract structured fields from a CV's raw text.

Output strictly this JSON shape, no prose:
{
  "education": [{"degree": string, "institution": string, "field": string or null, "year": string or null}],
  "gpa": string or null,
  "research_experience": [{"role": string, "institution": string, "duration": string or null,
                            "summary": string}],
  "publications": [string],
  "languages": [string],
  "skills": [string],
  "summary": string
}

Use [] for any list you find nothing for. Never invent details not present in the text.

"summary" is a dense 100-150 word plain-text profile written for a grad-school
match evaluator, not a human reader — pack in the highest degree (completed or
in progress) and field, institution(s), GPA if present, the most relevant
research experience and its outcomes, key technical/domain skills, and
publication count/highlights if any. This is the ONLY thing the match agent
sees per candidate going forward, so it must stand on its own — don't write
"see above" or omit something just because it's also in a structured field
above."""


def download_cv(storage_path: str) -> bytes:
    db = get_client()
    return db.storage.from_(STORAGE_BUCKET).download(storage_path)


def extract_text(pdf_bytes: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp.flush()
        doc = fitz.open(tmp.name)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
    return text


def structure_cv_text(raw_text: str, llm: LLM) -> dict:
    parsed = llm.complete_json(STRUCTURE_SYSTEM_PROMPT, raw_text[:20000])
    if parsed is None:
        raise ValueError("The AI model did not return a readable CV structure. Try uploading again.")
    return parsed


def run(user_id: str, storage_path: str) -> None:
    db = get_client()

    def fail(message: str) -> None:
        db.table("user_cv").update({"parse_status": "error", "parse_error": message[:300]}).eq(
            "user_id", user_id
        ).eq("storage_path", storage_path).execute()

    with run_log.track_run("cv_parse", user_id=user_id, storage_path=storage_path) as summary:
        try:
            llm = get_user_llm(user_id)
            pdf_bytes = download_cv(storage_path)
            raw_text = extract_text(pdf_bytes)
            parsed = structure_cv_text(raw_text, llm)

            db.table("user_cv").update(
                {"raw_text": raw_text, "parsed": parsed, "parse_status": "done", "parse_error": None}
            ).eq("user_id", user_id).eq("storage_path", storage_path).execute()
            summary["parse_status"] = "done"
            summary["provider"] = llm.provider
            print(f"Parsed CV for user {user_id}.")
        except LLMKeyMissing as exc:
            summary["parse_status"] = "needs_key"
            fail(str(exc))  # user-facing text from get_user_llm, safe to store
            print(f"CV for user {user_id[:8]} not parsed: no usable AI key.", file=sys.stderr)
        except LLMAuthError:
            mark_key_invalid(user_id, "Your AI provider rejected this key. Add a new one in Settings.")
            summary["parse_status"] = "key_rejected"
            fail("Your AI provider rejected your key. Add a new one in Settings.")
            print(f"CV parse failed, key rejected for user {user_id[:8]}.", file=sys.stderr)
        except LLMModelUnavailable:
            message = "Your AI model is no longer available. Choose another in Settings."
            mark_key_status(user_id, "model_unavailable", message)
            summary["parse_status"] = "model_unavailable"
            fail(message)
            print(f"CV parse failed, model retired for user {user_id[:8]}.", file=sys.stderr)
        except LLMError:
            fail("Your AI provider is busy or over its rate limit. Try again in a few minutes.")
            print(f"CV parse failed for user {user_id[:8]}: provider busy or rate limited.", file=sys.stderr)
            raise
        except Exception as exc:  # noqa: BLE001 — must always record failure status
            fail("We could not read this CV. Check that it is a text based PDF and try again.")
            print(f"Failed to parse CV for user {user_id}: {exc}", file=sys.stderr)
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--storage-path", required=True)
    args = parser.parse_args()
    run(args.user_id, args.storage_path)
