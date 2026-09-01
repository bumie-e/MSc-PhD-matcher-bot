"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";

export default function Home() {
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile(session?.user.id);
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (profileLoading) return;
    if (!profile || profile.onboarding_step < 5) {
      router.replace("/onboarding");
      return;
    }
    router.replace("/dashboard");
  }, [session, sessionLoading, profile, profileLoading, router]);

  return (
    <main className="flex min-h-screen items-center justify-center text-muted">
      <p>Loading…</p>
    </main>
  );
}
