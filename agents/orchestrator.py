"""Pure-Python coordinator, no LLM. Runs inside search.yml after the search
agent finishes: dispatches match.yml with the new opportunity ids via the
GitHub API.
"""

import argparse
import os
import sys

import httpx

GITHUB_API = "https://api.github.com"


def dispatch_match_workflow(repo: str, token: str, opp_ids: list[str]) -> None:
    if not opp_ids:
        print("No new opportunities — skipping match.yml dispatch.")
        return

    url = f"{GITHUB_API}/repos/{repo}/actions/workflows/match.yml/dispatches"
    resp = httpx.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        },
        json={"ref": "main", "inputs": {"opp_ids": ",".join(opp_ids), "user_id": ""}},
        timeout=15.0,
    )
    resp.raise_for_status()
    print(f"Dispatched match.yml for {len(opp_ids)} new opportunities.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--opp-ids", required=True, help="comma-separated opportunity ids")
    args = parser.parse_args()

    repo = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    if not repo or not token:
        print("GITHUB_REPOSITORY / GITHUB_TOKEN not set — run this inside GitHub Actions.", file=sys.stderr)
        sys.exit(1)

    ids = [i for i in args.opp_ids.split(",") if i]
    dispatch_match_workflow(repo, token, ids)
