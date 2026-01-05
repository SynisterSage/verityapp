-- Block callers per profile (fraud auto-block)

create table if not exists blocked_callers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  caller_hash text not null,
  caller_number text,
  reason text,
  blocked_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_blocked_callers_profile_hash
  on blocked_callers(profile_id, caller_hash);

alter table blocked_callers enable row level security;

-- Caretaker + members can read; caretaker can manage
create policy blocked_callers_read on blocked_callers
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

create policy blocked_callers_manage on blocked_callers
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

-- Keep updated_at fresh
create or replace function set_blocked_callers_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger blocked_callers_set_updated_at
before update on blocked_callers
for each row execute function set_blocked_callers_updated_at();
