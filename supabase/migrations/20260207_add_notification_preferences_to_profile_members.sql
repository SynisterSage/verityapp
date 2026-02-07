-- ============================================================================
-- MIGRATION: Move notification preferences to profile_members (per-user)
-- ============================================================================
--
-- Issue: Notification preferences stored on profiles table tied to caretaker.
-- When editors/family members try to update, they get 403 Forbidden because
-- they can't modify the caretaker's profile.
--
-- Solution: Move notification_preferences to profile_members table so each
-- user has their own notification settings per profile they're a member of.
--
-- This allows:
-- - Each profile member to control their own notifications
-- - Different notification preferences per role (editor vs family)
-- - Clean RLS: user can only modify their own profile_members row
--
-- ============================================================================

-- Add notification_preferences JSONB column to profile_members
ALTER TABLE profile_members
ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT jsonb_build_object(
  'enable_email_alerts', true,
  'enable_sms_alerts', true,
  'enable_push_alerts', true,
  'alert_threshold_score', 50,
  'auto_mark_enabled', false,
  'auto_mark_fraud_threshold', 80,
  'auto_mark_safe_threshold', 20,
  'auto_trust_on_safe', false,
  'auto_block_on_fraud', false
);

-- For existing members, copy caretaker's notification preferences from profiles table
UPDATE profile_members pm
SET notification_preferences = jsonb_build_object(
  'enable_email_alerts', COALESCE(p.enable_email_alerts, true),
  'enable_sms_alerts', COALESCE(p.enable_sms_alerts, true),
  'enable_push_alerts', COALESCE(p.enable_push_alerts, true),
  'alert_threshold_score', COALESCE(p.alert_threshold_score, 50),
  'auto_mark_enabled', COALESCE(p.auto_mark_enabled, false),
  'auto_mark_fraud_threshold', COALESCE(p.auto_mark_fraud_threshold, 80),
  'auto_mark_safe_threshold', COALESCE(p.auto_mark_safe_threshold, 20),
  'auto_trust_on_safe', COALESCE(p.auto_trust_on_safe, false),
  'auto_block_on_fraud', COALESCE(p.auto_block_on_fraud, false)
)
FROM profiles p
WHERE pm.profile_id = p.id;

-- Update RLS policy to allow users to update their own notification_preferences
DROP POLICY IF EXISTS profile_members_manage ON profile_members;
CREATE POLICY profile_members_manage ON profile_members
  FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (SELECT caretaker_id FROM profiles WHERE id = profile_id) = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid() OR
    (SELECT caretaker_id FROM profiles WHERE id = profile_id) = auth.uid()
  );

-- Create policy to allow selecting profile_members for viewing notification prefs
DROP POLICY IF EXISTS profile_members_select ON profile_members;
CREATE POLICY profile_members_select ON profile_members
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    (SELECT caretaker_id FROM profiles WHERE id = profile_id) = auth.uid()
  );

-- Optional: Create policy for admins to view members in their profiles
DROP POLICY IF EXISTS profile_members_admin_select ON profile_members;
CREATE POLICY profile_members_admin_select ON profile_members
  FOR SELECT
  USING (
    (SELECT caretaker_id FROM profiles WHERE id = profile_id) = auth.uid()
  );
