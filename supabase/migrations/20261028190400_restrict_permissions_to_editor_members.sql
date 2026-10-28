-- Restrict Owner-managed feature permissions to Editor-role workspace members.
create or replace function public.workspace_feature_enabled(
  p_workspace_id uuid,
  p_feature text,
  p_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null or p_workspace_id is null or p_feature is null then false
    when p_user_id is distinct from auth.uid()
      and not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid()) then false
    when exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = coalesce(p_user_id, auth.uid())) then true
    else exists (
      select 1 from public.workspace_member_permissions p
      join public.workspace_members m
        on m.workspace_id = p.workspace_id and m.user_id = p.user_id and m.role = 'editor'
      where p.workspace_id = p_workspace_id
        and p.user_id = coalesce(p_user_id, auth.uid())
        and p.approved = true
        and coalesce((p.permissions ->> p_feature)::boolean, false) = true
    )
  end
$$;
revoke all on function public.workspace_feature_enabled(uuid, text, uuid) from public, anon;
grant execute on function public.workspace_feature_enabled(uuid, text, uuid) to authenticated;
