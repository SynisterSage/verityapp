-- =====================================================================
-- MIGRATION: Lock search_path for trusted contacts update trigger
-- =====================================================================

ALTER FUNCTION set_trusted_contacts_updated_at()
  SET search_path = pg_catalog, public;
