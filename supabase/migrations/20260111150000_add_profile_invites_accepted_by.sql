-- Track which user accepted an invite so we can revoke it later.

alter table profile_invites
  add column if not exists accepted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_profile_invites_accepted_by on profile_invites(accepted_by);
