"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DetailPanel } from "@/components/dashboard/DetailPanel";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { PageLoading, PageShell } from "@/components/ui/PageShell";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { daysUntil, shortDeadline } from "@/lib/deadline";
import type { NoteStatus, OpportunityItem } from "@/lib/types";

const COLUMNS: { status: NoteStatus; label: string }[] = [
  { status: "saved", label: "Interested" },
  { status: "applied", label: "Applied" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Rejected" },
];

function statusOf(item: OpportunityItem): NoteStatus {
  return item.user_note?.status ?? "saved";
}

function rankOf(item: OpportunityItem): number {
  return item.user_note?.custom_rank ?? item.match?.score ?? 0;
}

export default function PipelinePage() {
  const { session, loading: sessionLoading } = useSession();
  const { profile } = useProfile(session?.user.id);
  const { items, loading, upsertNote, removeNote } = useOpportunities(session?.user.id);
  // The pipeline is what you chose to track. Scored-but-unsaved matches stay on the dashboard.
  const tracked = useMemo(() => items.filter((i) => i.user_note), [items]);
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<NoteStatus | null>(null);
  const [tab, setTab] = useState<NoteStatus>("saved");

  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  const columns = useMemo(() => {
    const byStatus = new Map<NoteStatus, OpportunityItem[]>(COLUMNS.map((c) => [c.status, []]));
    for (const item of tracked) byStatus.get(statusOf(item))?.push(item);
    for (const list of byStatus.values()) list.sort((a, b) => rankOf(b) - rankOf(a));
    return byStatus;
  }, [tracked]);

  const moveCard = async (itemId: string, targetStatus: NoteStatus, targetIndex: number) => {
    const item = tracked.find((m) => m.id === itemId);
    if (!item) return;

    const siblings = (columns.get(targetStatus) ?? []).filter((c) => c.id !== itemId);
    const above = siblings[targetIndex - 1];
    const below = siblings[targetIndex];

    let rank: number;
    if (above && below) rank = (rankOf(above) + rankOf(below)) / 2;
    else if (above) rank = rankOf(above) - 1;
    else if (below) rank = rankOf(below) + 1;
    else rank = item.match?.score ?? 0;

    await upsertNote(item.opportunity, { status: targetStatus, custom_rank: rank });
  };

  if (sessionLoading || !session) return <PageLoading />;

  const selected = tracked.find((m) => m.id === selectedId) ?? null;
  const total = tracked.length;

  return (
    <PageShell
      active="/pipeline"
      isAdmin={profile?.is_admin}
      title="Your pipeline"
      subtitle="Everything you saved, from interested to offer. Drag cards between columns, or use the Move menu on a card."
    >
      {/* Phones and tablets show one column at a time. */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-brand-soft p-1 lg:hidden" role="tablist" aria-label="Pipeline stage">
        {COLUMNS.map(({ status, label }) => (
          <button
            key={status}
            role="tab"
            aria-selected={tab === status}
            onClick={() => setTab(status)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-lg transition-colors ${tab === status ? "bg-brand font-bold text-white" : "text-brand-deep hover:bg-brand-mid"}`}
          >
            {label} <span className="opacity-80">{columns.get(status)?.length ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`skeleton h-64 rounded-3xl ${i > 0 ? "hidden lg:block" : ""}`} />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="anim-rise flex flex-col items-center rounded-3xl bg-brand-soft px-6 py-14 text-center">
          <h2 className="text-2xl font-bold">Your pipeline is empty</h2>
          <p className="mt-2 max-w-md text-lg text-black/70">Save an opening from the dashboard and it appears here, so you can track where each application stands. No AI key needed.</p>
          <Link href="/dashboard" className="mt-6 rounded-xl bg-brand px-7 py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep">
            Browse openings
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-4">
          {COLUMNS.map(({ status, label }) => {
            const cards = columns.get(status) ?? [];
            const isOver = overColumn === status;
            return (
              <section
                key={status}
                aria-label={label}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverColumn(status);
                }}
                onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const matchId = e.dataTransfer.getData("text/plain");
                  if (matchId) moveCard(matchId, status, cards.length);
                  setDraggingId(null);
                  setOverColumn(null);
                }}
                className={`min-h-[12rem] flex-col gap-3 rounded-3xl p-3 transition-colors duration-150 ${tab === status ? "flex" : "hidden"} lg:flex ${isOver ? "bg-brand-mid" : "bg-brand-soft"}`}
              >
                <h2 className="hidden items-center justify-between px-2 pt-1 text-xl font-bold lg:flex">
                  {label}
                  <span className="rounded-full bg-white px-3 py-0.5 text-base text-brand">{cards.length}</span>
                </h2>

                {cards.map((item, index) => {
                  const days = daysUntil(item.opportunity.deadline);
                  const urgent = days !== null && days >= 0 && days <= 14;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", item.id);
                        setDraggingId(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverColumn(null);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const matchId = e.dataTransfer.getData("text/plain");
                        if (matchId) moveCard(matchId, status, index);
                        setDraggingId(null);
                        setOverColumn(null);
                      }}
                      className={`anim-rise relative cursor-grab rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,30,100,0.08),0_6px_16px_-10px_rgba(0,30,100,0.25)] transition duration-150 active:cursor-grabbing ${draggingId === item.id ? "scale-95 opacity-40" : "hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_rgba(29,78,216,0.45)]"}`}
                      style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
                    >
                      <button onClick={() => setSelectedId(item.id)} className="absolute inset-0 rounded-2xl" aria-label={`Open details for ${item.opportunity.title}`} />
                      <div className="pointer-events-none flex items-start gap-3">
                        {item.match ? <ScoreRing score={item.match.score} size={44} /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-deep">{item.opportunity.type === "phd" ? "PhD" : "MSc"}</span>}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-lg font-bold leading-snug">{item.opportunity.title}</p>
                          <p className="truncate text-base text-black/70">{item.opportunity.university ?? "Several institutions"}</p>
                        </div>
                      </div>
                      {item.opportunity.deadline && (
                        <p className="pointer-events-none mt-3">
                          <span className={`inline-block rounded-full px-3 py-1 text-sm ${urgent ? "bg-brand-deep font-bold text-white" : "bg-brand-soft text-brand-deep"}`}>{shortDeadline(item.opportunity.deadline)}</span>
                        </p>
                      )}
                      <div className="relative mt-3">
                        <label htmlFor={`move-${item.id}`} className="sr-only">
                          Move {item.opportunity.title} to
                        </label>
                        <select
                          id={`move-${item.id}`}
                          value={status}
                          onChange={(e) => moveCard(item.id, e.target.value as NoteStatus, (columns.get(e.target.value as NoteStatus) ?? []).length)}
                          className="w-full cursor-pointer rounded-lg border-2 border-brand-mid bg-white px-3 py-1.5 text-base text-brand-deep outline-none focus:border-brand"
                        >
                          {COLUMNS.map((c) => (
                            <option key={c.status} value={c.status}>
                              {c.status === status ? `Stage: ${c.label}` : `Move to ${c.label}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <p className="rounded-2xl border-2 border-dashed border-brand-mid px-4 py-8 text-center text-base text-black/60">
                    Nothing here yet. Drag a card in, or use Move on any card.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selected && (
        <DetailPanel
          item={selected}
          unlock={null}
          onClose={() => setSelectedId(null)}
          onSaveNote={(patch) => upsertNote(selected.opportunity, patch)}
          onToggleSave={() => {
            if (!window.confirm("Remove this from your pipeline? Its status and notes will be deleted.")) return;
            removeNote(selected.opportunity);
            setSelectedId(null);
          }}
        />
      )}
    </PageShell>
  );
}
