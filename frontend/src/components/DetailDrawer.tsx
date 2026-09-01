"use client";

import { useState } from "react";

import type { MatchWithOpportunity, NoteStatus } from "@/lib/types";

import { MatchScoreBadge } from "./MatchScoreBadge";

const STATUS_OPTIONS: NoteStatus[] = ["saved", "applied", "rejected", "offer"];

export function DetailDrawer({
  match,
  onClose,
  onSaveNote,
}: {
  match: MatchWithOpportunity;
  onClose: () => void;
  onSaveNote: (patch: { note?: string; status?: NoteStatus; pinned?: boolean }) => void;
}) {
  const opp = match.opportunity;
  const [noteText, setNoteText] = useState(match.user_note?.note ?? "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="mb-4 text-sm text-muted hover:text-ink">
          ← Close
        </button>

        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold text-ink">{opp.title}</h2>
          <MatchScoreBadge score={match.score} />
        </div>
        <p className="mb-4 text-sm text-muted">
          {opp.university}
          {opp.department ? ` · ${opp.department}` : ""}
          {opp.professor ? ` · ${opp.professor}` : ""}
        </p>

        <dl className="mb-4 grid grid-cols-2 gap-3 font-mono text-xs">
          <div>
            <dt className="text-muted">Type</dt>
            <dd className="uppercase text-ink">{opp.type}</dd>
          </div>
          <div>
            <dt className="text-muted">Deadline</dt>
            <dd className="text-ink">{opp.deadline ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Location</dt>
            <dd className="text-ink">{opp.location}</dd>
          </div>
          <div>
            <dt className="text-muted">Stipend</dt>
            <dd className="text-ink">{opp.stipend ?? "—"}</dd>
          </div>
        </dl>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Why this match</h3>
        <p className="mb-4 text-sm text-ink">{match.summary}</p>

        {match.pros.length > 0 && (
          <div className="mb-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Pros</h3>
            <ul className="list-inside list-disc text-sm text-ink">
              {match.pros.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {match.cons.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">Cons</h3>
            <ul className="list-inside list-disc text-sm text-ink">
              {match.cons.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {opp.how_to_apply && (
          <div className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">How to apply</h3>
            <p className="text-sm text-ink">{opp.how_to_apply}</p>
          </div>
        )}

        <a
          href={opp.source_url}
          target="_blank"
          rel="noreferrer"
          className="mb-6 block text-sm text-accent underline"
        >
          View original posting ({opp.source_name})
        </a>

        <hr className="mb-4 border-border" />

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your status</h3>
        <div className="mb-4 flex gap-2">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => onSaveNote({ status })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs capitalize ${
                match.user_note?.status === status
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Notes</h3>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onBlur={() => onSaveNote({ note: noteText })}
          rows={4}
          placeholder="Add a private note…"
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}
