import Link from "next/link";

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
  "LinkedIn posts",
];

const STEPS = [
  {
    title: "Upload your CV",
    body: "We read your education, experience and research interests, and you check that we got them right.",
  },
  {
    title: "We search every day",
    body: "Scholarship sites, university pages and research networks are scanned for MSc and PhD openings in your field.",
  },
  {
    title: "Review ranked matches",
    body: "Each opportunity gets a score against your profile, with the reasons, the deadline and what to submit.",
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
    body: "Opportunities are sorted by what closes soonest, and urgent ones are flagged before you miss them.",
    icon: "M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    title: "Your own pipeline",
    body: "Save positions, add notes, reorder them and track each application from interested to submitted.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "Real opportunities only",
    body: "Ads, news and expired listings are filtered out, so what you see is a position you can apply for.",
    icon: "M5 13l4 4L19 7",
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
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5" aria-label="Main">
          <Link href="/" className="text-xl font-bold">
            MSc PhD Matcher
          </Link>
          <div className="flex items-center gap-5 text-lg">
            <a href="#how" className="hidden hover:underline sm:inline">
              How it works
            </a>
            <a href="#features" className="hidden hover:underline sm:inline">
              Features
            </a>
            {!signedIn && (
              <Link href="/login" className="hover:underline">
                Sign in
              </Link>
            )}
            <Link href={tryHref} className="rounded-lg bg-white px-4 py-2 font-bold text-brand hover:bg-brand-soft">
              {tryLabel}
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-14 md:grid-cols-[6fr_5fr] md:pt-20">
          <div>
            <h1 className="max-w-xl text-5xl font-bold leading-[1.05] md:text-6xl">Find the MSc and PhD positions that fit your CV.</h1>
            <p className="mt-6 max-w-lg text-xl leading-relaxed text-white/90">
              Upload your CV once. We search scholarship sites and university pages every day, then rank what we find by how well it matches you and when it closes.
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

          <div className="relative" aria-label="Example of ranked matches">
            <div className="space-y-4 rounded-3xl bg-brand-deep p-5 md:rotate-1">
              <PreviewCard title="PhD in Machine Learning" place="Example University, Germany" score={92} confidence="High" deadline="in 9 days" tone="high" />
              <PreviewCard title="MSc Data Science, fully funded" place="Example Institute, Netherlands" score={81} confidence="High" deadline="in 3 weeks" tone="high" />
              <PreviewCard title="Research fellowship in NLP" place="Example College, UK" score={64} confidence="Medium" deadline="in 2 months" tone="mid" />
            </div>
            <p className="mt-3 text-sm text-white/80">Sample results, shown for illustration.</p>
          </div>
        </div>
      </header>

      <section id="how" className="scroll-mt-4 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-xl text-4xl font-bold">How it works</h2>
          <p className="mt-3 max-w-xl text-xl text-black/70">Three steps, and the second one happens without you.</p>
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

      <section id="features" className="scroll-mt-4 bg-brand-soft px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-xl text-4xl font-bold">Built to save you hours of searching</h2>
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

      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-xl text-4xl font-bold">Where we look</h2>
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

      <section className="px-6 pb-24">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-3xl bg-brand p-10 text-white md:flex-row md:items-center md:p-14">
          <div>
            <h2 className="max-w-md text-4xl font-bold leading-tight">Start with your CV. We handle the searching.</h2>
            <p className="mt-3 text-xl text-white/90">Free to use. Setup takes about five minutes.</p>
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
