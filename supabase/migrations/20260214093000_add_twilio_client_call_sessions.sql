create table if not exists twilio_client_call_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  call_sid text not null,
  call_uuid text,
  direction text not null default 'incoming'
    check (direction in ('incoming', 'outgoing')),
  from_number text,
  to_number text,
  to_client_identity text,
  state text not null
    check (
      state in (
        'ringing',
        'connecting',
        'connected',
        'reconnecting',
        'disconnected',
        'failed',
        'ended'
      )
    ),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, call_sid)
);

create index if not exists idx_twilio_client_call_sessions_profile_last_event
  on twilio_client_call_sessions(profile_id, last_event_at desc);

create index if not exists idx_twilio_client_call_sessions_profile_state
  on twilio_client_call_sessions(profile_id, state, last_event_at desc);

create or replace function set_twilio_client_call_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_twilio_client_call_sessions_updated_at on twilio_client_call_sessions;

create trigger trg_twilio_client_call_sessions_updated_at
before update on twilio_client_call_sessions
for each row
execute function set_twilio_client_call_sessions_updated_at();

alter table twilio_client_call_sessions enable row level security;

create policy twilio_client_call_sessions_read on twilio_client_call_sessions
for select
using (
  exists (
    select 1
    from profiles p
    where p.id = profile_id
      and (
        p.caretaker_id = auth.uid()
        or exists (
          select 1
          from profile_members pm
          where pm.profile_id = profile_id
            and pm.user_id = auth.uid()
        )
      )
  )
);
