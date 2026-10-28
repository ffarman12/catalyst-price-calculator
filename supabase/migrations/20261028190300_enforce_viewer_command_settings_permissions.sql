-- Enforce Viewer Command permissions for the shared Viewer settings fields.
-- The editor app's local-only View PPM preference remains separate; this protects
-- the cloud Viewer App PPM flag and Viewer History Less control.
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
before update of settings, viewer_ppm_enabled on public.app_settings
for each row
execute function public.enforce_editor_settings_feature_permissions();

revoke all on function public.enforce_editor_settings_feature_permissions() from public, anon, authenticated;
