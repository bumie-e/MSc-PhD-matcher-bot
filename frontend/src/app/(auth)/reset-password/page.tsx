"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PasswordInput } from "@/components/ui/PasswordInput";
import { AuthShell, buttonClass, inputClass, labelClass } from "@/components/AuthShell";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    // supabase-js reads the recovery token from the link and starts a session.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.replace("/dashboard");
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 12 characters.">
      <form onSubmit={handleSubmit}>
        <label htmlFor="password" className={labelClass}>
          New password
        </label>
        <PasswordInput id="password" required minLength={12} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-brand-soft px-4 py-3 text-base text-black">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className={buttonClass}>
          {submitting ? "Saving..." : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}
