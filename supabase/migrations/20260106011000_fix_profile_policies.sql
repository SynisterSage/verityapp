-- Break recursive policy chain by simplifying profile access (caretaker only) for now.

drop policy if exists profiles_read on profiles;

create policy profiles_read on profiles
  for select
  using (caretaker_id = auth.uid());

drop policy if exists profile_members_read on profile_members;
create policy profile_members_read on profile_members
  for select
  using (user_id = auth.uid());

drop policy if exists profile_members_manage on profile_members;
create policy profile_members_manage on profile_members
  for all
  using (false)
  with check (false);
