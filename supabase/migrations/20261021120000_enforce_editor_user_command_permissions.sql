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

-- Keep app_settings write policies unchanged for now: that row also stores Viewer App
-- controls. A table-level RLS rule cannot safely distinguish those JSON keys, and
-- changing it here could break existing Viewer App behavior. Refine settings need a
-- separately designed field-level enforcement before this migration is production-ready.

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
  with check (exists (
    select 1 from public.converter_entries ce
    where ce.id = converter_photos.entry_id
      and public.workspace_feature_enabled(ce.workspace_id, 'new_entry')
  ));
create policy "approved_permission_update_converter_photos"
  on public.converter_photos for update to authenticated
  using (exists (
    select 1 from public.converter_entries ce
    where ce.id = converter_photos.entry_id
      and public.workspace_feature_enabled(ce.workspace_id, 'edit_delete')
  ))
  with check (exists (
    select 1 from public.converter_entries ce
    where ce.id = converter_photos.entry_id
      and public.workspace_feature_enabled(ce.workspace_id, 'edit_delete')
  ));
create policy "approved_permission_delete_converter_photos"
  on public.converter_photos for delete to authenticated
  using (exists (
    select 1 from public.converter_entries ce
    where ce.id = converter_photos.entry_id
      and public.workspace_feature_enabled(ce.workspace_id, 'edit_delete')
  ));

drop policy if exists "market_manual_state_editor_insert" on public.market_manual_state;
drop policy if exists "market_manual_state_editor_update" on public.market_manual_state;

create policy "approved_permission_insert_manual_market"
  on public.market_manual_state for insert to authenticated
  with check (
    id = 1 and public.workspace_feature_enabled('0287285c-044b-4a08-9ed5-314b40fde0e8'::uuid, 'manual_market_update')
  );
create policy "approved_permission_update_manual_market"
  on public.market_manual_state for update to authenticated
  using (
    id = 1 and public.workspace_feature_enabled('0287285c-044b-4a08-9ed5-314b40fde0e8'::uuid, 'manual_market_update')
  )
  with check (
    id = 1 and public.workspace_feature_enabled('0287285c-044b-4a08-9ed5-314b40fde0e8'::uuid, 'manual_market_update')
  );

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


-- Storage paths are workspace-id-prefixed. Enforce granular permissions for photo writes.
drop policy if exists "editors_delete_converter_photos_storage" on storage.objects;
drop policy if exists "editors_upload_converter_photos_storage" on storage.objects;
drop policy if exists "editors_update_converter_photos_storage" on storage.objects;
drop policy if exists "approved_permission_upload_converter_photos_storage" on storage.objects;
drop policy if exists "approved_permission_update_converter_photos_storage" on storage.objects;
drop policy if exists "approved_permission_delete_converter_photos_storage" on storage.objects;

create policy "approved_permission_upload_converter_photos_storage"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'converter-photos'
    and case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.workspace_feature_enabled(split_part(name, '/', 1)::uuid, 'new_entry')
      else false
    end
  );

create policy "approved_permission_update_converter_photos_storage"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'converter-photos'
    and case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.workspace_feature_enabled(split_part(name, '/', 1)::uuid, 'edit_delete')
      else false
    end
  )
  with check (
    bucket_id = 'converter-photos'
    and case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.workspace_feature_enabled(split_part(name, '/', 1)::uuid, 'edit_delete')
      else false
    end
  );

create policy "approved_permission_delete_converter_photos_storage"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'converter-photos'
    and case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.workspace_feature_enabled(split_part(name, '/', 1)::uuid, 'edit_delete')
      else false
    end
  );

revoke all on function public.workspace_feature_enabled(uuid, text, uuid) from public, anon;
grant execute on function public.workspace_feature_enabled(uuid, text, uuid) to authenticated;

comment on function public.workspace_feature_enabled(uuid, text, uuid) is
  'Owner bypass; otherwise requires workspace membership, approval, and the named permission. Non-owners may only query their own feature status.';
