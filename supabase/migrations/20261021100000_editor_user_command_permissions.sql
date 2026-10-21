-- Cata-Logic: additive foundation for Owner-controlled Editor permissions.
-- This migration is intentionally additive: it does not alter existing History,
-- market snapshots, formulas, settings, storage keys, or existing RLS policies.
create table if not exists public.workspace_member_permissions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approved boolean not null default false,
  permissions jsonb not null default jsonb_build_object(
    'new_entry', false,
    'share_app_link', false,
    'section_lock', false,
    'less_history', false,
    'connection_service', false,
    'viewer_app_command', false,
    'edit_delete', false,
    'view_cloud_data', false,
    'manual_market_update', false
  ),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_member_permissions enable row level security;

drop policy if exists "member_permissions_owner_read" on public.workspace_member_permissions;
create policy "member_permissions_owner_read"
  on public.workspace_member_permissions for select to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  ));

drop policy if exists "member_permissions_self_read" on public.workspace_member_permissions;
create policy "member_permissions_self_read"
  on public.workspace_member_permissions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "member_permissions_owner_insert" on public.workspace_member_permissions;
create policy "member_permissions_owner_insert"
  on public.workspace_member_permissions for insert to authenticated
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  ));

drop policy if exists "member_permissions_owner_update" on public.workspace_member_permissions;
create policy "member_permissions_owner_update"
  on public.workspace_member_permissions for update to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  ));

drop policy if exists "member_permissions_owner_delete" on public.workspace_member_permissions;
create policy "member_permissions_owner_delete"
  on public.workspace_member_permissions for delete to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  ));

grant select, insert, update, delete on public.workspace_member_permissions to authenticated;

create or replace function public.workspace_feature_enabled(
  p_workspace_id uuid,
  p_feature text,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_user_id is null or p_feature is null then false
    when exists (
      select 1 from public.workspaces w
      where w.id = p_workspace_id and w.owner_id = p_user_id
    ) then true
    else exists (
      select 1 from public.workspace_member_permissions p
      join public.workspace_members m
        on m.workspace_id = p.workspace_id and m.user_id = p.user_id
      where p.workspace_id = p_workspace_id
        and p.user_id = p_user_id
        and p.approved = true
        and coalesce((p.permissions ->> p_feature)::boolean, false) = true
    )
  end
$$;

revoke all on function public.workspace_feature_enabled(uuid, text, uuid) from public, anon;
grant execute on function public.workspace_feature_enabled(uuid, text, uuid) to authenticated;

comment on table public.workspace_member_permissions is
  'Owner-managed per-user Editor App permissions. Owner is determined by workspaces.owner_id, never by device or member role.';
comment on function public.workspace_feature_enabled(uuid, text, uuid) is
  'Returns true for workspace owner, otherwise requires an approved member and an explicitly enabled permission.';
