-- Add support reply push preference to per-member notification settings.
-- Default is enabled so members receive live agent replies unless they opt out.

UPDATE profile_members
SET notification_preferences = jsonb_set(
  notification_preferences,
  '{enable_push_support_replies}',
  COALESCE(notification_preferences->'enable_push_support_replies', 'true'::jsonb),
  true
);

ALTER TABLE profile_members
ALTER COLUMN notification_preferences
SET DEFAULT jsonb_build_object(
  'enable_email_alerts', true,
  'enable_sms_alerts', true,
  'enable_push_alerts', true,
  'enable_push_trusted_activity', true,
  'enable_push_circle_activity', true,
  'enable_push_support_replies', true,
  'enable_email_weekly_reports', true,
  'alert_threshold_score', 60,
  'auto_mark_enabled', false,
  'auto_mark_fraud_threshold', 80,
  'auto_mark_safe_threshold', 20,
  'auto_trust_on_safe', false,
  'auto_block_on_fraud', false
);
