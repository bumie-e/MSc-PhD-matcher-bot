"use client";

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-6">
      <p className="mb-1.5 text-base font-bold">{label}</p>
      <div className="flex rounded-xl bg-white p-1" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`flex-1 rounded-lg py-2.5 text-lg transition-colors ${value === o.value ? "bg-brand font-bold text-white shadow" : "text-brand-deep hover:bg-brand-soft"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div>
        <p className="text-base font-bold">{label}</p>
        {hint && <p className="text-sm text-black/60">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-brand" : "bg-brand-mid"}`}
      >
        <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-6" : ""}`} />
      </button>
    </div>
  );
}

export function ScoreSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor="min-score" className="text-base font-bold">
          Minimum match score
        </label>
        <span className="text-3xl font-bold text-brand" aria-live="polite">
          {value}
        </span>
      </div>
      <input id="min-score" type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-brand" />
      <p className="mt-1.5 text-sm text-black/60">Matches scoring below this stay hidden. Lower it to see more.</p>
    </div>
  );
}
