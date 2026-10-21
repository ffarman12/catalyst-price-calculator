import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authorizeEditorFeature } from "../_shared/owner-permissions.ts";

const ALLOWED_ORIGIN = "https://ffarman12.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin !== ALLOWED_ORIGIN) return reply({ error: "Origin not allowed" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply({ error: "Server database credentials are not configured" }, 503);
  const rest = url.endsWith("/") ? url.slice(0, -1) : url;
  const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" };

  try {
    if (req.method === "POST") {
      const authz = await authorizeEditorFeature(req, "viewer_app_command");
      if (!authz.ok) return reply({ error: authz.error }, authz.status);
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }
      const mode = body.live_market_source;
      if (mode !== "manual" && mode !== "live") return reply({ error: "live_market_source must be manual or live" }, 400);
      const save = await fetch(rest + "/rest/v1/viewer_market_control?on_conflict=id", {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ id: 1, live_market_source: mode, updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      });
      const raw = await save.text();
      if (!save.ok) return reply({ error: "Could not save Viewer source", detail: raw.slice(0, 240) }, 502);
    }

    const [controlRes, manualRes, liveRes] = await Promise.all([
      fetch(rest + "/rest/v1/viewer_market_control?id=eq.1&select=live_market_source,updated_at", { headers, signal: AbortSignal.timeout(8000) }),
      fetch(rest + "/rest/v1/market_manual_state?id=eq.1&select=pt,pd,rh,usd,updated_at", { headers, signal: AbortSignal.timeout(8000) }),
      fetch(rest + "/rest/v1/market_live_state?id=eq.1&select=pt,pd,rh,usd,source,updated_at", { headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!controlRes.ok || !manualRes.ok || !liveRes.ok) return reply({ error: "Could not read Viewer market configuration" }, 502);
    const [controls, manual, live] = await Promise.all([controlRes.json(), manualRes.json(), liveRes.json()]);
    const config = Array.isArray(controls) && controls[0] ? controls[0] : { live_market_source: "live", updated_at: null };
    return reply({
      ok: true,
      live_market_source: config.live_market_source,
      updated_at: config.updated_at,
      manual_market: Array.isArray(manual) ? (manual[0] ?? null) : null,
      live_market: Array.isArray(live) ? (live[0] ?? null) : null,
    });
  } catch (error) {
    return reply({ error: "Viewer source control request failed", detail: error instanceof Error ? error.message : String(error) }, 502);
  }
});