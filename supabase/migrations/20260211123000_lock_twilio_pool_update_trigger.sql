-- =====================================================================
-- MIGRATION: Lock search_path for twilio number pool update timestamp
-- =====================================================================

ALTER FUNCTION update_twilio_number_pool_updated_at()
  SET search_path = pg_catalog, public;
