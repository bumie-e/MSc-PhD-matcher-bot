import { supabase } from "./supabase";

// supabase-js reports every non-2xx Edge Function reply as the generic
// "Edge Function returned a non-2xx status code". Our functions put a readable
// reason in the JSON body, so unwrap it.
export async function invokeFn<T = Record<string, unknown>>(
  name: string,
  body?: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null; code?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
  });
  if (!error) return { data: data as T, error: null };

  let message = error.message;
  let code: string | undefined;
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const parsed = await ctx.json();
      if (parsed?.error) message = parsed.error;
      code = parsed?.code;
    } catch {
      /* keep the generic message */
    }
  }
  return { data: null, error: message, code };
}
