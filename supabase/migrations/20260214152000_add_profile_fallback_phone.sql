alter table if exists profiles
  add column if not exists fallback_phone_number text,
  add column if not exists twilio_client_stale_notified_at timestamptz;

