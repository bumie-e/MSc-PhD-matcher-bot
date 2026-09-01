"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { Match, MatchWithOpportunity, Opportunity, UserNote } from "@/lib/types";

export function useOpportunities(userId: string | undefined) {
  const [matches, setMatches] = useState<MatchWithOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: matchRows } = await supabase
      .from("matches")
      .select("*, opportunity:opportunities(*)")
      .eq("user_id", userId)
      .order("score", { ascending: false });

    const rows = (matchRows ?? []) as (Match & { opportunity: Opportunity })[];
    const opportunityIds = rows.map((row) => row.opportunity_id);

    const { data: noteRows } = opportunityIds.length
      ? await supabase
          .from("user_notes")
          .select("*")
          .eq("user_id", userId)
          .in("opportunity_id", opportunityIds)
      : { data: [] as UserNote[] };

    const notesByOpp = new Map((noteRows ?? []).map((note) => [note.opportunity_id, note as UserNote]));

    setMatches(
      rows.map((row) => ({
        ...row,
        user_note: notesByOpp.get(row.opportunity_id) ?? null,
      })),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // New match rows land live as the Match Agent writes them (search.yml -> match.yml).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`matches:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "matches", filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const upsertNote = async (opportunityId: string, patch: Partial<UserNote>) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("user_notes")
      .upsert({ user_id: userId, opportunity_id: opportunityId, ...patch }, { onConflict: "user_id,opportunity_id" })
      .select()
      .single();

    if (!error) {
      setMatches((prev) =>
        prev.map((m) => (m.opportunity_id === opportunityId ? { ...m, user_note: data as UserNote } : m)),
      );
    }
    return { data, error };
  };

  return { matches, loading, refresh, upsertNote };
}
