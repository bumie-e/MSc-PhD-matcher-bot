// Supabase Edge Function: start scoring for just the calling user (the
// "Score the next batch" button, and the automatic first run). Dispatches
// match.yml with a GitHub token held as a Supabase secret, so the token never
// reaches the client.
//
// Scoring runs on the user's own AI key, so this refuses unless they have a
// working one. Every failure returns a JSON body with a readable `error` and a
// `code` the page can act on.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { allowed, TOO_MANY } from "../_shared/ratelimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_PAT = Deno.env.get("GITHUB_PAT");
const GITHUB_REPO = Deno.env.get("GITHUB_REPO");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Please sign in again.", code: "invalid_session" }, 401);
  const userId = userData.user.id;

  // Personalised scoring needs the user's own, working AI key.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: keyRow, error: keyErr } = await admin
    .from("user_llm_keys")
    .select("status, status_message")
    .eq("user_id", userId)
    .maybeSingle();
  if (keyErr) {
    console.error("rematch-me: key lookup failed", keyErr.code);
    return json({ error: "Could not check your AI key. Try again in a moment.", code: "key_lookup_failed" }, 500);
  }
  if (!keyRow) {
    return json({ error: "Connect your AI key to get personalised matches.", code: "llm_key_required" }, 409);
  }
  if (keyRow.status !== "valid") {
    return json(
      { error: keyRow.status_message ?? "Your AI key needs attention. Fix it in Settings.", code: "llm_key_unusable" },
      409,
    );
  }

  if (!(await allowed(userId, "rematch-me", 6, "1 hour"))) return json(TOO_MANY, 429);

  if (!GITHUB_PAT || !GITHUB_REPO) {
    console.error("rematch-me: GITHUB_PAT or GITHUB_REPO secret is not set");
    return json({ error: "Scoring is not set up on the server yet.", code: "dispatch_not_configured" }, 503);
  }

  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/match.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "msc-phd-matcher",
    },
    body: JSON.stringify({ ref: "main", inputs: { opp_ids: "all", user_id: userId, rescore: "false" } }),
  });

  if (!resp.ok) {
    // GitHub's message ("Bad credentials", "Resource not accessible by personal access token")
    // is safe to log; it never contains the token.
    const detail = await resp.text().catch(() => "");
    let reason = "";
    try {
      reason = JSON.parse(detail).message ?? "";
    } catch {
      /* not JSON */
    }
    console.error(`rematch-me: GitHub dispatch failed, status ${resp.status}: ${reason}`);
    const tokenProblem = resp.status === 401 || resp.status === 403 || resp.status === 404;
    return json(
      {
        error: tokenProblem
          ? "Scoring could not start because the server's GitHub token was rejected. The site owner needs to renew it."
          : "Scoring could not start. Try again in a moment.",
        code: tokenProblem ? "dispatch_unauthorised" : "dispatch_failed",
      },
      502,
    );
  }

  return json({ ok: true });
});
