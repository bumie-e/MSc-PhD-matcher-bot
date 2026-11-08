"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { UserCv } from "@/lib/types";

// Latest uploaded CV. Polls while it is still being read so the dashboard
// updates itself when parsing finishes.
export function useCv(userId: string | undefined) {
  const [cv, setCv] = useState<UserCv | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCv(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_cv")
      .select("id, filename, parse_status, parse_error, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);
    setCv(((data ?? [])[0] as UserCv | undefined) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pending = cv?.parse_status === "pending";
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [pending, refresh]);

  return { cv, loading, refresh };
}
