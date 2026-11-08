"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useEffect, useState } from "react";

import { MenuButton } from "@/components/dashboard/AppNav";

export function LandingNav({ signedIn, tryHref, tryLabel }: { signedIn: boolean; tryHref: string; tryLabel: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const itemClass = "rounded-xl px-4 py-3 text-lg text-white hover:bg-white/10";

  return (
    <nav className="mx-auto max-w-6xl px-5 py-3 sm:px-6 sm:py-4" aria-label="Main">
      <div className="flex items-center justify-between gap-3">
        <Logo className="text-lg sm:text-xl" />

        <div className="hidden items-center gap-6 text-lg md:flex">
          <a href="#how" className="hover:underline">
            How it works
          </a>
          <a href="#features" className="hover:underline">
            Features
          </a>
          {!signedIn && (
            <Link href="/login" className="hover:underline">
              Sign in
            </Link>
          )}
          <Link href={tryHref} className="whitespace-nowrap rounded-lg bg-white px-4 py-2 font-bold text-brand hover:bg-brand-soft">
            {tryLabel}
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link href={tryHref} className="whitespace-nowrap rounded-lg bg-white px-3 py-2 text-base font-bold text-brand hover:bg-brand-soft">
            {tryLabel}
          </Link>
          <MenuButton open={open} onClick={() => setOpen((v) => !v)} controls="landing-menu" />
        </div>
      </div>

      {open && (
        <div id="landing-menu" className="anim-rise mt-2 flex flex-col gap-1 rounded-2xl bg-brand-deep p-2 md:hidden">
          <a href="#how" onClick={() => setOpen(false)} className={itemClass}>
            How it works
          </a>
          <a href="#features" onClick={() => setOpen(false)} className={itemClass}>
            Features
          </a>
          {!signedIn && (
            <Link href="/login" onClick={() => setOpen(false)} className={itemClass}>
              Sign in
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
