"use client";

import Link from "next/link";

import type { Personalisation, StepState } from "@/lib/personalisation";

function Marker({ state, index }: { state: StepState; index: number }) {
  const base = "mb-3 flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold";
  if (state === "done")
    return (
      <span className={`${base} bg-brand text-white`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="Done">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  if (state === "working")
    return (
      <span className={`${base} bg-brand-mid text-brand-deep`} aria-label="In progress">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent motion-reduce:animate-none" />
      </span>
    );
  if (state === "problem") return <span className={`${base} border-2 border-black bg-white text-black`} aria-label="Needs attention">!</span>;
  return <span className={`${base} ${state === "locked" ? "bg-white/70 text-black/50" : "bg-brand-mid text-brand-deep"}`}>{index + 1}</span>;
}

// Explains what personalised matching needs and where the user is in it.
// Browsing and tracking work without any of this.
export function PersonalisationCard({ p, title = "Unlock personalised matches" }: { p: Personalisation; title?: string }) {
  return (
    <section className="anim-rise rounded-3xl bg-brand-soft p-5 sm:p-6 md:p-8" aria-labelledby="unlock-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="unlock-title" className="text-2xl font-bold sm:text-3xl">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-lg text-black/70">Browse and save openings any time. To score them against your CV, connect your own AI key and tell us what you want.</p>
        </div>
        <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={p.doneCount} aria-valuemin={0} aria-valuemax={p.steps.length} aria-label="Setup progress">
          <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${(p.doneCount / p.steps.length) * 100}%` }} />
        </div>
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {p.steps.map((s, i) => (
          <li key={s.id} className={`flex flex-col rounded-2xl p-5 ${s.state === "done" ? "bg-white/60" : "bg-white shadow-sm"}`}>
            <Marker state={s.state} index={i} />
            <h3 className="text-xl font-bold">{s.title}</h3>
            <p className="mt-1 flex-1 text-base text-black/70">{s.detail}</p>
          </li>
        ))}
      </ol>

      {!p.ready && (
        <Link href={p.nextHref} className="mt-6 inline-block rounded-xl bg-brand px-7 py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep">
          {p.nextLabel}
        </Link>
      )}
    </section>
  );
}
