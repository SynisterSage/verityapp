-- Add RLS to orphaned_dids table for security

alter table orphaned_dids enable row level security;

-- Allow caretaker of original profile to view their orphaned DIDs (audit trail)
create policy orphaned_dids_read_caretaker on orphaned_dids
  for select
  using (
    original_profile_id is not null
    and exists (
      select 1 from profiles p
      where p.id = original_profile_id
      and p.caretaker_id = auth.uid()
    )
  );

-- Allow profile members to view orphaned DIDs for their profile (transparency)
create policy orphaned_dids_read_members on orphaned_dids
  for select
  using (
    original_profile_id is not null
    and exists (
      select 1 from profile_members pm
      where pm.profile_id = original_profile_id
      and pm.user_id = auth.uid()
    )
  );

-- Allow system functions to access (backend service role bypass)
-- Note: Backend calls use service_role which bypasses RLS, so this is for future app-level access
