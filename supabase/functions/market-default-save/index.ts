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
  const rest = url.replace(/\/$/, "") + "/rest/v1/market_default_state";
  const keys = ["pt", "pd", "rh", "usd"] as const;
  const dbHeaders = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };

  if (req.method === "GET") {
    try {
      const response = await fetch(rest + "?id=eq.1&select=id,pt,pd,rh,usd,updated_at", {
        headers: dbHeaders, signal: AbortSignal.timeout(10000), cache: "no-store",
      });
      const raw = await response.text();
      if (!response.ok) return reply({ error: "Cloud read failed", detail: raw.slice(0, 300) }, 502);
      const rows = JSON.parse(raw);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || keys.some((key) => !Number.isFinite(Number(row[key])) || Number(row[key]) <= 0) || !row.updated_at) {
        return reply({ error: "No valid saved Default Market values in Cloud" }, 404);
      }
      return reply({ ok: true, saved: { pt: Number(row.pt), pd: Number(row.pd), rh: Number(row.rh), usd: Number(row.usd), updated_at: row.updated_at } });
    } catch (error) {
      return reply({ error: "Cloud read request failed", detail: error instanceof Error ? error.message : String(error) }, 502);
    }
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body" }, 400); }

  // Direct manual writes require Owner Permission. Preserve the existing automatic
  // live-market sync path only when submitted values match the current server-saved
  // live market (allowing Rh to use the already-saved Manual Market Rh fallback).
  const authz = await authorizeEditorFeature(req, "manual_market_update");
  if (!authz.ok) {
    if (authz.error === "Editor account membership required") return reply({ error: authz.error }, authz.status);
    try {
      const liveResponse = await fetch(
        url.replace(/\/$/, "") + "/rest/v1/market_live_state?id=eq.1&select=pt,pd,rh,usd",
        { headers: dbHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      const manualResponse = await fetch(
        url.replace(/\/$/, "") + "/rest/v1/market_manual_state?id=eq.1&select=rh",
        { headers: dbHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      if (!liveResponse.ok || !manualResponse.ok) return reply({ error: authz.error }, authz.status);
      const liveRows = await liveResponse.json();
      const manualRows = await manualResponse.json();
      const live = Array.isArray(liveRows) ? liveRows[0] : null;
      const manual = Array.isArray(manualRows) ? manualRows[0] : null;
      const same = !!live &&
        Number(body.pt) === Number(live.pt) &&
        Number(body.pd) === Number(live.pd) &&
        Number(body.usd) === Number(live.usd) &&
        (Number(body.rh) === Number(live.rh) || (manual && Number(body.rh) === Number(manual.rh)));
      if (!same) return reply({ error: authz.error }, authz.status);
    } catch (_error) {
      return reply({ error: authz.error }, authz.status);
    }
  }
  const values: Record<string, number> = {};
  for (const key of keys) {
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value <= 0 || value > (key === "usd" ? 100000 : 10000000)) {
      return reply({ error: "Invalid market value", field: key }, 400);
    }
    values[key] = value;
  }

  const savedAt = new Date().toISOString();
  try {
    const save = await fetch(rest + "?on_conflict=id", {
      method: "POST",
      headers: { ...dbHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: 1, ...values, updated_at: savedAt }),
      signal: AbortSignal.timeout(10000),
    });
    const raw = await save.text();
    if (!save.ok) return reply({ error: "Cloud write failed", detail: raw.slice(0, 300) }, 502);

    const verify = await fetch(rest + "?id=eq.1&select=id,pt,pd,rh,usd,updated_at", {
      headers: dbHeaders, signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    const verifyRaw = await verify.text();
    if (!verify.ok) return reply({ error: "Cloud verification read failed", detail: verifyRaw.slice(0, 300) }, 502);
    const rows = JSON.parse(verifyRaw);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || keys.some((key) => Number(row[key]) !== values[key])) {
      return reply({ error: "Cloud verification mismatch", saved: row ?? null }, 502);
    }
    return reply({ ok: true, saved: { pt: Number(row.pt), pd: Number(row.pd), rh: Number(row.rh), usd: Number(row.usd), updated_at: row.updated_at } });
  } catch (error) {
    return reply({ error: "Cloud save request failed", detail: error instanceof Error ? error.message : String(error) }, 502);
  }
});