"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell, buttonClass, inputClass, labelClass } from "@/components/AuthShell";
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
      setError(signInError.message === "Email not confirmed" ? "Confirm your email first. Check your inbox for the link we sent." : signInError.message);
      return;
    }
    router.replace("/");
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see your matched opportunities.">
      <form onSubmit={handleSubmit}>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />

        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${inputClass} mb-2`}
        />
        <p className="mb-5 text-right text-base">
          <Link href="/forgot-password" className="text-brand underline">
            Forgot password?
          </Link>
        </p>

        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-brand-soft px-4 py-3 text-base text-black">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={buttonClass}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <p className="mt-6 text-center text-base text-black/70">
          New here?{" "}
          <Link href="/signup" className="font-bold text-brand underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
