"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { PageLoading } from "@/components/ui/PageShell";
import { useAllOpportunities } from "@/hooks/useAllOpportunities";
import { useCv } from "@/hooks/useCv";
import { useLlmKey } from "@/hooks/useLlmKey";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";

export default function DashboardPage() {
  const { session, loading: sessionLoading } = useSession();
  const { profile } = useProfile(session?.user.id);
  const { items, loading, upsertNote, removeNote } = useOpportunities(session?.user.id);
  const { opportunities, loading: poolLoading, hasMore, loadMore } = useAllOpportunities();
  const { llmKey } = useLlmKey(session?.user.id);
  const { cv } = useCv(session?.user.id);
  const router = useRouter();

  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  if (sessionLoading || !session) return <PageLoading text="Loading your dashboard..." />;

  return (
    <DashboardView
      email={session.user.email}
      profile={profile}
      items={items}
      itemsLoading={loading}
      upsertNote={upsertNote}
      removeNote={removeNote}
      pool={opportunities}
      poolLoading={poolLoading}
      hasMore={hasMore}
      loadMore={loadMore}
      llmKey={llmKey}
      cv={cv}
    />
  );
}
