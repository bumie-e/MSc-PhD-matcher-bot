import { deadlineLabel, deadlineTone } from "@/lib/deadline";
import type { MatchWithOpportunity } from "@/lib/types";

import { ConfidenceBadge } from "./ConfidenceBadge";
import { MatchScoreBadge } from "./MatchScoreBadge";

export function OpportunityCard({ match, onClick }: { match: MatchWithOpportunity; onClick: () => void }) {
  const opp = match.opportunity;
  const deadline = deadlineLabel(opp.deadline);

  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-left transition hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-base font-semibold leading-snug text-ink">{opp.title}</h3>
        <MatchScoreBadge score={match.score} />
      </div>
      <p className="text-sm text-muted">
        {opp.university ?? "Multiple / unspecified institutions"}
        {opp.department ? ` · ${opp.department}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
        <span className="rounded border border-border px-1.5 py-0.5 uppercase">{opp.type}</span>
        {opp.location && <span>{opp.location}</span>}
        {deadline && <span className={deadlineTone(opp.deadline)}>{deadline}</span>}
        {opp.stipend && <span>· {opp.stipend}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <ConfidenceBadge confidence={match.confidence} />
        {match.user_note?.status && match.user_note.status !== "saved" && (
          <span className="w-fit rounded bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase text-accent">
            {match.user_note.status}
          </span>
        )}
      </div>
    </button>
  );
}
