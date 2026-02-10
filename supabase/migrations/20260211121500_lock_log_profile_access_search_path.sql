-- =====================================================================
-- MIGRATION: Ensure log_profile_access uses fixed search_path
-- =====================================================================

ALTER FUNCTION log_profile_access()
  SET search_path = pg_catalog, public;
