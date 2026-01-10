-- Remove the legacy 'viewer' role so only 'admin' and 'editor' remain.
-- This mirrors the new frontend/UX where only admin/editor exist.

alter table profile_members
  alter column role set default 'editor';

update profile_members
  set role = 'editor'
  where role = 'viewer';

alter table profile_members
  drop constraint if exists family_role_check,
  add constraint family_role_check check (role in ('admin', 'editor'));

alter table profile_invites
  alter column role set default 'editor';

update profile_invites
  set role = 'editor'
  where role = 'viewer';

alter table profile_invites
  drop constraint if exists profile_invites_role_check,
  add constraint profile_invites_role_check check (role in ('admin', 'editor'));
