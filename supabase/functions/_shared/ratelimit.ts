// Calls public.rate_limit_hit (0015). Fails closed: if the check errors, deny.
import { createClient } from "jsr:@supabase/supabase-js@2";

export async function allowed(
  userId: string | null,
  fn: string,
  max: number,
  windowSql: string, // Postgres interval, e.g. "1 hour"
): Promise<boolean> {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_user_id: userId,
    p_fn: fn,
    p_max: max,
    p_window: windowSql,
  });
  if (error) {
    console.error(`rate limit check failed for ${fn}`, error.code);
    return false;
  }
  return data === true;
}

export const TOO_MANY = { error: "You're doing that too often. Try again later.", code: "rate_limited" };
