-- Add user ownership to profile device tokens so push delivery can follow
-- per-member notification preferences.

ALTER TABLE profile_device_tokens
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE profile_device_tokens
SET user_id = caretaker_id
WHERE user_id IS NULL
  AND caretaker_id IS NOT NULL;

ALTER TABLE profile_device_tokens
ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profile_device_tokens_profile_user
  ON profile_device_tokens(profile_id, user_id);
