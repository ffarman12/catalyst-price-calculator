import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const WORKSPACE_ID = "0287285c-044b-4a08-9ed5-314b40fde0e8";
const ALLOWED_ORIGIN = "https://ffarman12.github.io";
const headers = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") return reply({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== ALLOWED_ORIGIN) return reply({ error: "Origin not allowed" }, 403);

  const authz = req.headers.get("authorization") || "";
  const tokenMatch = authz.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return reply({ error: "Login required" }, 401);
  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) return reply({ error: "Server authorization is not configured" }, 503);

  const serviceHeaders = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };
  try {
    const authResponse = await fetch(baseUrl + "/auth/v1/user", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + tokenMatch[1] },
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!authResponse.ok) return reply({ error: "Login session is invalid or expired" }, 401);
    const user = await authResponse.json();
    if (!user || typeof user.id !== "string") return reply({ error: "Login session is invalid" }, 401);

    const ownerResponse = await fetch(
      baseUrl + "/rest/v1/workspaces?id=eq." + encodeURIComponent(WORKSPACE_ID) + "&select=owner_id",
      { headers: serviceHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!ownerResponse.ok) return reply({ error: "Could not verify workspace owner" }, 503);
    const ownerRows = await ownerResponse.json();
    const workspace = Array.isArray(ownerRows) ? ownerRows[0] : null;
    if (!workspace || typeof workspace.owner_id !== "string") return reply({ error: "Workspace owner could not be verified" }, 503);
    if (workspace.owner_id !== user.id) return reply({ error: "Owner account required" }, 403);

    const membersResponse = await fetch(
      baseUrl + "/rest/v1/workspace_members?workspace_id=eq." + encodeURIComponent(WORKSPACE_ID) + "&select=user_id,role",
      { headers: serviceHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!membersResponse.ok) return reply({ error: "Could not load workspace members" }, 502);
    const members = await membersResponse.json();
    if (!Array.isArray(members)) return reply({ error: "Workspace member list is invalid" }, 502);

    const usersResponse = await fetch(baseUrl + "/auth/v1/admin/users?page=1&per_page=1000", {
      headers: serviceHeaders, signal: AbortSignal.timeout(10000), cache: "no-store",
    });
    if (!usersResponse.ok) return reply({ error: "Could not load account emails" }, 502);
    const usersPayload = await usersResponse.json();
    const authUsers = Array.isArray(usersPayload) ? usersPayload : usersPayload.users;
    if (!Array.isArray(authUsers)) return reply({ error: "Auth user list is invalid" }, 502);
    const emailById = new Map(authUsers.map((u: { id?: string; email?: string }) => [u.id, u.email || ""]));
    return reply({
      ok: true,
      users: members.map((m: { user_id: string; role: string }) => ({
        user_id: m.user_id,
        role: m.role,
        email: emailById.get(m.user_id) || "",
      })),
    });
  } catch (_error) {
    return reply({ error: "Could not securely load Editor accounts" }, 502);
  }
});
