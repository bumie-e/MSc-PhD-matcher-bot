"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell, buttonClass, inputClass, labelClass } from "@/components/AuthShell";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      // Works on GitHub Pages (base path) and locally. This URL must be in
      // Supabase > Authentication > URL Configuration > Redirect URLs.
      options: { emailRedirectTo: new URL("../login/", window.location.href).toString() },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // Supabase hides whether an email is registered by returning a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setError("An account with this email already exists. Sign in instead.");
      return;
    }
    if (data.session) {
      router.replace("/onboarding");
      return;
    }
    setConfirmSentTo(email);
  };

  if (confirmSentTo) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a confirmation link to ${confirmSentTo}. Open it to finish creating your account.`}>
        <p className="text-base text-black/70">
          Nothing there after a few minutes? Check your spam folder, or{" "}
          <button type="button" onClick={() => setConfirmSentTo(null)} className="font-bold text-brand underline">
            try a different email
          </button>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Free to use. You will upload your CV in the next step.">
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
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${inputClass} mb-1`}
        />
        <p className="mb-5 text-sm text-black/60">At least 8 characters.</p>

        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-brand-soft px-4 py-3 text-base text-black">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={buttonClass}>
          {submitting ? "Creating account..." : "Create account"}
        </button>

        <p className="mt-6 text-center text-base text-black/70">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-brand underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
