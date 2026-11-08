"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { Match, Opportunity, OpportunityItem, UserNote } from "@/lib/types";

// Everything the user has a relationship with: openings that were scored for
// them (matches) and openings they saved or are tracking (notes). The two are
// independent, so tracking works without an AI key and scoring works without
// tracking. Items are keyed by opportunity.
export function useOpportunities(userId: string | undefined) {
  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const [{ data: matchRows }, { data: noteRows }] = await Promise.all([
      supabase.from("matches").select("*, opportunity:opportunities(*)").eq("user_id", userId),
      supabase.from("user_notes").select("*, opportunity:opportunities(*)").eq("user_id", userId),
    ]);

    const byOpportunity = new Map<string, OpportunityItem>();

    for (const row of (matchRows ?? []) as (Match & { opportunity: Opportunity | null })[]) {
      if (!row.opportunity) continue;
      const { opportunity, ...match } = row;
      byOpportunity.set(opportunity.id, { id: opportunity.id, opportunity, match: match as Match, user_note: null });
    }

    for (const row of (noteRows ?? []) as (UserNote & { opportunity: Opportunity | null })[]) {
      if (!row.opportunity) continue;
      const { opportunity, ...note } = row;
      const existing = byOpportunity.get(opportunity.id);
      if (existing) existing.user_note = note as UserNote;
      else byOpportunity.set(opportunity.id, { id: opportunity.id, opportunity, match: null, user_note: note as UserNote });
    }

    setItems([...byOpportunity.values()]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // New match rows land live as the Match Agent writes them.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`matches:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches", filter: `user_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // Save, pin, set a status or write a note on any opening. Creates the item
  // if this is the first time the user touches that opening.
  const upsertNote = async (opportunity: Opportunity, patch: Partial<UserNote>) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("user_notes")
      .upsert({ user_id: userId, opportunity_id: opportunity.id, ...patch }, { onConflict: "user_id,opportunity_id" })
      .select()
      .single();

    if (!error) {
      const note = data as UserNote;
      setItems((prev) =>
        prev.some((i) => i.id === opportunity.id)
          ? prev.map((i) => (i.id === opportunity.id ? { ...i, user_note: note } : i))
          : [...prev, { id: opportunity.id, opportunity, match: null, user_note: note }],
      );
    }
    return { data, error };
  };

  // Un-save: delete the note. Items that were only there because of the note disappear.
  const removeNote = async (opportunity: Opportunity) => {
    if (!userId) return;
    const { error } = await supabase.from("user_notes").delete().eq("user_id", userId).eq("opportunity_id", opportunity.id);
    if (!error) {
      setItems((prev) => prev.flatMap((i) => (i.id !== opportunity.id ? [i] : i.match ? [{ ...i, user_note: null }] : [])));
    }
    return { error };
  };

  return { items, loading, refresh, upsertNote, removeNote };
}
