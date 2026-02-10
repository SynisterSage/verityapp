-- =====================================================================
-- MIGRATION: Lock search_path for blocked callers update trigger
-- =====================================================================

ALTER FUNCTION set_blocked_callers_updated_at()
  SET search_path = pg_catalog, public;
