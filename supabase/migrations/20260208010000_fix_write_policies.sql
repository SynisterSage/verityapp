-- ============================================================================
-- MIGRATION: Fix write policies for blocked_callers, trusted_contacts, etc.
-- ============================================================================
--
-- Issue: INSERT/UPDATE/DELETE operations failing because policies need
-- to verify caretaker_id matches auth.uid()
--
-- Fix: Ensure all _manage policies use direct caretaker_id column checks
--
-- ============================================================================

-- Fix blocked_callers_manage policy
DROP POLICY IF EXISTS blocked_callers_manage ON blocked_callers;
CREATE POLICY blocked_callers_manage ON blocked_callers
  FOR ALL
  USING (
    caretaker_id = auth.uid()
  )
  WITH CHECK (
    caretaker_id = auth.uid()
  );

-- Fix trusted_contacts_manage policy
DROP POLICY IF EXISTS trusted_contacts_manage ON trusted_contacts;
CREATE POLICY trusted_contacts_manage ON trusted_contacts
  FOR ALL
  USING (
    caretaker_id = auth.uid()
  )
  WITH CHECK (
    caretaker_id = auth.uid()
  );

-- Fix fraud_safe_phrases_manage policy
DROP POLICY IF EXISTS fraud_safe_phrases_manage ON fraud_safe_phrases;
CREATE POLICY fraud_safe_phrases_manage ON fraud_safe_phrases
  FOR ALL
  USING (
    caretaker_id = auth.uid()
  )
  WITH CHECK (
    caretaker_id = auth.uid()
  );

-- Fix profile_device_tokens_manage policy
DROP POLICY IF EXISTS profile_device_tokens_manage ON profile_device_tokens;
CREATE POLICY profile_device_tokens_manage ON profile_device_tokens
  FOR ALL
  USING (
    caretaker_id = auth.uid()
  )
  WITH CHECK (
    caretaker_id = auth.uid()
  );

-- Fix calls write policies (for marking fraud/safe)
DROP POLICY IF EXISTS calls_update ON calls;
CREATE POLICY calls_update ON calls
  FOR UPDATE
  USING (
    caretaker_id = auth.uid()
  )
  WITH CHECK (
    caretaker_id = auth.uid()
  );

-- ============================================================================
-- COMPLETE
-- ============================================================================
--
-- All write policies now check caretaker_id directly without recursion
-- This allows:
-- - Adding blocked callers
-- - Adding trusted contacts
-- - Importing trusted contacts
-- - Setting automation/flags
-- - Updating call details
--
-- ============================================================================
