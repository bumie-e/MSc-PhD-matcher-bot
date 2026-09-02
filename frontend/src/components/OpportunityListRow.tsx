import type { Opportunity } from "@/lib/types";

export function OpportunityListRow({ opportunity, score }: { opportunity: Opportunity; score: number | null }) {
  return (
    <a
      href={opportunity.source_url}
      target="_blank"
      rel="noreferrer"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-sm last:border-b-0 hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{opportunity.title}</p>
        <p className="truncate text-xs text-muted">
          {opportunity.university ?? "Multiple / unspecified institutions"}
          {opportunity.department ? ` · ${opportunity.department}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs text-muted">
        <span className="rounded border border-border px-1.5 py-0.5 uppercase">{opportunity.type}</span>
        <span>{opportunity.source_name}</span>
        {opportunity.deadline && <span>{opportunity.deadline}</span>}
        {score !== null && (
          <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent">score {score}</span>
        )}
      </div>
    </a>
  );
}
