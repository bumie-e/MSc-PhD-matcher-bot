import Link from "next/link";

import { LandingNav } from "./LandingNav";

const SOURCES = [
  "DAAD",
  "Erasmus Mundus",
  "EURAXESS",
  "FindAPhD",
  "FindAMasters",
  "PhDportal",
  "Fulbright",
  "ScholarshipDB",
  "ProFellow",
  "University job boards",
  "ResearchGate",
];

const STEPS = [
  {
    title: "Browse straight away",
    body: "Every opening the daily search finds is listed with its deadline and funding. Save the ones you like to your pipeline.",
  },
  {
    title: "Connect your AI key",
    body: "When you want scores, add your own Groq, OpenAI, Anthropic, Gemini or DeepSeek key and upload your CV. You pay your provider directly.",
  },
  {
    title: "Review ranked matches",
    body: "Each opening gets a score against your profile, with the reasons, the gaps and what to submit.",
  },
];

const FEATURES = [
  {
    title: "Honest match scores",
    body: "Every score comes with the reasons behind it and a confidence level, so you know when to trust it.",
    icon: "M4 19V9m6 10V5m6 14v-7m6 7H2",
  },
  {
    title: "Deadlines first",
    body: "Openings can be sorted by what closes soonest, and urgent ones are flagged before you miss them.",
    icon: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "A pipeline that needs no setup",
    body: "Save positions, add notes and track each application from interested to offer. This works without an AI key.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "You control the AI and its cost",
    body: "Matching runs on your own key, which is stored encrypted. Scoring happens in small batches, so you always know what you spend.",
    icon: "M12 3l8 4v5c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V7z",
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function PreviewCard({ title, place, score, confidence, deadline, tone }: { title: string; place: string; score: number; confidence: string; deadline: string; tone: "high" | "mid" }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-4 text-black shadow-[0_12px_30px_-12px_rgba(0,20,80,0.5)]">
      <svg viewBox="0 0 52 52" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="26" cy="26" r={radius} fill="none" stroke="#c9dcff" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke={tone === "high" ? "#1d4ed8" : "#6b93e8"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold">{title}</p>
        <p className="truncate text-base text-black/70">{place}</p>
        <p className="mt-1 text-sm text-black/70">
          {confidence} confidence, closes {deadline}
        </p>
      </div>
      <p className="text-2xl font-bold text-brand">{score}%</p>
    </div>
  );
}

export function Landing({ signedIn }: { signedIn: boolean }) {
  const tryHref = signedIn ? "/dashboard" : "/signup";
  const tryLabel = signedIn ? "Open dashboard" : "Try it free";

  return (
    <div className="bg-white font-sans text-black">
      <header className="bg-brand text-white">
        <LandingNav signedIn={signedIn} tryHref={tryHref} tryLabel={tryLabel} />

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-20 pt-10 sm:px-6 md:grid-cols-[6fr_5fr] md:pb-24 md:pt-20">
          <div className="min-w-0">
            <h1 className="max-w-xl text-4xl font-bold leading-[1.08] sm:text-5xl md:text-6xl">Find the MSc and PhD positions that fit your CV.</h1>
            <p className="mt-6 max-w-lg text-xl leading-relaxed text-white/90">
              Browse open MSc and PhD positions from scholarship sites and university pages, updated every day. Connect your own AI key when you want each one scored against your CV.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href={tryHref} className="rounded-lg bg-white px-7 py-3.5 text-lg font-bold text-brand hover:bg-brand-soft">
                {tryLabel}
              </Link>
              <a href="#how" className="rounded-lg border-2 border-white/70 px-7 py-3 text-lg font-bold text-white hover:bg-white/10">
                See how it works
              </a>
            </div>
          </div>

          <div className="relative min-w-0" aria-label="Example of ranked matches">
            <div className="space-y-4 rounded-3xl bg-brand-deep p-5 md:rotate-1">
              <PreviewCard title="PhD in Machine Learning" place="Example University, Germany" score={92} confidence="High" deadline="in 9 days" tone="high" />
              <PreviewCard title="MSc Data Science, fully funded" place="Example Institute, Netherlands" score={81} confidence="High" deadline="in 3 weeks" tone="high" />
              <PreviewCard title="Research fellowship in NLP" place="Example College, UK" score={64} confidence="Medium" deadline="in 2 months" tone="mid" />
            </div>
            <p className="mt-3 text-sm text-white/80">Sample results, shown for illustration.</p>
          </div>
        </div>
      </header>

      <section id="how" className="scroll-mt-4 px-5 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">How it works</h2>
          <p className="mt-3 max-w-xl text-xl text-black/70">Browsing is free and needs no setup. Matching is the optional part.</p>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-3xl bg-brand-soft p-8">
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">{i + 1}</span>
                <h3 className="text-2xl font-bold">{step.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-black/80">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="scroll-mt-4 bg-brand-soft px-5 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Built to save you hours of searching</h2>
          <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                  <Icon d={f.icon} />
                </span>
                <div>
                  <h3 className="text-2xl font-bold">{f.title}</h3>
                  <p className="mt-2 max-w-md text-lg leading-relaxed text-black/80">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-xl text-3xl font-bold sm:text-4xl">Where we look</h2>
          <p className="mt-3 max-w-xl text-xl text-black/70">One search across the places you would otherwise check by hand.</p>
          <ul className="mt-10 flex flex-wrap gap-3">
            {SOURCES.map((s) => (
              <li key={s} className="rounded-full bg-brand-soft px-5 py-2.5 text-lg text-brand-deep">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-6 sm:pb-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-3xl bg-brand p-7 text-white sm:p-10 md:flex-row md:items-center md:p-14">
          <div>
            <h2 className="max-w-md text-3xl font-bold sm:text-4xl leading-tight">Start browsing. Add your CV when you are ready.</h2>
            <p className="mt-3 text-xl text-white/90">Free to use. Matching runs on your own AI key.</p>
          </div>
          <Link href={tryHref} className="shrink-0 rounded-lg bg-white px-8 py-4 text-xl font-bold text-brand hover:bg-brand-soft">
            {tryLabel}
          </Link>
        </div>
      </section>

      <footer className="bg-brand-deep px-6 py-8 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-base">
          <p>MSc PhD Matcher is free and open source.</p>
          <a href="https://github.com/bumie-e/MSc-PhD-matcher-bot" className="underline hover:no-underline">
            View the code on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
