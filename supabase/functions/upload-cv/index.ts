// Supabase Edge Function: after the client uploads a CV PDF directly to
// Storage (via its own RLS-scoped upload, see 0003_cv_storage.sql), this
// records the user_cv row and dispatches parse-cv.yml. Uses a GitHub PAT
// stored as a Supabase secret — the PAT never reaches the client.

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

  const { storage_path, filename } = await req.json();
  if (!storage_path || typeof storage_path !== "string") {
    return new Response(JSON.stringify({ error: "storage_path is required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // storage_path must live under the caller's own folder — the bucket's RLS
  // policies already enforce this for the upload itself, but double-check
  // here since this function runs with the service role.
  if (!storage_path.startsWith(`${userData.user.id}/`)) {
    return new Response(JSON.stringify({ error: "storage_path must be under your own user folder" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  if (!(await allowed(userData.user.id, "upload-cv", 5, "1 hour"))) {
    return new Response(JSON.stringify(TOO_MANY), { status: 429, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Reading a CV runs on the user's own AI key, so one must be connected first.
  const { data: keyRow } = await admin
    .from("user_llm_keys")
    .select("status")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!keyRow || keyRow.status !== "valid") {
    return new Response(
      JSON.stringify({ error: "Connect your AI key before uploading a CV.", code: "llm_key_required" }),
      { status: 400, headers: corsHeaders },
    );
  }

  const { error: insertErr } = await admin.from("user_cv").insert({
    user_id: userData.user.id,
    filename: filename ?? storage_path.split("/").pop(),
    storage_path,
    parse_status: "pending",
  });

  if (insertErr) {
    console.error("upload-cv: insert failed", insertErr.code);
    return new Response(JSON.stringify({ error: "Could not save your CV. Try again." }), { status: 400, headers: corsHeaders });
  }

  const dispatchResp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/parse-cv.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { user_id: userData.user.id, storage_path },
      }),
    },
  );

  if (!dispatchResp.ok) {
    console.error("upload-cv: GitHub dispatch failed", dispatchResp.status);
    return new Response(JSON.stringify({ error: "Could not start reading your CV. Try again later." }), {
      status: 502,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
