"use client";

import { AppNav } from "@/components/dashboard/AppNav";

export function PageLoading({ text = "Loading..." }: { text?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-soft text-lg text-brand-deep">
      <p>{text}</p>
    </main>
  );
}

export function PageShell({
  active,
  isAdmin,
  title,
  subtitle,
  width = "max-w-6xl",
  children,
}: {
  active: string;
  isAdmin?: boolean;
  title: string;
  subtitle: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <header className="bg-brand text-white">
        <AppNav active={active} isAdmin={isAdmin} width={width} />
        <div className={`mx-auto px-5 pb-8 pt-4 sm:px-6 ${width}`}>
          <h1 className="anim-rise text-3xl font-bold sm:text-4xl">{title}</h1>
          <p className="anim-rise mt-2 max-w-2xl text-lg text-white/90 sm:text-xl" style={{ animationDelay: "60ms" }}>
            {subtitle}
          </p>
        </div>
      </header>
      <main className={`mx-auto px-5 py-8 sm:px-6 sm:py-10 ${width}`}>{children}</main>
    </div>
  );
}

export function Card({ id, title, description, children, className = "" }: { id?: string; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`anim-rise mb-6 scroll-mt-4 rounded-3xl bg-brand-soft p-5 sm:p-7 ${className}`}>
      <h2 className="text-2xl font-bold">{title}</h2>
      {description && <p className="mb-5 mt-1 text-lg text-black/70">{description}</p>}
      {!description && <div className="mb-5" />}
      {children}
    </section>
  );
}
