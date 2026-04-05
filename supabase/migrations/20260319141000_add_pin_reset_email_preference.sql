-- Add email preference for PIN reset requests.
-- Default is off so users must opt in.

UPDATE profile_members
SET notification_preferences = jsonb_set(
  notification_preferences,
  '{enable_email_pin_reset_requests}',
  COALESCE(notification_preferences->'enable_email_pin_reset_requests', 'false'::jsonb),
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
  'enable_email_pin_reset_requests', false,
  'alert_threshold_score', 60,
  'auto_mark_enabled', false,
  'auto_mark_fraud_threshold', 80,
  'auto_mark_safe_threshold', 20,
  'auto_trust_on_safe', false,
  'auto_block_on_fraud', false
);
