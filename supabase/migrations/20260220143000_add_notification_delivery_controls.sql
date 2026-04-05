-- Add granular notification delivery controls to per-member notification preferences.
-- - Needs-attention alerts remain mandatory (fraud pushes always on).
-- - Trusted activity and circle activity can be toggled independently.
-- - Weekly email summaries can be toggled per owner/admin recipient.

-- Ensure new keys exist for all existing rows.
UPDATE profile_members
SET notification_preferences = jsonb_set(
  jsonb_set(
    jsonb_set(
      notification_preferences,
      '{enable_push_trusted_activity}',
      COALESCE(notification_preferences->'enable_push_trusted_activity', 'true'::jsonb),
      true
    ),
    '{enable_push_circle_activity}',
    COALESCE(notification_preferences->'enable_push_circle_activity', 'true'::jsonb),
    true
  ),
  '{enable_email_weekly_reports}',
  COALESCE(notification_preferences->'enable_email_weekly_reports', 'true'::jsonb),
  true
);

-- Keep the column default aligned for newly inserted members.
ALTER TABLE profile_members
ALTER COLUMN notification_preferences
SET DEFAULT jsonb_build_object(
  'enable_email_alerts', true,
  'enable_sms_alerts', true,
  'enable_push_alerts', true,
  'enable_push_trusted_activity', true,
  'enable_push_circle_activity', true,
  'enable_email_weekly_reports', true,
  'alert_threshold_score', 60,
  'auto_mark_enabled', false,
  'auto_mark_fraud_threshold', 80,
  'auto_mark_safe_threshold', 20,
  'auto_trust_on_safe', false,
  'auto_block_on_fraud', false
);
