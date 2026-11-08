"use client";

import { useState } from "react";

import { daysUntil, shortDeadline } from "@/lib/deadline";
import type { MatchConfidence, OpportunityItem } from "@/lib/types";

import { ScoreRing } from "./ScoreRing";

const CONFIDENCE_DOTS: Record<MatchConfidence, number> = { low: 1, medium: 2, high: 3 };

export function ConfidenceDots({ confidence }: { confidence: MatchConfidence }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-black/70" title="How much detail the match had to work with, not how good the match is">
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= CONFIDENCE_DOTS[confidence] ? "bg-brand" : "bg-brand-mid"}`} />
        ))}
      </span>
      {confidence[0].toUpperCase() + confidence.slice(1)} confidence
    </span>
  );
}

// Saving an opening puts it in your pipeline. Works with or without an AI key.
export function SaveButton({ saved, onToggle, className = "" }: { saved: boolean; onToggle: () => void; className?: string }) {
  const [popKey, setPopKey] = useState(0);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setPopKey((k) => k + 1);
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save to your pipeline"}
      title={saved ? "Saved. Click to remove" : "Save to your pipeline"}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-brand-soft ${className}`}
    >
      <svg key={popKey} viewBox="0 0 24 24" className={`h-5 w-5 ${popKey ? "anim-pop" : ""}`} fill={saved ? "#1d4ed8" : "none"} stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3h12v18l-6-4-6 4z" />
      </svg>
    </button>
  );
}

export function OpportunityCard({
  item,
  index,
  onOpen,
  onToggleSave,
}: {
  item: OpportunityItem;
  index: number;
  onOpen: () => void;
  onToggleSave: () => void;
}) {
  const { opportunity: opp, match, user_note: note } = item;
  const deadline = shortDeadline(opp.deadline);
  const days = daysUntil(opp.deadline);
  const urgent = days !== null && days >= 0 && days <= 14;
  const status = note?.status;

  return (
    <div
      className="anim-rise group relative flex flex-col rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,30,100,0.08),0_8px_24px_-12px_rgba(0,30,100,0.2)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_32px_-12px_rgba(29,78,216,0.45)]"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <button onClick={onOpen} className="absolute inset-0 rounded-3xl" aria-label={`Open details for ${opp.title}`} />
      <div className="pointer-events-none flex items-start gap-4">
        {match && <ScoreRing score={match.score} />}
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold leading-snug text-black">{opp.title}</h3>
          <p className="mt-0.5 text-base text-black/70">{opp.university ?? "Several institutions"}</p>
        </div>
      </div>

      {match ? (
        <p className="pointer-events-none mt-4 line-clamp-2 text-base text-black/80">{match.summary}</p>
      ) : (
        opp.stipend && <p className="pointer-events-none mt-4 line-clamp-2 text-base text-black/80">Funding: {opp.stipend}</p>
      )}

      <div className="pointer-events-none mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-brand px-3 py-1 font-bold text-white">{opp.type === "phd" ? "PhD" : "MSc"}</span>
        {deadline && <span className={`rounded-full px-3 py-1 ${urgent ? "bg-brand-deep font-bold text-white" : "bg-brand-soft text-brand-deep"}`}>{deadline}</span>}
        {opp.location && <span className="rounded-full bg-brand-soft px-3 py-1 text-brand-deep">{opp.location}</span>}
        {status && status !== "saved" && <span className="rounded-full border-2 border-brand px-3 py-0.5 font-bold capitalize text-brand">{status}</span>}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="pointer-events-none text-sm text-black/60">
          {match ? <ConfidenceDots confidence={match.confidence} /> : `From ${opp.source_name}`}
        </span>
        <SaveButton saved={!!note} onToggle={onToggleSave} className="relative z-10 -mr-2" />
      </div>
    </div>
  );
}
