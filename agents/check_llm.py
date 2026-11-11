"""Run the three agent calls with synthetic data and an environment-only API key.

Example: uv run --env-file .env python -m agents.check_llm --provider deepseek --model deepseek-flash
No database access, scraping, or stored user data is needed.
"""

import argparse
import os

from agents.cv.parser import structure_cv_text
from agents.llm import LLM, LLMError
from agents.llm_providers import PROVIDERS
from agents.matching.agent import score_match
from agents.search.agent import structure_listing

SYNTHETIC_CV = """Ada Example
BSc Computer Science, University of Lagos, completed 2025. GPA 4.5/5.0.
Research assistant, machine learning lab, 2024-2025: evaluated image classification
models for a final-year research project. Skills: Python, PyTorch, statistics.
Languages: English. No publications.
"""

SYNTHETIC_LISTING = {
    "title": "Fully funded PhD in Computer Science — Machine Learning",
    "university": "University of Lagos",
    "snippet": """The Department of Computer Science at the University of Lagos invites
applications for one fully funded PhD position in machine learning, starting
September 2030. Funding covers tuition and a monthly stipend. Requirements:
BSc or MSc in computer science, GPA at least 4.0/5.0, Python and statistics.
Apply by 2030-03-31 with a CV, transcripts and a research statement through
the university graduate admissions portal. Location: Lagos, Nigeria.""",
    "source_url": "https://example.edu/graduate/phd-machine-learning",
    "source_name": "synthetic-check",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=sorted(PROVIDERS), required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    key = os.environ.get(f"{args.provider.upper()}_API_KEY")
    if not key:
        print(f"Missing {args.provider.upper()}_API_KEY environment variable.")
        return 1

    step = "CV parsing"
    try:
        with LLM(args.provider, key, args.model) as llm:
            cv = structure_cv_text(SYNTHETIC_CV, llm)
            print(f"{args.provider}: {step} PASS")
            step = "listing extraction"
            opportunity = structure_listing(SYNTHETIC_LISTING, llm)
            if opportunity is None:
                raise ValueError("No structured opportunity")
            print(f"{args.provider}: {step} PASS")
            step = "match scoring"
            match = score_match(
                llm, {"parsed": cv}, {"degree_type": "phd", "field_of_study": "computer science"},
                {"id": "synthetic-check", **opportunity},
            )
            if match is None or match["not_an_opportunity"]:
                raise ValueError("No usable match")
            print(f"{args.provider}: {step} PASS")
    except (LLMError, ValueError) as exc:
        # Neither provider bodies nor response-validation details belong in logs.
        print(f"{args.provider}: {step} FAIL ({type(exc).__name__})")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
