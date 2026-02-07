-- ============================================================================
-- MIGRATION: Denormalize caretaker_id to child tables
-- ============================================================================
--
-- PURPOSE: Fix RLS infinite recursion by avoiding reads from profiles table
-- 
-- APPROACH:
-- 1. Add caretaker_id to: calls, alerts, trusted_contacts, blocked_callers, 
--    fraud_safe_phrases, profile_device_tokens
-- 2. Populate from profiles.caretaker_id where profile_id = profiles.id
-- 3. Update RLS policies to check denormalized column instead of joining profiles
-- 4. Remove LEFT JOIN pattern - use simple direct checks
--
-- RESULT: Policies check auth directly on columns, no RLS recursion
--
-- ============================================================================

-- 1. Add caretaker_id to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caretaker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate caretaker_id from profiles
UPDATE calls c
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE c.profile_id = p.id AND c.caretaker_id IS NULL;

-- 2. Add caretaker_id to alerts table
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS caretaker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate caretaker_id from profiles
UPDATE alerts a
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE a.profile_id = p.id AND a.caretaker_id IS NULL;

-- 3. Add caretaker_id to trusted_contacts table
ALTER TABLE trusted_contacts ADD COLUMN IF NOT EXISTS caretaker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate caretaker_id from profiles
UPDATE trusted_contacts tc
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE tc.profile_id = p.id AND tc.caretaker_id IS NULL;

-- 4. Add caretaker_id to blocked_callers table
ALTER TABLE blocked_callers ADD COLUMN IF NOT EXISTS caretaker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate caretaker_id from profiles
UPDATE blocked_callers bc
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE bc.profile_id = p.id AND bc.caretaker_id IS NULL;

-- 5. Add caretaker_id to fraud_safe_phrases table
ALTER TABLE fraud_safe_phrases ADD COLUMN IF NOT EXISTS caretaker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate caretaker_id from profiles
UPDATE fraud_safe_phrases fsp
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE fsp.profile_id = p.id AND fsp.caretaker_id IS NULL;

-- 6. Add caretaker_id to profile_device_tokens table
ALTER TABLE profile_device_tokens ADD COLUMN IF NOT EXISTS caretaker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate caretaker_id from profiles
UPDATE profile_device_tokens pdt
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE pdt.profile_id = p.id AND pdt.caretaker_id IS NULL;

-- 7. Add caretaker_id to profile_members table (needed for profile_members_read policy)
ALTER TABLE profile_members ADD COLUMN IF NOT EXISTS caretaker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Populate caretaker_id from profiles
UPDATE profile_members pm
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE pm.profile_id = p.id AND pm.caretaker_id IS NULL;

-- ============================================================================
-- Now update RLS policies to use denormalized caretaker_id
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS calls_read ON calls;
DROP POLICY IF EXISTS alerts_read ON alerts;
DROP POLICY IF EXISTS trusted_contacts_read ON trusted_contacts;
DROP POLICY IF EXISTS blocked_callers_read ON blocked_callers;
DROP POLICY IF EXISTS fraud_safe_phrases_read ON fraud_safe_phrases;
DROP POLICY IF EXISTS profile_device_tokens_read ON profile_device_tokens;

-- Recreate calls_read without reading from profiles
CREATE POLICY calls_read ON calls
  FOR SELECT
  USING (
    caretaker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profile_members pm
      WHERE pm.profile_id = calls.profile_id
        AND pm.user_id = auth.uid()
    )
  );

-- Recreate alerts_read without reading from profiles
CREATE POLICY alerts_read ON alerts
  FOR SELECT
  USING (
    caretaker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profile_members pm
      WHERE pm.profile_id = alerts.profile_id
        AND pm.user_id = auth.uid()
    )
  );

-- Recreate trusted_contacts_read without reading from profiles
CREATE POLICY trusted_contacts_read ON trusted_contacts
  FOR SELECT
  USING (
    caretaker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profile_members pm
      WHERE pm.profile_id = trusted_contacts.profile_id
        AND pm.user_id = auth.uid()
    )
  );

-- Recreate blocked_callers_read without reading from profiles
CREATE POLICY blocked_callers_read ON blocked_callers
  FOR SELECT
  USING (
    caretaker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profile_members pm
      WHERE pm.profile_id = blocked_callers.profile_id
        AND pm.user_id = auth.uid()
    )
  );

-- Recreate fraud_safe_phrases_read without reading from profiles
CREATE POLICY fraud_safe_phrases_read ON fraud_safe_phrases
  FOR SELECT
  USING (
    caretaker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profile_members pm
      WHERE pm.profile_id = fraud_safe_phrases.profile_id
        AND pm.user_id = auth.uid()
    )
  );

-- Recreate profile_device_tokens_read without reading from profiles
CREATE POLICY profile_device_tokens_read ON profile_device_tokens
  FOR SELECT
  USING (
    caretaker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profile_members pm
      WHERE pm.profile_id = profile_device_tokens.profile_id
        AND pm.user_id = auth.uid()
    )
  );

-- Fix profile_members_read - use denormalized caretaker_id instead of reading from profiles
DROP POLICY IF EXISTS profile_members_read ON profile_members;
CREATE POLICY profile_members_read ON profile_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR caretaker_id = auth.uid()
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
--
-- What changed:
-- 1. Added caretaker_id columns to 6 child tables
-- 2. Populated from profiles denormalized data
-- 3. Updated RLS policies to use direct column checks
-- 4. No more reads from profiles table = no more recursion
--
-- Result: Simple, fast authorization without infinite recursion
--
-- ============================================================================
