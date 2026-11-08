"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { OnboardingWizard } from "@/components/OnboardingWizard";
import { PageLoading } from "@/components/ui/PageShell";
import { useSession } from "@/hooks/useSession";

export default function OnboardingPage() {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session) return <PageLoading />;

  return <OnboardingWizard userId={session.user.id} />;
}
