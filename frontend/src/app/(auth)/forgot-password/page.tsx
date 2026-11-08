"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthShell, buttonClass, inputClass, labelClass } from "@/components/AuthShell";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("../reset-password/", window.location.href).toString(),
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle={`If an account exists for ${email}, we sent a link to reset your password.`}>
        <Link href="/login" className="font-bold text-brand underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a reset link.">
      <form onSubmit={handleSubmit}>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-brand-soft px-4 py-3 text-base text-black">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className={buttonClass}>
          {submitting ? "Sending..." : "Send reset link"}
        </button>
        <p className="mt-6 text-center text-base">
          <Link href="/login" className="font-bold text-brand underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
