-- Stores de-duplicated trial reminder deliveries per user.

create table if not exists trial_nudge_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nudge_key text not null,
  profile_id uuid references profiles(id) on delete set null,
  channel text not null default 'push',
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_nudge_events_channel_check check (channel in ('push', 'in_app'))
);

create unique index if not exists idx_trial_nudge_events_user_key_channel
  on trial_nudge_events (user_id, nudge_key, channel);

create index if not exists idx_trial_nudge_events_sent_at
  on trial_nudge_events (sent_at desc);

create or replace function set_trial_nudge_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trial_nudge_events_updated_at on trial_nudge_events;

create trigger trg_trial_nudge_events_updated_at
before update on trial_nudge_events
for each row
execute function set_trial_nudge_events_updated_at();

alter table trial_nudge_events enable row level security;

drop policy if exists trial_nudge_events_select_own on trial_nudge_events;
create policy trial_nudge_events_select_own
  on trial_nudge_events
  for select
  using (auth.uid() = user_id);
