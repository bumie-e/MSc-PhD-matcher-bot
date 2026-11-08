// Supabase Edge Function: dispatch search.yml on behalf of a logged-in user
// (e.g. after they change their interests/keywords in Settings). Uses a
// GitHub PAT stored as a Supabase secret — the PAT never reaches the client.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { allowed, TOO_MANY } from "../_shared/ratelimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_PAT = Deno.env.get("GITHUB_PAT")!;
const GITHUB_REPO = Deno.env.get("GITHUB_REPO")!; // "owner/repo"

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: corsHeaders });
  }

  // The search is global and costly: one per user per hour, three per hour overall.
  const j = (b: unknown, status: number) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!(await allowed(userData.user.id, "run-search", 1, "1 hour"))) return j(TOO_MANY, 429);
  if (!(await allowed(null, "run-search-global", 3, "1 hour"))) return j(TOO_MANY, 429);

  const dispatchResp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/search.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (!dispatchResp.ok) {
    console.error("run-search: GitHub dispatch failed", dispatchResp.status);
    return j({ error: "Could not start the search. Try again later." }, 502);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
