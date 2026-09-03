"""CV parser: downloads a user's uploaded PDF from Supabase Storage, extracts
raw text with PyMuPDF, then asks Groq to structure it. Invoked by
.github/workflows/parse-cv.yml with user_id and storage_path inputs.
"""

import argparse
import json
import sys
import tempfile

import pymupdf as fitz

from agents import run_log
from agents.db import get_client
from agents.llm import get_groq_client
from config import settings

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
  "skills": [string]
}

Use [] for any list you find nothing for. Never invent details not present in the text."""


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


def structure_cv_text(raw_text: str) -> dict:
    client = get_groq_client()
    resp = client.chat.completions.create(
        model=settings.CV_STRUCTURE_MODEL,
        messages=[
            {"role": "system", "content": STRUCTURE_SYSTEM_PROMPT},
            {"role": "user", "content": raw_text[:20000]},
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=4096,
        # gpt-oss models emit a hidden reasoning trace before the JSON body;
        # without this, unbounded reasoning can consume the whole token
        # budget and leave nothing for the actual output (empty content ->
        # json_validate_failed). Groq-specific param, not in the OpenAI SDK's
        # typed kwargs, so it goes through extra_body.
        extra_body={"reasoning_effort": "low"},
    )
    return json.loads(resp.choices[0].message.content)


def run(user_id: str, storage_path: str) -> None:
    db = get_client()
    with run_log.track_run("cv_parse", user_id=user_id, storage_path=storage_path) as summary:
        try:
            pdf_bytes = download_cv(storage_path)
            raw_text = extract_text(pdf_bytes)
            parsed = structure_cv_text(raw_text)

            db.table("user_cv").update(
                {
                    "raw_text": raw_text,
                    "parsed": parsed,
                    "parse_status": "done",
                }
            ).eq("user_id", user_id).eq("storage_path", storage_path).execute()
            summary["parse_status"] = "done"
            print(f"Parsed CV for user {user_id}.")
        except Exception as exc:  # noqa: BLE001 — must always record failure status
            db.table("user_cv").update({"parse_status": "error"}).eq("user_id", user_id).eq(
                "storage_path", storage_path
            ).execute()
            print(f"Failed to parse CV for user {user_id}: {exc}", file=sys.stderr)
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--storage-path", required=True)
    args = parser.parse_args()
    run(args.user_id, args.storage_path)
