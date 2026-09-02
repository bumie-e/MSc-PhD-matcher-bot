"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";

const PAGE_SIZE = 50;

// Every opportunity the search agent has ever found, independent of any
// user's match score — the raw pool matches are drawn from. Shown as a
// separate "All discovered opportunities" section beneath the personalized
// matches, since a low-scoring or unscored opportunity can still be worth a
// manual look.
export function useAllOpportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, count } = await supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    setOpportunities((data as Opportunity[]) ?? []);
    setHasMore((count ?? 0) > PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // New opportunities land live as the Search Agent writes them.
  useEffect(() => {
    const channel = supabase
      .channel("opportunities:all")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "opportunities" }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const loadMore = async () => {
    const { data, count } = await supabase
      .from("opportunities")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(opportunities.length, opportunities.length + PAGE_SIZE - 1);

    setOpportunities((prev) => [...prev, ...((data as Opportunity[]) ?? [])]);
    setHasMore((count ?? 0) > opportunities.length + (data?.length ?? 0));
  };

  return { opportunities, loading, hasMore, loadMore };
}
