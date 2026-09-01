"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { OnboardingWizard } from "@/components/OnboardingWizard";
import { useSession } from "@/hooks/useSession";

export default function OnboardingPage() {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <OnboardingWizard userId={session.user.id} />
    </main>
  );
}
