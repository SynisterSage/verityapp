-- Add VoIP push token to profiles for PushKit notifications
-- VoIP push tokens are separate from regular push tokens and use a different APNs endpoint

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS voip_push_token TEXT;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS voip_push_token_updated_at TIMESTAMPTZ;

-- Index for quick lookups when sending VoIP pushes
CREATE INDEX IF NOT EXISTS idx_profiles_voip_push_token
  ON profiles(voip_push_token)
  WHERE voip_push_token IS NOT NULL;

COMMENT ON COLUMN profiles.voip_push_token IS 'APNs VoIP push token for PushKit notifications (wakes app from killed state)';
COMMENT ON COLUMN profiles.voip_push_token_updated_at IS 'Timestamp when VoIP push token was last updated';
