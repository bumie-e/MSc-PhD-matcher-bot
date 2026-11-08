"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { invokeFn } from "@/lib/functions";
import { daysUntil, shortDeadline } from "@/lib/deadline";
import { getPersonalisation } from "@/lib/personalisation";
import type { Opportunity, OpportunityItem, OpportunityType, UserCv, UserLlmKey, UserNote, UserProfile } from "@/lib/types";

import { AppNav } from "./AppNav";
import { CountUp } from "./CountUp";
import { DetailPanel } from "./DetailPanel";
import { OpportunityCard } from "./OpportunityCard";
import { PersonalisationCard } from "./PersonalisationCard";

type Tab = "explore" | "foryou";
type SortKey = "newest" | "deadline" | "score";
type Focus = "all" | "closing" | "saved";

export interface DashboardViewProps {
  email: string | undefined;
  profile: UserProfile | null;
  items: OpportunityItem[];
  itemsLoading: boolean;
  upsertNote: (opportunity: Opportunity, patch: Partial<UserNote>) => unknown;
  removeNote: (opportunity: Opportunity) => unknown;
  pool: Opportunity[];
  poolLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  llmKey: UserLlmKey | null;
  cv: UserCv | null;
}

const FOCUS_LABEL: Record<Focus, string> = { all: "All openings", closing: "Closing in 14 days", saved: "Saved by you" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function firstName(displayName: string | null | undefined, email: string | undefined) {
  const raw = (displayName && !displayName.includes("@") ? displayName : (email ?? "").split("@")[0]) || "";
  const word = raw.split(/[ ._-]/)[0];
  return word ? word[0].toUpperCase() + word.slice(1) : "there";
}

const isClosingSoon = (i: OpportunityItem) => {
  const d = daysUntil(i.opportunity.deadline);
  return d !== null && d >= 0 && d <= 14;
};

const byDeadline = (a: OpportunityItem, b: OpportunityItem) => {
  const ad = a.opportunity.deadline ? new Date(a.opportunity.deadline).getTime() : Infinity;
  const bd = b.opportunity.deadline ? new Date(b.opportunity.deadline).getTime() : Infinity;
  return ad - bd;
};

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap rounded-full bg-brand-soft p-1" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} onClick={() => onChange(key)} aria-pressed={value === key} className={`rounded-full px-4 py-1.5 text-lg transition-colors ${value === key ? "bg-brand font-bold text-white" : "text-brand-deep hover:bg-brand-mid"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function DashboardView({ email, profile, items, itemsLoading, upsertNote, removeNote, pool, poolLoading, hasMore, loadMore, llmKey, cv }: DashboardViewProps) {
  const [userTab, setUserTab] = useState<Tab | null>(null);
  const [typeFilter, setTypeFilter] = useState<OpportunityType | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [focus, setFocus] = useState<Focus>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scoring, setScoring] = useState<"idle" | "starting" | "started" | "failed">("idle");

  const threshold = profile?.min_score_threshold ?? 0;

  // Everything browsable: the shared pool plus anything personal that is not in the loaded page.
  const all = useMemo(() => {
    const map = new Map<string, OpportunityItem>(items.map((i) => [i.id, i]));
    for (const o of pool) if (!map.has(o.id)) map.set(o.id, { id: o.id, opportunity: o, match: null, user_note: null });
    return [...map.values()].filter((i) => i.opportunity.is_valid !== false);
  }, [items, pool]);

  const matches = useMemo(() => items.filter((i) => i.match && i.match.score >= threshold), [items, threshold]);
  const savedCount = useMemo(() => all.filter((i) => i.user_note).length, [all]);
  const closingCount = useMemo(() => all.filter(isClosingSoon).length, [all]);

  const p = getPersonalisation({ llmKey, cv, profile, matchCount: items.filter((i) => i.match).length });
  const hasScores = items.some((i) => i.match);
  const tab: Tab = userTab ?? (hasScores ? "foryou" : "explore");
  const sort: SortKey = sortKey ?? (tab === "foryou" ? "score" : "newest");

  const list = useMemo(() => {
    let l = tab === "foryou" ? matches : all;
    if (tab === "explore") {
      if (focus === "closing") l = l.filter(isClosingSoon);
      if (focus === "saved") l = l.filter((i) => i.user_note);
    }
    if (typeFilter !== "all") l = l.filter((i) => i.opportunity.type === typeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      l = l.filter((i) =>
        [i.opportunity.title, i.opportunity.university, i.opportunity.location, i.opportunity.department].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
      );
    }
    return [...l].sort((a, b) => {
      if (sort === "score") return (b.match?.score ?? -1) - (a.match?.score ?? -1);
      if (sort === "deadline") return byDeadline(a, b);
      return new Date(b.opportunity.created_at).getTime() - new Date(a.opportunity.created_at).getTime();
    });
  }, [tab, matches, all, focus, typeFilter, query, sort]);

  const closingSoon = useMemo(() => all.filter(isClosingSoon).sort(byDeadline), [all]);
  const selected = all.find((i) => i.id === selectedId) ?? null;

  const toggleSave = (item: OpportunityItem) => {
    const note = item.user_note;
    if (!note) return void upsertNote(item.opportunity, { status: "saved" });
    if ((note.status !== "saved" || note.note) && !window.confirm("Remove this from your pipeline? Its status and notes will be deleted.")) return;
    void removeNote(item.opportunity);
  };

  const scoreNextBatch = async () => {
    setScoring("starting");
    const { error } = await invokeFn("rematch-me");
    setScoring(error ? "failed" : "started");
  };

  const name = firstName(profile?.display_name, email);
  const typeCount = (t: OpportunityType) => (tab === "foryou" ? matches : all).filter((i) => i.opportunity.type === t).length;
  const total = tab === "foryou" ? matches.length : all.length;

  const tiles: { key: string; label: string; value: number; suffix?: string; onClick: () => void; on: boolean }[] = [
    { key: "open", label: "Open positions", value: all.length, suffix: hasMore ? "+" : "", on: tab === "explore" && focus === "all", onClick: () => { setUserTab("explore"); setFocus("all"); } },
    { key: "closing", label: "Closing in 14 days", value: closingCount, on: tab === "explore" && focus === "closing", onClick: () => { setUserTab("explore"); setFocus("closing"); } },
    { key: "saved", label: "Saved by you", value: savedCount, on: tab === "explore" && focus === "saved", onClick: () => { setUserTab("explore"); setFocus("saved"); } },
    { key: "scored", label: "Scored for you", value: items.filter((i) => i.match).length, on: tab === "foryou", onClick: () => setUserTab("foryou") },
  ];

  const unlock = !p.ready
    ? {
        text: p.steps[0].state === "problem" ? "Fix your AI key to see a score, strengths and gaps for this opening." : p.steps[0].state !== "done" ? "Connect your own AI key and upload your CV to see a score, strengths and gaps for this opening." : "Finish setting up to see a score, strengths and gaps for this opening.",
        label: p.nextLabel,
        href: p.nextHref,
      }
    : { text: "This opening has not been scored yet. Score the next batch from the For you tab.", label: "Go to For you", href: "/dashboard" };

  const subtitle = tab === "foryou" && !p.ready
    ? "Browse everything now. Connect your AI key when you want scores."
    : closingCount > 0
      ? `${closingCount} ${closingCount === 1 ? "opening closes" : "openings close"} in the next two weeks.`
      : "Here is what the search has found so far.";

  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <header className="bg-brand text-white">
        <AppNav active="/dashboard" isAdmin={profile?.is_admin} />
        <div className="mx-auto max-w-6xl px-5 pb-10 pt-4 sm:px-6 sm:pt-6">
          <h1 className="anim-rise text-3xl font-bold sm:text-4xl md:text-5xl">
            {greeting()}, {name}
          </h1>
          <p className="anim-rise mt-2 text-xl text-white/90" style={{ animationDelay: "60ms" }}>
            {subtitle}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map((t, i) => (
              <button
                key={t.key}
                onClick={() => {
                  t.onClick();
                  document.getElementById("list")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                aria-pressed={t.on}
                className={`anim-rise rounded-2xl p-4 text-left transition duration-200 hover:-translate-y-0.5 ${t.on ? "bg-white text-brand shadow-lg" : "bg-brand-deep/60 text-white hover:bg-brand-deep"}`}
                style={{ animationDelay: `${120 + i * 70}ms` }}
              >
                <span className="block text-4xl font-bold">
                  <CountUp value={t.value} />
                  {t.suffix}
                </span>
                <span className={`text-base ${t.on ? "text-brand-deep" : "text-white/85"}`}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:space-y-14 sm:px-6 sm:py-12">
        {tab === "explore" && closingSoon.length > 0 && focus === "all" && !query && (
          <section aria-labelledby="closing-title">
            <h2 id="closing-title" className="text-2xl font-bold sm:text-3xl">
              Closing soon
            </h2>
            <p className="mb-5 mt-1 text-lg text-black/70">Start with these, they have the least time left.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {closingSoon.slice(0, 6).map((i, n) => (
                <button key={i.id} onClick={() => setSelectedId(i.id)} className="anim-rise flex min-w-0 flex-col items-start justify-start rounded-3xl bg-brand p-5 text-left text-white transition duration-200 hover:-translate-y-1 hover:bg-brand-deep" style={{ animationDelay: `${n * 60}ms` }}>
                  <span className="inline-block rounded-full bg-white px-3 py-1 text-base font-bold text-brand">{shortDeadline(i.opportunity.deadline)}</span>
                  <span className="mt-3 line-clamp-2 block text-xl font-bold leading-snug">{i.opportunity.title}</span>
                  <span className="mt-1 block truncate text-base text-white/85">{i.opportunity.university ?? "Several institutions"}</span>
                  {i.match && <span className="mt-3 block text-base text-white/90">Match score {i.match.score}</span>}
                </button>
              ))}
            </div>
            {closingSoon.length > 6 && (
              <button onClick={() => setFocus("closing")} className="mt-4 text-lg font-bold text-brand underline">
                See all {closingSoon.length} closing soon
              </button>
            )}
          </section>
        )}

        <section id="list" className="scroll-mt-6" aria-label="Opportunities">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-full bg-brand-soft p-1" role="tablist" aria-label="View">
              {(
                [
                  ["explore", "Explore"],
                  ["foryou", "For you"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} role="tab" aria-selected={tab === key} onClick={() => { setUserTab(key); setSortKey(null); }} className={`flex items-center gap-2 rounded-full px-5 py-2 text-xl transition-colors ${tab === key ? "bg-brand font-bold text-white" : "text-brand-deep hover:bg-brand-mid"}`}>
                  {label}
                  {key === "foryou" && !p.ready && (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Needs setup">
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V8a4 4 0 018 0v3" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            {tab === "explore" && !p.ready && (
              <Link href={p.nextHref} className="text-lg font-bold text-brand underline">
                Want scores against your CV? Set up matching
              </Link>
            )}
            {tab === "foryou" && p.ready && (
              <button onClick={scoreNextBatch} disabled={scoring === "starting" || scoring === "started"} className="rounded-xl bg-brand px-5 py-2.5 text-lg font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60">
                {scoring === "starting" ? "Starting..." : scoring === "started" ? "Scoring started" : "Score the next batch"}
              </button>
            )}
          </div>
          {tab === "foryou" && p.ready && (
            <p className="-mt-3 mb-6 text-base text-black/70" role="status">
              {scoring === "started"
                ? "New scores appear here as they finish, usually within a few minutes."
                : scoring === "failed"
                  ? "Could not start scoring. Try again in a moment."
                  : "Scoring uses your own AI key, up to 40 openings per batch."}
            </p>
          )}

          {tab === "foryou" && !p.ready && <div className="mb-10"><PersonalisationCard p={p} title={hasScores ? "Reconnect to keep scoring" : "Unlock personalised matches"} /></div>}

          {(tab === "explore" || matches.length > 0) && (
            <>
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[14rem] flex-1 md:max-w-sm">
                  <label htmlFor="search" className="sr-only">
                    Search openings
                  </label>
                  <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <input id="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search openings" className="w-full rounded-full border-2 border-brand-mid bg-brand-soft py-2.5 pl-12 pr-4 text-lg outline-none placeholder:text-black/40 focus:border-brand focus:bg-white" />
                </div>
                <Segmented label="Degree type" value={typeFilter} onChange={setTypeFilter} options={[["all", `All ${total}`], ["phd", `PhD ${typeCount("phd")}`], ["msc", `MSc ${typeCount("msc")}`]] as const} />
                <Segmented
                  label="Sort order"
                  value={sort}
                  onChange={setSortKey}
                  options={tab === "foryou" ? ([["score", "Best match"], ["deadline", "Closing soonest"]] as const) : ([["newest", "Newest"], ["deadline", "Closing soonest"]] as const)}
                />
              </div>

              {tab === "explore" && focus !== "all" && (
                <p className="mb-5 flex flex-wrap items-center gap-3 text-lg">
                  Showing: <span className="rounded-full bg-brand px-3 py-1 font-bold text-white">{FOCUS_LABEL[focus]}</span>
                  <button onClick={() => setFocus("all")} className="font-bold text-brand underline">
                    Show all
                  </button>
                </p>
              )}
            </>
          )}

          {(tab === "explore" || matches.length > 0) && (
            <>
              {(tab === "foryou" ? itemsLoading : poolLoading && all.length === 0) ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-56 rounded-3xl" />
                  ))}
                </div>
              ) : list.length === 0 ? (
                <div className="anim-rise flex flex-col items-center rounded-3xl bg-brand-soft px-6 py-14 text-center">
                  <svg viewBox="0 0 120 100" className="mb-5 h-28 w-32" aria-hidden="true">
                    <circle cx="52" cy="46" r="28" fill="#fff" stroke="#1d4ed8" strokeWidth="6" />
                    <path d="M74 68l24 24" stroke="#1d4ed8" strokeWidth="8" strokeLinecap="round" />
                    <path d="M40 46h24M52 34v24" stroke="#c9dcff" strokeWidth="6" strokeLinecap="round" />
                  </svg>
                  <h3 className="text-2xl font-bold">{all.length === 0 ? "The first search is still running" : "Nothing fits these filters"}</h3>
                  <p className="mt-2 max-w-md text-lg text-black/70">{all.length === 0 ? "New openings are collected every day. Check back soon." : "Try a different search, or clear the filters."}</p>
                  {all.length > 0 && (
                    <button onClick={() => { setFocus("all"); setTypeFilter("all"); setQuery(""); }} className="mt-6 rounded-xl bg-brand px-7 py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep">
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((i, n) => (
                    <OpportunityCard key={i.id} item={i} index={n} onOpen={() => setSelectedId(i.id)} onToggleSave={() => toggleSave(i)} />
                  ))}
                </div>
              )}
              {tab === "explore" && hasMore && (
                <button onClick={loadMore} className="mt-6 w-full rounded-2xl bg-brand py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep">
                  Load more openings
                </button>
              )}
            </>
          )}

          {tab === "foryou" && p.ready && matches.length === 0 && (
            <div className="anim-rise rounded-3xl bg-brand-soft px-6 py-12 text-center">
              <h3 className="text-2xl font-bold">Your first matches are on the way</h3>
              <p className="mx-auto mt-2 max-w-md text-lg text-black/70">We are scoring openings with your AI key. They appear here as they finish, usually within a few minutes.</p>
            </div>
          )}
        </section>
      </main>

      {selected && (
        <DetailPanel
          item={selected}
          unlock={unlock}
          onClose={() => setSelectedId(null)}
          onSaveNote={(patch) => upsertNote(selected.opportunity, patch)}
          onToggleSave={() => toggleSave(selected)}
        />
      )}
    </div>
  );
}
