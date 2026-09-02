// Supabase Edge Function: encrypt the user's li_at cookie and write it to
// linkedin_sessions. AES-256-GCM, format: base64(iv[12] || ciphertext || tag[16])
// — matches agents/crypto.py on the Python side so GitHub Actions can decrypt
// what this function writes.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { corsHeaders, handleCors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const COOKIE_ENCRYPTION_KEY = Deno.env.get("COOKIE_ENCRYPTION_KEY")!; // base64, 32 raw bytes

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptCookie(plaintext: string): Promise<string> {
  const keyBytes = base64ToBytes(COOKIE_ENCRYPTION_KEY);
  if (keyBytes.length !== 32) {
    throw new Error("COOKIE_ENCRYPTION_KEY must decode to 32 bytes for AES-256");
  }

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );

  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
}

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

  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: corsHeaders });
  }

  const { cookie } = await req.json();
  if (!cookie || typeof cookie !== "string") {
    return new Response(JSON.stringify({ error: "cookie is required" }), { status: 400, headers: corsHeaders });
  }

  const cookieEnc = await encryptCookie(cookie);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: upsertErr } = await admin.from("linkedin_sessions").upsert({
    user_id: userData.user.id,
    cookie_enc: cookieEnc,
    updated_at: new Date().toISOString(),
  });

  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message }), { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
