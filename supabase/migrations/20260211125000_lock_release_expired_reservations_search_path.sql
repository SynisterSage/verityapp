-- =====================================================================
-- MIGRATION: Lock search_path for release_expired_reservations
-- =====================================================================

ALTER FUNCTION release_expired_reservations()
  SET search_path = pg_catalog, public;
