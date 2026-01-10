-- Track display names for profile members so we can show their preferred name.

alter table profile_members
  add column if not exists display_name text;
