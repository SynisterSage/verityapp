-- Add passcode hash for profile call screening

alter table profiles
  add column if not exists passcode_hash text;
