-- =====================================================================
-- MIGRATION: Lock search_path for profile device token trigger
-- =====================================================================

ALTER FUNCTION update_profile_device_tokens_updated_at()
  SET search_path = pg_catalog, public;
