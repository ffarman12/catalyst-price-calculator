-- Close direct-write paths that could bypass Owner permissions.
-- Editors update the existing shared app_settings row through UPDATE/UPSERT; only the Owner may delete it.
drop policy if exists "editors_delete_app_settings" on public.app_settings;
create policy "owner_delete_app_settings"
  on public.app_settings for delete to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = app_settings.workspace_id and w.owner_id = auth.uid()
  ));

create or replace function public.enforce_editor_settings_feature_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.settings, '{}'::jsonb) ? 'lessHistory'
       or coalesce(new.settings, '{}'::jsonb) ? 'historyLessRates' then
      if not public.workspace_feature_enabled(new.workspace_id, 'less_history') then
        raise exception 'Owner permission required: less_history' using errcode = '42501';
      end if;
    end if;
    if coalesce(new.settings, '{}'::jsonb) ? 'sectionLocks' then
      if not public.workspace_feature_enabled(new.workspace_id, 'section_lock') then
        raise exception 'Owner permission required: section_lock' using errcode = '42501';
      end if;
    end if;
    if coalesce(new.viewer_ppm_enabled, false)
       or coalesce(new.settings, '{}'::jsonb) ? 'viewerHistoryLessEnabled' then
      if not public.workspace_feature_enabled(new.workspace_id, 'viewer_app_command') then
        raise exception 'Owner permission required: viewer_app_command' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if old.settings -> 'lessHistory' is distinct from new.settings -> 'lessHistory'
     or old.settings -> 'historyLessRates' is distinct from new.settings -> 'historyLessRates' then
    if not public.workspace_feature_enabled(new.workspace_id, 'less_history') then
      raise exception 'Owner permission required: less_history' using errcode = '42501';
    end if;
  end if;

  if old.settings -> 'sectionLocks' is distinct from new.settings -> 'sectionLocks' then
    if not public.workspace_feature_enabled(new.workspace_id, 'section_lock') then
      raise exception 'Owner permission required: section_lock' using errcode = '42501';
    end if;
  end if;

  if old.viewer_ppm_enabled is distinct from new.viewer_ppm_enabled
     or old.settings -> 'viewerHistoryLessEnabled' is distinct from new.settings -> 'viewerHistoryLessEnabled' then
    if not public.workspace_feature_enabled(new.workspace_id, 'viewer_app_command') then
      raise exception 'Owner permission required: viewer_app_command' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_editor_settings_feature_permissions on public.app_settings;
create trigger enforce_editor_settings_feature_permissions
before insert or update of settings, viewer_ppm_enabled on public.app_settings
for each row
execute function public.enforce_editor_settings_feature_permissions();

revoke all on function public.enforce_editor_settings_feature_permissions() from public, anon, authenticated;

-- The frontend and Edge Function use market-manual-save; this legacy SECURITY DEFINER RPC
-- must not remain callable directly by anon/authenticated clients.
revoke all on function public.save_manual_market_state(numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.save_manual_market_state(numeric, numeric, numeric, numeric) to service_role;
