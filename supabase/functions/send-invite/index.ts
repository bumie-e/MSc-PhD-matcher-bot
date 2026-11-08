// Supabase Edge Function: create a pending_invites row and email the signup link.
// Called by the admin UI. Requires the caller's JWT to belong to a user with
// user_profiles.is_admin = true.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { corsHeaders, handleCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL")!; // e.g. https://<user>.github.io/MSc-PhD-matcher-bot

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profile } = await admin
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  const email = body.email;
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "A valid email is required" }), { status: 400, headers: corsHeaders });
  }

  const token = crypto.randomUUID();

  const { error: insertErr } = await admin.from("pending_invites").insert({
    email,
    token,
    created_by: userData.user.id,
  });

  if (insertErr) {
    console.error("send-invite: insert failed", insertErr.code);
    return new Response(JSON.stringify({ error: "Could not create the invite." }), { status: 400, headers: corsHeaders });
  }

  const signupLink = `${SITE_URL}/signup?token=${token}&email=${encodeURIComponent(email)}`;

  // Email delivery: plug in Resend (or similar) here. Left as a TODO so no
  // email provider key is required to get the invite flow itself working.
  console.log("Invite created");

  return new Response(JSON.stringify({ ok: true, signupLink }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
