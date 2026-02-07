-- ============================================================================
-- HOTFIX: Remove profile_members check from profiles_read to avoid recursion
-- ============================================================================
--
-- Issue: profiles_read policy checks profile_members with EXISTS, which triggers
-- profile_members RLS policies, which can cause infinite recursion.
--
-- Solution: Members don't need direct access to profiles table for reads.
-- They get data through authorized backend endpoints. Only caretaker needs
-- direct SELECT access to profiles table.
--
-- ============================================================================

-- Drop and recreate profiles_read without profile_members check
DROP POLICY IF EXISTS profiles_read ON profiles;
CREATE POLICY profiles_read ON profiles
  FOR SELECT
  USING (caretaker_id = auth.uid());

-- profiles_caretaker_all already handles INSERT/UPDATE/DELETE for caretakers
-- No changes needed there

-- ============================================================================
-- COMPLETE
-- ============================================================================
--
-- Result: profiles table RLS no longer references profile_members
-- This breaks the recursion cycle between profiles and profile_members
--
-- Members access profile data through backend endpoints which use service role
-- Only caretakers need direct database SELECT access
--
-- ============================================================================
