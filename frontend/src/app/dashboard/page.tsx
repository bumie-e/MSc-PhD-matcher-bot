"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DetailDrawer } from "@/components/DetailDrawer";
import { OpportunityCard } from "@/components/OpportunityCard";
import { OpportunityListRow } from "@/components/OpportunityListRow";
import { useAllOpportunities } from "@/hooks/useAllOpportunities";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import type { MatchWithOpportunity, OpportunityType } from "@/lib/types";

type SortKey = "score" | "deadline";

export default function DashboardPage() {
  const { session, loading: sessionLoading } = useSession();
  const { profile } = useProfile(session?.user.id);
  const { matches, loading, upsertNote } = useOpportunities(session?.user.id);
  const { opportunities: allOpportunities, loading: allLoading, hasMore, loadMore } = useAllOpportunities();
  const router = useRouter();

  const [typeFilter, setTypeFilter] = useState<OpportunityType | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [selected, setSelected] = useState<MatchWithOpportunity | null>(null);

  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  const threshold = profile?.min_score_threshold ?? 0;

  const visibleMatches = useMemo(() => {
    let list = matches.filter((m) => m.score >= threshold);
    if (typeFilter !== "all") list = list.filter((m) => m.opportunity.type === typeFilter);

    return [...list].sort((a, b) => {
      if (sortKey === "score") return b.score - a.score;
      const aDate = a.opportunity.deadline ? new Date(a.opportunity.deadline).getTime() : Infinity;
      const bDate = b.opportunity.deadline ? new Date(b.opportunity.deadline).getTime() : Infinity;
      return aDate - bDate;
    });
  }, [matches, threshold, typeFilter, sortKey]);

  const scoreByOpportunityId = useMemo(() => {
    const map = new Map<string, number>();
    matches.forEach((m) => map.set(m.opportunity_id, m.score));
    return map;
  }, [matches]);

  if (sessionLoading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Your opportunities</h1>
          <p className="text-sm text-muted">{visibleMatches.length} matching your threshold</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="text-sm text-muted hover:text-ink">
            Settings
          </Link>
          <button
            onClick={() => supabase.auth.signOut().then(() => router.replace("/login"))}
            className="text-sm text-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["all", "phd", "msc"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded border px-3 py-1 text-xs uppercase ${
              typeFilter === t ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="mx-2 text-border">|</span>
        <button
          onClick={() => setSortKey("score")}
          className={`rounded border px-3 py-1 text-xs ${
            sortKey === "score" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
          }`}
        >
          Sort: score
        </button>
        <button
          onClick={() => setSortKey("deadline")}
          className={`rounded border px-3 py-1 text-xs ${
            sortKey === "deadline" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
          }`}
        >
          Sort: deadline
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading opportunities…</p>
      ) : visibleMatches.length === 0 ? (
        <p className="text-sm text-muted">
          No matches yet. The search agent runs daily — check back soon, or lower your minimum score threshold in
          Settings.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMatches.map((match) => (
            <OpportunityCard key={match.id} match={match} onClick={() => setSelected(match)} />
          ))}
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

      <hr className="my-10 border-border" />

      <section>
        <h2 className="mb-1 font-serif text-xl font-semibold text-ink">All discovered opportunities</h2>
        <p className="mb-4 text-sm text-muted">
          Everything the daily search has found so far, regardless of your match score.
        </p>

        {allLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : allOpportunities.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing found yet — the search agent runs daily, or you can trigger it from Settings.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {allOpportunities.map((opp) => (
                <OpportunityListRow
                  key={opp.id}
                  opportunity={opp}
                  score={scoreByOpportunityId.get(opp.id) ?? null}
                />
              ))}
            </div>
            {hasMore && (
              <button
                onClick={loadMore}
                className="mt-3 w-full rounded border border-border py-2 text-sm text-muted hover:text-ink"
              >
                Load more
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
