import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authorizeEditorFeature } from "../_shared/owner-permissions.ts";

const ALLOWED_ORIGIN = "https://ffarman12.github.io";
const headers = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET" && req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin");
  if (origin !== ALLOWED_ORIGIN) return reply({ error: "Origin not allowed" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply({ error: "Server database credentials are not configured" }, 503);

  const baseUrl = url.replace(/\/$/, "");
  const restUrl = baseUrl + "/rest/v1/market_manual_state";
  const keys = ["pt", "pd", "rh", "usd"] as const;
  const dbHeaders = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };

  if (req.method === "GET") {
    try {
      const response = await fetch(restUrl + "?id=eq.1&select=id,pt,pd,rh,usd,updated_at", {
        headers: dbHeaders,
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      const responseText = await response.text();
      if (!response.ok) return reply({ error: "Cloud read failed", detail: responseText.slice(0, 300) }, 502);
      const rows = JSON.parse(responseText);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || keys.some((key) => !Number.isFinite(Number(row[key])) || Number(row[key]) <= 0) || !row.updated_at) {
        return reply({ error: "No valid saved Manual Market values in Cloud" }, 404);
      }
      return reply({ ok: true, saved: { pt: Number(row.pt), pd: Number(row.pd), rh: Number(row.rh), usd: Number(row.usd), updated_at: row.updated_at } });
    } catch (error) {
      return reply({ error: "Cloud read request failed", detail: error instanceof Error ? error.message : String(error) }, 502);
    }
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }

  const values: Record<string, number> = {};
  for (const key of keys) {
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value <= 0 || value > 10000000) {
      return reply({ error: "Invalid market value", field: key }, 400);
    }
    values[key] = value;
  }

  // Direct Manual Market edits still require the existing Owner Permission.
  // A non-owner editor may only save the automatic live snapshot when all
  // submitted values exactly match the server-verified latest MetalpriceAPI
  // record. This does not grant permission to enter arbitrary Manual rates.
  const authz = await authorizeEditorFeature(req, "manual_market_update");
  if (!authz.ok) {
    if (authz.error === "Editor account membership required") {
      return reply({ error: authz.error }, authz.status);
    }
    try {
      const liveResponse = await fetch(
        baseUrl + "/rest/v1/market_live_state?id=eq.1&select=pt,pd,rh,usd,source,updated_at",
        { headers: dbHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      const manualResponse = await fetch(
        restUrl + "?id=eq.1&select=rh",
        { headers: dbHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      if (!liveResponse.ok || !manualResponse.ok) return reply({ error: authz.error }, authz.status);

      const liveRows = await liveResponse.json();
      const manualRows = await manualResponse.json();
      const live = Array.isArray(liveRows) ? liveRows[0] : null;
      const manual = Array.isArray(manualRows) ? manualRows[0] : null;
      const expectedRh = live && live.rh != null
        ? Number(live.rh)
        : manual && Number.isFinite(Number(manual.rh))
          ? Number(manual.rh)
          : null;
      const matchesCurrentLiveSnapshot = !!live &&
        live.source === "MetalpriceAPI" &&
        Number.isFinite(Number(live.pt)) &&
        Number.isFinite(Number(live.pd)) &&
        Number.isFinite(Number(live.usd)) &&
        values.pt === Number(live.pt) &&
        values.pd === Number(live.pd) &&
        values.usd === Number(live.usd) &&
        expectedRh !== null &&
        values.rh === expectedRh;

      if (!matchesCurrentLiveSnapshot) return reply({ error: authz.error }, authz.status);
    } catch (_error) {
      return reply({ error: authz.error }, authz.status);
    }
  }

  const savedAt = new Date().toISOString();
  try {
    const save = await fetch(restUrl + "?on_conflict=id", {
      method: "POST",
      headers: {
        ...dbHeaders,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ id: 1, ...values, updated_at: savedAt }),
      signal: AbortSignal.timeout(10000),
    });
    const saveText = await save.text();
    if (!save.ok) return reply({ error: "Cloud write failed", detail: saveText.slice(0, 300) }, 502);

    const verify = await fetch(restUrl + "?id=eq.1&select=id,pt,pd,rh,usd,updated_at", {
      headers: dbHeaders,
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const verifyText = await verify.text();
    if (!verify.ok) return reply({ error: "Cloud verification read failed", detail: verifyText.slice(0, 300) }, 502);
    const rows = JSON.parse(verifyText);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || keys.some((key) => Number(row[key]) !== values[key])) {
      return reply({ error: "Cloud verification mismatch", saved: row ?? null }, 502);
    }
    return reply({ ok: true, saved: { pt: Number(row.pt), pd: Number(row.pd), rh: Number(row.rh), usd: Number(row.usd), updated_at: row.updated_at } });
  } catch (error) {
    return reply({ error: "Cloud save request failed", detail: error instanceof Error ? error.message : String(error) }, 502);
  }
});
