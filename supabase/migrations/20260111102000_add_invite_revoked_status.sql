-- Allow profile_invites to be marked as revoked when a member is removed

alter table profile_invites
  drop constraint if exists profile_invites_status_check,
  add constraint profile_invites_status_check check (status in ('pending', 'accepted', 'expired', 'revoked'));
