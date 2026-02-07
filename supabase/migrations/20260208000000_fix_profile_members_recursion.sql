-- ============================================================================
-- HOTFIX: Fix profile_members_read policy recursion
-- ============================================================================
--
-- Issue: profile_members_read policy with caretaker_id check causes recursion
-- when caretaker_id is NULL or checking against profiles indirectly
--
-- Solution: Simplify policy to only check user_id, not caretaker_id
-- Caretaker access is controlled at the profiles and other tables level
--
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS profile_members_read ON profile_members;

-- Recreate with simple, non-recursive logic
-- Only allow reading own profile_members record or if you're querying it via profile access
CREATE POLICY profile_members_read ON profile_members
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

-- Allow caretaker to manage (insert/update/delete) members in their profiles
DROP POLICY IF EXISTS profile_members_manage ON profile_members;
CREATE POLICY profile_members_manage ON profile_members
  FOR ALL
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
-- Result: profile_members policies are now simple and non-recursive
-- Access control is enforced at the parent table level (calls, alerts, etc)
--
-- ============================================================================
