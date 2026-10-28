-- Trigger functions do not need to be directly callable through the Data API.
revoke all on function public.enforce_editor_settings_feature_permissions() from public, anon, authenticated;
