"""Agent run logging (Phase 5) — wrap an agent's entrypoint in track_run so
every search/match/cv_parse invocation lands a row in `agent_runs` for the
admin UI, without every agent hand-rolling its own bookkeeping.
"""

from contextlib import contextmanager
from datetime import datetime, timezone

from agents.db import get_client


@contextmanager
def track_run(agent: str, **meta):
    """Yields a mutable `summary` dict — populate it with counts/ids as the
    run progresses. Logs 'success' with that summary on a clean exit, or
    'error' (with the exception message) if the wrapped code raises; the
    exception is always re-raised so the workflow step still fails loudly."""
    db = get_client()
    resp = (
        db.table("agent_runs")
        .insert({"agent": agent, "status": "running", "meta": meta})
        .execute()
    )
    run_id = resp.data[0]["id"]
    summary: dict = {}

    try:
        yield summary
    except Exception as exc:
        db.table("agent_runs").update(
            {
                "status": "error",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "summary": summary,
                "error": str(exc)[:2000],
            }
        ).eq("id", run_id).execute()
        raise
    else:
        db.table("agent_runs").update(
            {
                "status": "success",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "summary": summary,
            }
        ).eq("id", run_id).execute()
