-- Enhance profile pin security with Argon2 hashing helpers

alter table profiles
  add column if not exists pin_hash text;

alter table profiles
  add column if not exists pin_salt bytea;

alter table profiles
  add column if not exists pin_pepper_version integer not null default 1
  constraint profiles_pin_pepper_version_check check (pin_pepper_version >= 1);

alter table profiles
  add column if not exists pin_locked_until timestamptz;

alter table profiles
  add column if not exists pin_updated_at timestamptz;

create table if not exists pin_attempts (
  profile_id uuid not null references profiles(id) on delete cascade,
  ip text not null,
  attempts integer not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (profile_id, ip)
);
