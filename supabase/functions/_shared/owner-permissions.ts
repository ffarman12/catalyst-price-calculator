// Server-side Owner Permission authorization for Editor-only Edge Function writes.
// This module intentionally verifies the caller's Supabase access token with Auth,
// then checks workspaces.owner_id or approved membership + explicit permission.
const WORKSPACE_ID = "0287285c-044b-4a08-9ed5-314b40fde0e8";

export type PermissionResult =
  | { ok: true; userId: string; owner: boolean }
  | { ok: false; status: number; error: string };

export async function authorizeEditorFeature(req: Request, feature: string): Promise<PermissionResult> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "Login required" };

  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) {
    return { ok: false, status: 503, error: "Server authorization is not configured" };
  }

  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: "Bearer " + serviceKey,
    "Content-Type": "application/json",
  };

  try {
    // Ask Supabase Auth to validate the user token; never trust decoded JWT claims alone.
    const authResponse = await fetch(baseUrl + "/auth/v1/user", {
      headers: { apikey: serviceKey, Authorization: "Bearer " + match[1] },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!authResponse.ok) return { ok: false, status: 401, error: "Login session is invalid or expired" };
    const user = await authResponse.json();
    if (!user || typeof user.id !== "string") return { ok: false, status: 401, error: "Login session is invalid" };

    const workspaceResponse = await fetch(
      baseUrl + "/rest/v1/workspaces?id=eq." + encodeURIComponent(WORKSPACE_ID) + "&select=owner_id",
      { headers: serviceHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!workspaceResponse.ok) return { ok: false, status: 503, error: "Could not verify workspace owner" };
    const workspaces = await workspaceResponse.json();
    const workspace = Array.isArray(workspaces) ? workspaces[0] : null;
    if (!workspace || typeof workspace.owner_id !== "string") {
      return { ok: false, status: 503, error: "Workspace owner could not be verified" };
    }
    if (workspace.owner_id === user.id) return { ok: true, userId: user.id, owner: true };

    const membershipResponse = await fetch(
      baseUrl + "/rest/v1/workspace_members?workspace_id=eq." + encodeURIComponent(WORKSPACE_ID) +
        "&user_id=eq." + encodeURIComponent(user.id) + "&select=user_id",
      { headers: serviceHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!membershipResponse.ok) return { ok: false, status: 503, error: "Could not verify workspace membership" };
    const memberships = await membershipResponse.json();
    if (!Array.isArray(memberships) || memberships.length === 0) {
      return { ok: false, status: 403, error: "Workspace membership required" };
    }

    const permissionResponse = await fetch(
      baseUrl + "/rest/v1/workspace_member_permissions?workspace_id=eq." + encodeURIComponent(WORKSPACE_ID) +
        "&user_id=eq." + encodeURIComponent(user.id) + "&select=approved,permissions",
      { headers: serviceHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    // Missing table, query errors, and absent rows all fail closed for non-owners.
    if (!permissionResponse.ok) return { ok: false, status: 403, error: "Owner permission has not been granted" };
    const rows = await permissionResponse.json();
    const record = Array.isArray(rows) ? rows[0] : null;
    if (!record || record.approved !== true || !record.permissions || record.permissions[feature] !== true) {
      return { ok: false, status: 403, error: "Owner permission is required for this action" };
    }
    return { ok: true, userId: user.id, owner: false };
  } catch (_error) {
    return { ok: false, status: 503, error: "Permission verification failed; action denied" };
  }
}
