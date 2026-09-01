"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase.from("user_profiles").select("*").eq("id", userId).single();
    setProfile((data as UserProfile) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateProfile = async (patch: Partial<UserProfile>) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("user_profiles")
      .update(patch)
      .eq("id", userId)
      .select()
      .single();
    if (!error) setProfile(data as UserProfile);
    return { data, error };
  };

  return { profile, loading, refresh, updateProfile };
}
