-- Add a short invite code for easier sharing & manual entry.

alter table profile_invites
  add column if not exists short_code text;

create unique index if not exists idx_profile_invites_short_code
  on profile_invites(short_code)
  where short_code is not null;
