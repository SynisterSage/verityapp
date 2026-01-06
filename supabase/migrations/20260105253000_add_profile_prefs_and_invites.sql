-- Profile alert preferences + member invites

alter table profiles
  add column if not exists alert_threshold_score integer default 90,
  add column if not exists enable_email_alerts boolean default true,
  add column if not exists enable_sms_alerts boolean default false,
  add column if not exists enable_push_alerts boolean default true;

create table if not exists profile_invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  email text not null,
  role text not null default 'viewer',
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz default now(),
  accepted_at timestamptz,
  constraint profile_invites_role_check check (role in ('admin', 'editor', 'viewer')),
  constraint profile_invites_status_check check (status in ('pending', 'accepted', 'expired'))
);

create unique index if not exists idx_profile_invites_profile_email
  on profile_invites(profile_id, email);

alter table profile_invites enable row level security;

-- Invites: caretaker can manage, members can read
create policy profile_invites_read on profile_invites
  for select
  using (
    exists (
      select 1
      from profiles p
      where p.id = profile_id
        and (p.caretaker_id = auth.uid()
          or exists (
            select 1
            from profile_members pm
            where pm.profile_id = profile_id and pm.user_id = auth.uid()
          ))
    )
  );

create policy profile_invites_manage on profile_invites
  for all
  using (
    exists (
      select 1
      from profiles p
      where p.id = profile_id and p.caretaker_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from profiles p
      where p.id = profile_id and p.caretaker_id = auth.uid()
    )
  );
