-- Trial expiration edge case handling:
-- 1. Track subscription status on profiles for validation
-- 2. Track orphaned DIDs when trial numbers are reclaimed

-- Add has_active_subscription column to profiles (defaults to true for backward compatibility)
alter table profiles
add column if not exists has_active_subscription boolean not null default true;

-- Add forwarding_number_cleared_at to track when trial ended
alter table profiles  
add column if not exists forwarding_number_cleared_at timestamptz;

-- Create table to track orphaned DIDs (numbers reclaimed from expired trials)
create table if not exists orphaned_dids (
  id uuid primary key default gen_random_uuid(),
  phone_number varchar(20) not null unique,
  original_profile_id uuid references profiles (id) on delete set null,
  reclaim_reason varchar(100) not null default 'trial_expired',
  reclaimed_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for fast lookup during call validation
create index if not exists idx_orphaned_dids_phone_number
  on orphaned_dids (phone_number);

create index if not exists idx_orphaned_dids_original_profile
  on orphaned_dids (original_profile_id);

-- Add subscription validation indexes
create index if not exists idx_profiles_has_active_subscription
  on profiles (has_active_subscription)
  where has_active_subscription = false;

-- Update user subscriptions table to store trial-related timestamps
alter table user_subscriptions
add column if not exists trial_started_at timestamptz,
add column if not exists trial_converted_at timestamptz,
add column if not exists trial_reclaimed_at timestamptz,
add column if not exists trial_purge_after_at timestamptz,
add column if not exists trial_purged_at timestamptz;

create index if not exists idx_user_subscriptions_trial_status
  on user_subscriptions (trial_started_at, trial_converted_at, trial_reclaimed_at)
  where trial_started_at is not null and trial_converted_at is null;
