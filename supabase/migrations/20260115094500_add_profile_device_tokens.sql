-- Add device tokens for push notifications

create table if not exists profile_device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  locale text,
  metadata jsonb,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_profile_device_tokens_unique
  on profile_device_tokens(profile_id, expo_push_token);

alter table profile_device_tokens enable row level security;

create policy profile_device_tokens_read on profile_device_tokens
  for select
  using (
    exists (
      select 1 from profiles p
      where p.id = profile_id
        and (
          p.caretaker_id = auth.uid()
          or exists (
            select 1
            from profile_members pm
            where pm.profile_id = profile_id and pm.user_id = auth.uid()
          )
        )
    )
  );

create policy profile_device_tokens_manage on profile_device_tokens
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

create or replace function update_profile_device_tokens_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profile_device_tokens_set_updated_at
before update on profile_device_tokens
for each row execute function update_profile_device_tokens_updated_at();
