export function deadlineLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return "Deadline passed";
  if (diff === 0) return "Deadline today";
  if (diff === 1) return "1 day left";
  return `${diff} days left`;
}

/** Tailwind classes for the deadline badge, scaled by urgency. */
export function deadlineTone(dateStr: string | null): string {
  if (!dateStr) return "text-muted";
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return "text-muted line-through";
  if (diff <= 7) return "text-red-700";
  if (diff <= 30) return "text-signal";
  return "text-muted";
}
