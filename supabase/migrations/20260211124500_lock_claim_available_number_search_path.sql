-- =====================================================================
-- MIGRATION: Lock search_path for Twilio claim function
-- =====================================================================

ALTER FUNCTION claim_available_number(p_profile_id uuid)
  SET search_path = pg_catalog, public;
