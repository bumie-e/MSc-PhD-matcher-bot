// Supabase Edge Function: connect, change or remove the caller's own LLM key
// (bring your own key: Groq, OpenAI or Anthropic).
//
//   POST { provider, api_key, model? }  validate the key with the provider,
//                                      encrypt it, store it, and resume any
//                                      work that was waiting for a key
//   POST { model }                      switch to another model the key can use
//   POST { refresh_models: true }       re-fetch the provider's model list with the stored
//                                      key; flags the key if its model was retired
//   POST { remove: true }               delete the stored key
//
// The plaintext key is never logged, never returned, and never stored unencrypted.
// Reuses the GitHub PAT secret the other functions use to dispatch workflows.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import {
  KeyRejected,
  listChatModels,
  pickDefaultModel,
  PROVIDERS,
  type Provider,
  ProviderUnavailable,
} from "../_shared/llm-providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_PAT = Deno.env.get("GITHUB_PAT")!;
const GITHUB_REPO = Deno.env.get("GITHUB_REPO")!;

// Key checks per user per hour. Each one makes a request to a provider with a
// caller-supplied key, so this must stay low to be useless as a key-testing oracle.
const MAX_KEY_CHECKS_PER_HOUR = 10;

// storage_path ends up as a workflow input, so refuse anything that is not a plain
// "<uuid>/<filename>" with no shell metacharacters or path tricks.
const SAFE_STORAGE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._ ()-]{1,150}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function dispatch(workflow: string, inputs: Record<string, string>): Promise<boolean> {
  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GITHUB_PAT}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ ref: "main", inputs }),
  });
  return resp.ok;
}

// A key just became usable: resume whatever was waiting for it.
// Returns what was started: "cv" (re-reading the CV, which then scores), "match", "none" or "failed".
async function resumePersonalisation(admin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: cv } = await admin
    .from("user_cv")
    .select("storage_path, parse_status")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (!cv?.length) return "none";
  if (cv[0].parse_status !== "done") {
    const path = String(cv[0].storage_path);
    if (!SAFE_STORAGE_PATH.test(path) || path.includes("..") || !path.startsWith(`${userId}/`)) return "failed";
    await admin
      .from("user_cv")
      .update({ parse_status: "pending", parse_error: null })
      .eq("user_id", userId)
      .eq("storage_path", cv[0].storage_path);
    return (await dispatch("parse-cv.yml", { user_id: userId, storage_path: cv[0].storage_path })) ? "cv" : "failed";
  }
  return (await dispatch("match.yml", { opp_ids: "all", user_id: userId, rescore: "false" })) ? "match" : "failed";
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  // The caller's own identity check uses the anon key. The service role is only for `admin`.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));

  if (body.remove === true) {
    await admin.from("user_llm_keys").delete().eq("user_id", userId);
    return json({ ok: true, removed: true });
  }

  // Re-fetch the model list with the stored key. Providers retire models over time, so this is
  // how a stale list gets fixed and how we notice that the chosen model is gone.
  if (body.refresh_models === true) {
    const { data: row } = await admin
      .from("user_llm_keys")
      .select("provider, model, key_enc, status")
      .eq("user_id", userId)
      .single();
    if (!row) return json({ error: "Connect an API key first." }, 400);
    let models: string[];
    try {
      models = await listChatModels(row.provider as Provider, await decryptSecret(row.key_enc));
    } catch (e) {
      if (e instanceof KeyRejected) {
        await admin
          .from("user_llm_keys")
          .update({ status: "invalid", status_message: "Your AI provider rejected this key. Replace it." })
          .eq("user_id", userId);
        return json({ error: e.message, code: "key_rejected" }, 400);
      }
      if (e instanceof ProviderUnavailable) return json({ error: e.message, code: "provider_unavailable" }, 502);
      throw e;
    }
    const stillThere = models.includes(row.model);
    const update: Record<string, unknown> = { available_models: models, updated_at: new Date().toISOString() };
    if (!stillThere) {
      update.status = "model_unavailable";
      update.status_message = `Your model ${row.model} is no longer available. Choose another.`;
    } else if (row.status === "model_unavailable") {
      update.status = "valid";
      update.status_message = null;
    }
    await admin.from("user_llm_keys").update(update).eq("user_id", userId);
    return json({ ok: true, models, model: row.model, model_available: stillThere });
  }

  // Change model only.
  if (!body.api_key && typeof body.model === "string") {
    const { data: row } = await admin
      .from("user_llm_keys")
      .select("available_models, status")
      .eq("user_id", userId)
      .single();
    if (!row) return json({ error: "Connect an API key first." }, 400);
    if (!row.available_models.includes(body.model)) {
      return json({ error: "That model is not available for your key." }, 400);
    }
    // Picking a new model fixes a retired one. It cannot fix a rejected key.
    const update: Record<string, unknown> = { model: body.model, updated_at: new Date().toISOString() };
    const recovered = row.status === "model_unavailable";
    if (recovered) {
      update.status = "valid";
      update.status_message = null;
    }
    await admin.from("user_llm_keys").update(update).eq("user_id", userId);
    return json({ ok: true, model: body.model, resumed: recovered ? await resumePersonalisation(admin, userId) : "none" });
  }

  const provider = body.provider as Provider;
  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (!PROVIDERS.includes(provider)) return json({ error: "Choose Groq, OpenAI or Anthropic." }, 400);
  if (apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey)) {
    return json({ error: "That does not look like an API key. Paste the whole key with no spaces." }, 400);
  }

  // Rate limit before touching any provider.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from("llm_key_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("attempted_at", since);
  if ((count ?? 0) >= MAX_KEY_CHECKS_PER_HOUR) {
    return json({ error: "Too many key checks. Wait a few minutes and try again.", code: "rate_limited" }, 429);
  }
  await admin.from("llm_key_attempts").insert({ user_id: userId });
  await admin.from("llm_key_attempts").delete().eq("user_id", userId).lt("attempted_at", new Date(Date.now() - 86400_000).toISOString());

  let models: string[];
  try {
    models = await listChatModels(provider, apiKey);
  } catch (e) {
    if (e instanceof KeyRejected) return json({ error: e.message, code: "key_rejected" }, 400);
    if (e instanceof ProviderUnavailable) return json({ error: e.message, code: "provider_unavailable" }, 502);
    throw e;
  }

  const model =
    typeof body.model === "string" && models.includes(body.model) ? body.model : pickDefaultModel(provider, models);
  if (!model) return json({ error: "This key has no usable chat models." }, 400);

  const { error: upsertErr } = await admin.from("user_llm_keys").upsert({
    user_id: userId,
    provider,
    model,
    available_models: models,
    key_enc: await encryptSecret(apiKey),
    status: "valid",
    status_message: null,
    validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (upsertErr) return json({ error: "Could not save your key. Try again." }, 500);

  const resumed = await resumePersonalisation(admin, userId);
  return json({ ok: true, provider, model, models, resumed });
});
