-- Track subscription trial lifecycle and number restore metadata.

alter table if exists user_subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_converted_at timestamptz,
  add column if not exists trial_reclaimed_at timestamptz,
  add column if not exists trial_purge_after_at timestamptz,
  add column if not exists trial_purged_at timestamptz;

create index if not exists idx_user_subscriptions_trial_ends_at
  on user_subscriptions (trial_ends_at)
  where trial_started_at is not null;

create index if not exists idx_user_subscriptions_trial_reclaim
  on user_subscriptions (trial_reclaimed_at, trial_converted_at, trial_purged_at)
  where trial_started_at is not null;

alter table if exists profiles
  add column if not exists last_released_twilio_number text,
  add column if not exists last_number_released_at timestamptz;

create index if not exists idx_profiles_last_released_twilio_number
  on profiles (last_released_twilio_number)
  where last_released_twilio_number is not null;
