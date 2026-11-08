"use client";

import { useState } from "react";

import { labelClass } from "@/components/AuthShell";

// Comma-separated lists as removable chips. Enter, comma or leaving the field adds a tag.
export function TagInput({
  id,
  label,
  hint,
  value,
  onChange,
  max,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const full = max !== undefined && value.length >= max;

  const add = (raw: string) => {
    const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return;
    const next = [...value];
    for (const item of items) {
      if (max !== undefined && next.length >= max) break;
      if (!next.some((v) => v.toLowerCase() === item.toLowerCase())) next.push(item);
    }
    onChange(next);
    setDraft("");
  };

  return (
    <div className="mb-6">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex flex-wrap gap-2 rounded-lg border-2 border-brand-mid bg-white p-2 transition-colors focus-within:border-brand">
        {value.map((tag) => (
          <span key={tag} className="anim-pop inline-flex items-center gap-1 rounded-full bg-brand py-1 pl-3 pr-1 text-base font-bold text-white">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== tag))}
              aria-label={`Remove ${tag}`}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/25"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          disabled={full}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length === 0 ? placeholder : full ? "Limit reached" : "Add another"}
          className="min-w-[9rem] flex-1 bg-transparent px-2 py-1.5 text-lg outline-none placeholder:text-black/40"
        />
      </div>
      <p className="mt-1.5 text-sm text-black/60">
        {hint}
        {max !== undefined && ` ${value.length} of ${max}.`}
      </p>
    </div>
  );
}
