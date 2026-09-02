// Shared CORS headers for every Edge Function. Without these, a browser
// call via supabase-js's functions.invoke() fails at the preflight (OPTIONS)
// request — surfaces client-side as "Failed to send a request to the Edge
// Function" since the actual POST never even goes out.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
