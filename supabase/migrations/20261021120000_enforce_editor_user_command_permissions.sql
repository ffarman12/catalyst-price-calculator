-- Enforce Editor User Command permissions at existing write boundaries.
-- Additive to data: does not delete or rewrite History, market snapshots, settings, or photos.
-- Must be reviewed against all current RLS policies before production deployment.

-- Prevent authenticated callers from probing another member's permissions through the helper.
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
    when auth.uid() is null or p_workspace_id is null or p_feature is null then false
    when p_user_id is distinct from auth.uid()
      and not exists (
        select 1 from public.workspaces w
        where w.id = p_workspace_id and w.owner_id = auth.uid()
      ) then false
    when exists (
      select 1 from public.workspaces w
      where w.id = p_workspace_id and w.owner_id = coalesce(p_user_id, auth.uid())
    ) then true
    else exists (
      select 1 from public.workspace_member_permissions p
      join public.workspace_members m
        on m.workspace_id = p.workspace_id and m.user_id = p.user_id
      where p.workspace_id = p_workspace_id
        and p.user_id = coalesce(p_user_id, auth.uid())
        and p.approved = true
        and coalesce((p.permissions ->> p_feature)::boolean, false) = true
    )
  end
$$;

-- Remove overlapping permissive write policies; PostgreSQL ORs permissive policies,
-- so leaving even one legacy editor-write policy would bypass granular permissions.
drop policy if exists "editors update settings" on public.app_settings;
drop policy if exists "editors_delete_app_settings" on public.app_settings;
drop policy if exists "editors_insert_app_settings" on public.app_settings;
drop policy if exists "editors_update_app_settings" on public.app_settings;

create policy "approved_permission_insert_app_settings"
  on public.app_settings for insert to authenticated
  with check (public.workspace_feature_enabled(workspace_id, 'refine_settings'));
create policy "approved_permission_update_app_settings"
  on public.app_settings for update to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'refine_settings'))
  with check (public.workspace_feature_enabled(workspace_id, 'refine_settings'));
create policy "approved_permission_delete_app_settings"
  on public.app_settings for delete to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'refine_settings'));

drop policy if exists "editors delete" on public.converter_entries;
drop policy if exists "editors insert" on public.converter_entries;
drop policy if exists "editors update" on public.converter_entries;
drop policy if exists "editors_delete_converter_entries" on public.converter_entries;
drop policy if exists "editors_insert_converter_entries" on public.converter_entries;
drop policy if exists "editors_update_converter_entries" on public.converter_entries;

create policy "approved_permission_insert_converter_entries"
  on public.converter_entries for insert to authenticated
  with check (public.workspace_feature_enabled(workspace_id, 'new_entry'));
create policy "approved_permission_update_converter_entries"
  on public.converter_entries for update to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'edit_delete'))
  with check (public.workspace_feature_enabled(workspace_id, 'edit_delete'));
create policy "approved_permission_delete_converter_entries"
  on public.converter_entries for delete to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'edit_delete'));

drop policy if exists "editors delete photos" on public.converter_photos;
drop policy if exists "editors insert photos" on public.converter_photos;
drop policy if exists "editors update photos" on public.converter_photos;
drop policy if exists "editors_delete_converter_photos" on public.converter_photos;
drop policy if exists "editors_insert_converter_photos" on public.converter_photos;
drop policy if exists "editors_update_converter_photos" on public.converter_photos;

create policy "approved_permission_insert_converter_photos"
  on public.converter_photos for insert to authenticated
  with check (public.workspace_feature_enabled(workspace_id, 'new_entry'));
create policy "approved_permission_update_converter_photos"
  on public.converter_photos for update to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'edit_delete'))
  with check (public.workspace_feature_enabled(workspace_id, 'edit_delete'));
create policy "approved_permission_delete_converter_photos"
  on public.converter_photos for delete to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'edit_delete'));

drop policy if exists "market_manual_state_editor_insert" on public.market_manual_state;
drop policy if exists "market_manual_state_editor_update" on public.market_manual_state;

create policy "approved_permission_insert_manual_market"
  on public.market_manual_state for insert to authenticated
  with check (public.workspace_feature_enabled(workspace_id, 'manual_market_update'));
create policy "approved_permission_update_manual_market"
  on public.market_manual_state for update to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'manual_market_update'))
  with check (public.workspace_feature_enabled(workspace_id, 'manual_market_update'));

drop policy if exists "section_lock_secrets_editor_delete" on public.section_lock_secrets;
drop policy if exists "section_lock_secrets_editor_insert" on public.section_lock_secrets;
drop policy if exists "section_lock_secrets_editor_update" on public.section_lock_secrets;
create policy "approved_permission_insert_section_lock_secrets"
  on public.section_lock_secrets for insert to authenticated
  with check (public.workspace_feature_enabled(workspace_id, 'section_lock'));
create policy "approved_permission_update_section_lock_secrets"
  on public.section_lock_secrets for update to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'section_lock'))
  with check (public.workspace_feature_enabled(workspace_id, 'section_lock'));
create policy "approved_permission_delete_section_lock_secrets"
  on public.section_lock_secrets for delete to authenticated
  using (public.workspace_feature_enabled(workspace_id, 'section_lock'));

revoke all on function public.workspace_feature_enabled(uuid, text, uuid) from public, anon;
grant execute on function public.workspace_feature_enabled(uuid, text, uuid) to authenticated;

comment on function public.workspace_feature_enabled(uuid, text, uuid) is
  'Owner bypass; otherwise requires workspace membership, approval, and the named permission. Non-owners may only query their own feature status.';
