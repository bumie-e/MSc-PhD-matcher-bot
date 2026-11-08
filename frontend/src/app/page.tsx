"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Landing } from "@/components/landing/Landing";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";

export default function Home() {
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile(session?.user.id);
  const router = useRouter();

  useEffect(() => {
    // Visitors without a session stay on the landing page.
    if (sessionLoading || !session || profileLoading) return;
    router.replace(!profile || profile.onboarding_step < 5 ? "/onboarding" : "/dashboard");
  }, [session, sessionLoading, profile, profileLoading, router]);

  return <Landing signedIn={!!session} />;
}
