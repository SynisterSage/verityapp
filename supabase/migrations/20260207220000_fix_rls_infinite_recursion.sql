-- ============================================================================
-- MIGRATION HOTFIX: Fix RLS Infinite Recursion in profile_members
-- ============================================================================
--
-- ISSUE: Nested EXISTS checks trigger RLS policies recursively:
-- - calls_read → profile_members EXISTS → profile_members_read policy
-- - profile_members_read → profiles EXISTS
-- This creates infinite recursion in the policy evaluation
--
-- ROOT CAUSE: When evaluating calls_read for calls.profile_id = X:
-- 1. Check: EXISTS (SELECT FROM profile_members WHERE profile_id = X AND user_id = auth.uid())
-- 2. This triggers profile_members RLS policy (profile_members_read)
-- 3. Which checks: EXISTS (SELECT FROM profiles WHERE id = profile_members.profile_id AND caretaker_id = auth.uid())
-- 4. This loads profiles data which cascades back to calls policy
--
-- SOLUTION: Use LEFT JOIN pattern to avoid triggering RLS on dependent tables
-- JOINs in RLS policies don't trigger the join'd table's RLS policies
--
-- ============================================================================

-- Drop all broken policies
DROP POLICY IF EXISTS calls_read ON calls;
DROP POLICY IF EXISTS alerts_read ON alerts;
DROP POLICY IF EXISTS trusted_contacts_read ON trusted_contacts;
DROP POLICY IF EXISTS blocked_callers_read ON blocked_callers;
DROP POLICY IF EXISTS fraud_safe_phrases_read ON fraud_safe_phrases;
DROP POLICY IF EXISTS profile_device_tokens_read ON profile_device_tokens;

-- Recreate calls_read using LEFT JOIN (avoids RLS recursion)
CREATE POLICY calls_read ON calls
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN profile_members pm ON pm.profile_id = p.id AND pm.user_id = auth.uid()
      WHERE p.id = calls.profile_id
        AND (p.caretaker_id = auth.uid() OR pm.user_id IS NOT NULL)
    )
  );

-- Recreate alerts_read using LEFT JOIN
CREATE POLICY alerts_read ON alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN profile_members pm ON pm.profile_id = p.id AND pm.user_id = auth.uid()
      WHERE p.id = alerts.profile_id
        AND (p.caretaker_id = auth.uid() OR pm.user_id IS NOT NULL)
    )
  );

-- Recreate trusted_contacts_read using LEFT JOIN
CREATE POLICY trusted_contacts_read ON trusted_contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN profile_members pm ON pm.profile_id = p.id AND pm.user_id = auth.uid()
      WHERE p.id = trusted_contacts.profile_id
        AND (p.caretaker_id = auth.uid() OR pm.user_id IS NOT NULL)
    )
  );

-- Recreate blocked_callers_read using LEFT JOIN
CREATE POLICY blocked_callers_read ON blocked_callers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN profile_members pm ON pm.profile_id = p.id AND pm.user_id = auth.uid()
      WHERE p.id = blocked_callers.profile_id
        AND (p.caretaker_id = auth.uid() OR pm.user_id IS NOT NULL)
    )
  );

-- Recreate fraud_safe_phrases_read using LEFT JOIN
CREATE POLICY fraud_safe_phrases_read ON fraud_safe_phrases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN profile_members pm ON pm.profile_id = p.id AND pm.user_id = auth.uid()
      WHERE p.id = fraud_safe_phrases.profile_id
        AND (p.caretaker_id = auth.uid() OR pm.user_id IS NOT NULL)
    )
  );

-- Recreate profile_device_tokens_read using LEFT JOIN
CREATE POLICY profile_device_tokens_read ON profile_device_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN profile_members pm ON pm.profile_id = p.id AND pm.user_id = auth.uid()
      WHERE p.id = profile_device_tokens.profile_id
        AND (p.caretaker_id = auth.uid() OR pm.user_id IS NOT NULL)
    )
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
--
-- Key changes:
-- 1. Replaced nested EXISTS on profile_members with LEFT JOIN
-- 2. LEFT JOINs don't trigger RLS policies on joined tables
-- 3. All policies now use: (caretaker_id = auth.uid()) OR (pm.user_id IS NOT NULL)
-- 4. This avoids infinite recursion while maintaining same access control
--
-- Result: Calls, alerts, and other resources are now visible to authorized users
--
-- ============================================================================
