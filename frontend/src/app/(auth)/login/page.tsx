"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-border bg-surface p-8">
        <h1 className="mb-1 font-serif text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="mb-6 text-sm text-muted">Sign in to see your matched opportunities.</p>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-xs text-muted">
          Invite-only. Have a signup link?{" "}
          <Link href="/signup" className="text-accent underline">
            Use it here
          </Link>
        </p>
      </form>
    </main>
  );
}
