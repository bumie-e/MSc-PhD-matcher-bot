import type { MatchConfidence } from "@/lib/types";

const LABELS: Record<MatchConfidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

const DOT_TONE: Record<MatchConfidence, string> = {
  low: "bg-red-500",
  medium: "bg-signal",
  high: "bg-signal-green",
};

export function ConfidenceBadge({ confidence }: { confidence: MatchConfidence }) {
  return (
    <span
      title="How much detail the match agent had to work with — not how good the match is"
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[confidence]}`} />
      {LABELS[confidence]}
    </span>
  );
}
