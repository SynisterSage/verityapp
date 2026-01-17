-- Adds columns to track Twilio Client identities and availability.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS twilio_client_identity TEXT;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS twilio_client_last_seen_at TIMESTAMPTZ;
