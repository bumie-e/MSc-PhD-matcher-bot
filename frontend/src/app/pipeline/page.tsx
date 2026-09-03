"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DetailDrawer } from "@/components/DetailDrawer";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useSession } from "@/hooks/useSession";
import type { MatchWithOpportunity, NoteStatus } from "@/lib/types";

const COLUMNS: { status: NoteStatus; label: string }[] = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Rejected" },
];

function statusOf(match: MatchWithOpportunity): NoteStatus {
  return match.user_note?.status ?? "saved";
}

function rankOf(match: MatchWithOpportunity): number {
  return match.user_note?.custom_rank ?? match.score;
}

export default function PipelinePage() {
  const { session, loading: sessionLoading } = useSession();
  const { matches, loading, upsertNote } = useOpportunities(session?.user.id);
  const router = useRouter();

  const [selected, setSelected] = useState<MatchWithOpportunity | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  const columns = useMemo(() => {
    const byStatus = new Map<NoteStatus, MatchWithOpportunity[]>(COLUMNS.map((c) => [c.status, []]));
    for (const match of matches) {
      byStatus.get(statusOf(match))?.push(match);
    }
    for (const list of byStatus.values()) {
      list.sort((a, b) => rankOf(b) - rankOf(a));
    }
    return byStatus;
  }, [matches]);

  const moveCard = async (matchId: string, targetStatus: NoteStatus, targetIndex: number) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    const columnCards = columns.get(targetStatus) ?? [];
    const siblings = columnCards.filter((c) => c.id !== matchId);
    const above = siblings[targetIndex - 1];
    const below = siblings[targetIndex];

    let rank: number;
    if (above && below) rank = (rankOf(above) + rankOf(below)) / 2;
    else if (above) rank = rankOf(above) - 1;
    else if (below) rank = rankOf(below) + 1;
    else rank = match.score;

    await upsertNote(match.opportunity_id, { status: targetStatus, custom_rank: rank });
  };

  if (sessionLoading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Pipeline</h1>
          <p className="text-sm text-muted">Drag cards between columns to track your application status.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
            Dashboard
          </Link>
          <Link href="/settings" className="text-sm text-muted hover:text-ink">
            Settings
          </Link>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map(({ status, label }) => {
            const cards = columns.get(status) ?? [];
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const matchId = e.dataTransfer.getData("text/plain");
                  if (matchId) moveCard(matchId, status, cards.length);
                  setDraggingId(null);
                }}
                className="flex min-h-[200px] flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3"
              >
                <h2 className="mb-1 flex items-center justify-between font-mono text-xs font-semibold uppercase tracking-wide text-muted">
                  {label}
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px]">{cards.length}</span>
                </h2>

                {cards.map((match, index) => (
                  <div
                    key={match.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", match.id);
                      setDraggingId(match.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const matchId = e.dataTransfer.getData("text/plain");
                      if (matchId) moveCard(matchId, status, index);
                      setDraggingId(null);
                    }}
                    onClick={() => setSelected(match)}
                    className={`cursor-grab rounded-lg border border-border bg-surface p-3 text-left transition active:cursor-grabbing ${
                      draggingId === match.id ? "opacity-40" : "hover:border-accent"
                    }`}
                  >
                    <p className="mb-1 line-clamp-2 font-serif text-sm font-semibold leading-snug text-ink">
                      {match.opportunity.title}
                    </p>
                    <p className="mb-2 truncate text-xs text-muted">
                      {match.opportunity.university ?? "Multiple / unspecified institutions"}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                        score {match.score}
                      </span>
                      <ConfidenceBadge confidence={match.confidence} />
                    </div>
                  </div>
                ))}

                {cards.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted">Nothing here yet — drop a card in.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <DetailDrawer
          match={selected}
          onClose={() => setSelected(null)}
          onSaveNote={async (patch) => {
            const result = await upsertNote(selected.opportunity_id, patch);
            if (result?.data) setSelected({ ...selected, user_note: result.data });
          }}
        />
      )}
    </main>
  );
}
