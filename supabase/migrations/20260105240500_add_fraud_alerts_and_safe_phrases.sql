-- Fraud alerts + safe phrases

create table if not exists fraud_safe_phrases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  phrase text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create unique index if not exists idx_safe_phrases_profile_phrase
  on fraud_safe_phrases(profile_id, phrase);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  call_id uuid references calls(id) on delete cascade,
  alert_type text not null,
  status text not null default 'pending',
  payload jsonb,
  created_at timestamptz default now()
);

create unique index if not exists idx_alerts_call_type
  on alerts(call_id, alert_type);

alter table fraud_safe_phrases enable row level security;
alter table alerts enable row level security;

-- Safe phrases: caretaker + members can read; caretaker can manage
create policy fraud_safe_phrases_read on fraud_safe_phrases
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

create policy fraud_safe_phrases_manage on fraud_safe_phrases
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

-- Alerts: caretaker + members can read
create policy alerts_read on alerts
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
