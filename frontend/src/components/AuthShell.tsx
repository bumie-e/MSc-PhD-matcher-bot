import Link from "next/link";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white text-black md:grid-cols-[5fr_6fr]">
      <aside className="hidden flex-col justify-between bg-brand p-12 text-white md:flex">
        <Link href="/" className="text-xl font-bold">
          MSc PhD Matcher
        </Link>
        <div>
          <p className="max-w-sm text-4xl font-bold leading-tight">Your CV, matched to every open position worth your time.</p>
          <p className="mt-4 max-w-sm text-lg text-white/85">
            Searches run daily. You see ranked results with deadlines and your chances.
          </p>
        </div>
        <p className="text-sm text-white/80">Free and open source</p>
      </aside>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 block text-lg font-bold text-brand md:hidden">
            MSc PhD Matcher
          </Link>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mb-8 mt-2 text-lg text-black/70">{subtitle}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

export const inputClass =
  "mb-5 w-full rounded-lg border border-brand-mid bg-brand-soft px-4 py-3 text-lg text-black outline-none placeholder:text-black/40 focus:border-brand focus:bg-white";
export const labelClass = "mb-1.5 block text-base font-bold text-black";
export const buttonClass =
  "w-full rounded-lg bg-brand py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50";
