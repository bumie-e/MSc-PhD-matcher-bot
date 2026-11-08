"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type { UserLlmKey } from "@/lib/types";

// Explicit columns: key_enc is not selectable from the browser by design.
const COLUMNS = "user_id, provider, model, available_models, status, status_message, validated_at";

export function useLlmKey(userId: string | undefined) {
  const [llmKey, setLlmKey] = useState<UserLlmKey | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLlmKey(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("user_llm_keys").select(COLUMNS).eq("user_id", userId).limit(1);
    setLlmKey(((data ?? [])[0] as UserLlmKey | undefined) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { llmKey, loading, refresh };
}
