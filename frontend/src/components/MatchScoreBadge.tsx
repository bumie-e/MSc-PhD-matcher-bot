export function MatchScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : score >= 50
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-red-100 text-red-800 border-red-300";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold ${tone}`}>
      {score}
    </span>
  );
}
