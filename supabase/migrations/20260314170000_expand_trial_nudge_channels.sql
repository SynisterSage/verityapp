-- Allow trial reminder emails to record deliveries alongside push channels.

ALTER TABLE trial_nudge_events DROP CONSTRAINT IF EXISTS trial_nudge_events_channel_check;

ALTER TABLE trial_nudge_events
ADD CONSTRAINT trial_nudge_events_channel_check
CHECK (channel IN ('push', 'in_app', 'email'));
