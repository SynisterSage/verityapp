-- Trusted contacts per profile (allowlist)

create table if not exists trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  caller_hash text not null,
  caller_number text,
  source text not null default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint trusted_contacts_source_check check (source in ('manual', 'contacts'))
);

create unique index if not exists idx_trusted_contacts_profile_hash
  on trusted_contacts(profile_id, caller_hash);

alter table trusted_contacts enable row level security;

-- Caretaker + members can read; caretaker can manage
create policy trusted_contacts_read on trusted_contacts
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

create policy trusted_contacts_manage on trusted_contacts
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

create or replace function set_trusted_contacts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trusted_contacts_set_updated_at
before update on trusted_contacts
for each row execute function set_trusted_contacts_updated_at();
