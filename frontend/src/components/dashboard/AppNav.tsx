"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/settings", label: "Settings" },
];

export function MenuButton({ open, onClick, controls }: { open: boolean; onClick: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? "Close menu" : "Open menu"}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 md:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
      </svg>
    </button>
  );
}

export function AppNav({ active, isAdmin, width = "max-w-6xl" }: { active: string; isAdmin?: boolean; width?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const signOut = () => supabase.auth.signOut().then(() => router.replace("/login"));

  return (
    <nav className={`mx-auto px-5 py-3 sm:px-6 ${width}`} aria-label="Main">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-lg font-bold text-white sm:text-xl">
          MSc PhD Matcher
        </Link>

        <div className="hidden items-center gap-1 text-lg md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active === l.href ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 transition-colors ${active === l.href ? "bg-white font-bold text-brand" : "text-white hover:bg-white/15"}`}
            >
              {l.label}
            </Link>
          ))}
          <button onClick={signOut} className="ml-2 rounded-full border-2 border-white/60 px-4 py-1 text-white transition-colors hover:bg-white/15">
            Sign out
          </button>
        </div>

        <MenuButton open={open} onClick={() => setOpen((v) => !v)} controls="app-menu" />
      </div>

      {open && (
        <div id="app-menu" className="anim-rise mt-2 flex flex-col gap-1 rounded-2xl bg-brand-deep p-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={active === l.href ? "page" : undefined}
              className={`rounded-xl px-4 py-3 text-lg ${active === l.href ? "bg-white font-bold text-brand" : "text-white hover:bg-white/10"}`}
            >
              {l.label}
            </Link>
          ))}
          <button onClick={signOut} className="rounded-xl px-4 py-3 text-left text-lg text-white hover:bg-white/10">
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
