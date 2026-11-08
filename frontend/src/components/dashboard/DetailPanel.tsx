"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { shortDeadline } from "@/lib/deadline";
import type { NoteStatus, OpportunityItem } from "@/lib/types";

import { ConfidenceDots, SaveButton } from "./OpportunityCard";
import { ScoreRing } from "./ScoreRing";

const STATUS_OPTIONS: { value: NoteStatus; label: string }[] = [
  { value: "saved", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];

export interface UnlockPrompt {
  text: string;
  label: string;
  href: string;
}

export function DetailPanel({
  item,
  unlock,
  onClose,
  onSaveNote,
  onToggleSave,
}: {
  item: OpportunityItem;
  /** Shown instead of the match analysis when this opening has not been scored. */
  unlock?: UnlockPrompt | null;
  onClose: () => void;
  onSaveNote: (patch: { note?: string; status?: NoteStatus; pinned?: boolean }) => void;
  onToggleSave: () => void;
}) {
  const { opportunity: opp, match, user_note: note } = item;
  const [noteText, setNoteText] = useState(note?.note ?? "");
  const [saved, setSaved] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const facts = [
    { label: "Deadline", value: opp.deadline ? `${new Date(opp.deadline).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} (${shortDeadline(opp.deadline)?.toLowerCase()})` : "Not listed" },
    { label: "Location", value: opp.location ?? "Not listed" },
    { label: "Funding", value: opp.stipend ?? "Not listed" },
    { label: "Starts", value: opp.semester ?? "Not listed" },
  ];

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={opp.title}
        className="anim-slide-in h-full w-full max-w-lg overflow-y-auto bg-white text-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-brand p-6 text-white">
          <div className="mb-5 flex items-center justify-between">
            <button ref={closeRef} onClick={onClose} className="rounded-full bg-white/15 px-4 py-1.5 text-base font-bold hover:bg-white/25">
              Close
            </button>
            <SaveButton saved={!!note} onToggle={onToggleSave} className="bg-white hover:bg-brand-soft" />
          </div>
          <div className="flex items-start gap-4">
            {match && <ScoreRing score={match.score} size={72} light />}
            <div>
              <h2 className="text-2xl font-bold leading-tight">{opp.title}</h2>
              <p className="mt-1 text-lg text-white/90">{[opp.university, opp.department, opp.professor].filter(Boolean).join(", ") || "Several institutions"}</p>
            </div>
          </div>
        </div>

        <div className="space-y-7 p-6">
          {match ? (
            <>
              <ConfidenceDots confidence={match.confidence} />
              <section>
                <h3 className="mb-2 text-xl font-bold">Why this matches you</h3>
                <p className="text-lg leading-relaxed">{match.summary}</p>
              </section>
              {(match.pros.length > 0 || match.cons.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {match.pros.length > 0 && (
                    <section className="rounded-2xl bg-brand-soft p-4">
                      <h3 className="mb-2 text-lg font-bold text-brand-deep">Strengths</h3>
                      <ul className="list-disc space-y-1 pl-5 text-base">
                        {match.pros.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {match.cons.length > 0 && (
                    <section className="rounded-2xl bg-brand-soft p-4">
                      <h3 className="mb-2 text-lg font-bold text-brand-deep">Gaps to address</h3>
                      <ul className="list-disc space-y-1 pl-5 text-base">
                        {match.cons.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </>
          ) : (
            unlock && (
              <section className="rounded-2xl bg-brand-soft p-5">
                <h3 className="text-xl font-bold">How well do you fit?</h3>
                <p className="mb-4 mt-1 text-base text-black/80">{unlock.text}</p>
                <Link href={unlock.href} className="inline-block rounded-xl bg-brand px-5 py-2.5 text-lg font-bold text-white transition-colors hover:bg-brand-deep">
                  {unlock.label}
                </Link>
              </section>
            )
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-base text-black/60">{f.label}</dt>
                <dd className="text-lg font-bold">{f.value}</dd>
              </div>
            ))}
          </dl>

          {opp.how_to_apply && (
            <section>
              <h3 className="mb-1 text-xl font-bold">How to apply</h3>
              <p className="text-lg leading-relaxed">{opp.how_to_apply}</p>
            </section>
          )}

          <a href={opp.source_url} target="_blank" rel="noreferrer" className="block rounded-xl bg-brand py-3 text-center text-lg font-bold text-white transition-colors hover:bg-brand-deep">
            Open the original posting on {opp.source_name}
          </a>

          <section className="rounded-3xl bg-brand-soft p-5">
            <h3 className="mb-3 text-xl font-bold">Your progress</h3>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((s) => {
                const on = !!note && note.status === s.value;
                return (
                  <button key={s.value} onClick={() => onSaveNote({ status: s.value })} aria-pressed={on} className={`rounded-xl py-2.5 text-base font-bold transition-colors ${on ? "bg-brand text-white" : "bg-white text-brand hover:bg-brand-mid"}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
            <label htmlFor="note" className="mb-1 block text-base font-bold">
              Private notes
            </label>
            <textarea
              id="note"
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                setSaved(false);
              }}
              onBlur={() => {
                if (noteText === (note?.note ?? "")) return;
                onSaveNote({ note: noteText });
                setSaved(true);
              }}
              rows={4}
              placeholder="Supervisor to email, documents to prepare, questions to ask"
              className="w-full rounded-xl border border-brand-mid bg-white px-4 py-3 text-lg outline-none placeholder:text-black/40 focus:border-brand"
            />
            <p className="mt-1 h-5 text-sm text-brand-deep" aria-live="polite">
              {saved ? "Saved" : ""}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
