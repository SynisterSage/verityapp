-- Initial schema for call recordings + access control

create extension if not exists "pgcrypto";

-- Profiles (elderly people being protected)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  caretaker_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone_number text,
  twilio_virtual_number text,
  created_at timestamptz default now()
);

create index if not exists idx_profiles_caretaker_id on profiles(caretaker_id);

-- Profile members that can access a profile (caretakers, family, etc.)
create table if not exists profile_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz default now(),
  constraint family_role_check check (role in ('admin', 'editor', 'viewer'))
);

create unique index if not exists idx_profile_members_profile_user
  on profile_members(profile_id, user_id);

-- Calls + recording metadata
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  call_sid text unique,
  recording_sid text unique,
  recording_url text,
  recording_status text,
  recording_duration_seconds integer,
  storage_path text,
  created_at timestamptz default now()
);

create index if not exists idx_calls_profile_id on calls(profile_id);
create index if not exists idx_calls_created_at on calls(created_at desc);

-- RLS
alter table profiles enable row level security;
alter table profile_members enable row level security;
alter table calls enable row level security;

-- Profiles: caretaker + members can read
create policy profiles_read on profiles
  for select
  using (
    caretaker_id = auth.uid()
    or exists (
      select 1
      from profile_members pm
      where pm.profile_id = id and pm.user_id = auth.uid()
    )
  );

-- Profiles: caretaker can insert/update
create policy profiles_insert on profiles
  for insert
  with check (caretaker_id = auth.uid());

create policy profiles_update on profiles
  for update
  using (caretaker_id = auth.uid());

-- Profile members: caretaker can manage, members can read their rows
create policy profile_members_read on profile_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = profile_id and p.caretaker_id = auth.uid()
    )
  );

create policy profile_members_manage on profile_members
  for all
  using (
    exists (
      select 1 from profiles p
      where p.id = profile_id and p.caretaker_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = profile_id and p.caretaker_id = auth.uid()
    )
  );

-- Calls: caretaker + members can read
create policy calls_read on calls
  for select
  using (
    exists (
      select 1 from profiles p
      where p.id = profile_id and p.caretaker_id = auth.uid()
    )
    or exists (
      select 1 from profile_members pm
      where pm.profile_id = profile_id and pm.user_id = auth.uid()
    )
  );

-- Storage bucket + policies (private recordings)
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', false)
on conflict (id) do nothing;

create policy recordings_read on storage.objects
  for select
  using (
    bucket_id = 'call-recordings'
    and auth.uid() in (
      select caretaker_id
      from profiles
      where id = (split_part(name, '/', 2))::uuid
      union
      select user_id
      from profile_members
      where profile_id = (split_part(name, '/', 2))::uuid
    )
  );
