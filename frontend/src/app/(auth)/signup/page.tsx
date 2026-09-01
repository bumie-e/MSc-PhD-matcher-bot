"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { supabase } from "@/lib/supabase";

function SignupForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const prefillEmail = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // The "Before User Created" auth hook (check_invite_before_signup) rejects
    // this if the email has no valid, unused, unexpired pending_invites row.
    const { error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }

    // Best-effort: mark the invite used now that the account exists. If this
    // fails, the invite just stays "unused" — harmless, not a blocker.
    await supabase.rpc("mark_invite_used", { invite_email: email });

    setSubmitting(false);
    router.replace("/onboarding");
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-border bg-surface p-8">
      <h1 className="mb-1 font-serif text-2xl font-semibold text-ink">Create your account</h1>
      <p className="mb-6 text-sm text-muted">
        {token ? "Invite verified — set a password to continue." : "Enter the email your invite was sent to."}
      </p>

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
        minLength={8}
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
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  );
}
