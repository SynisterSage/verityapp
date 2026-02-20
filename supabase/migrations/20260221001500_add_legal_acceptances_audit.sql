-- Audit log of Terms of Service and Privacy Policy acceptance by authenticated users.

create table if not exists legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'mobile_signup',
  ip_address text null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_legal_acceptances_user_version
  on legal_acceptances(user_id, terms_version, privacy_version);

create index if not exists idx_legal_acceptances_user_id
  on legal_acceptances(user_id);

alter table legal_acceptances enable row level security;

drop policy if exists legal_acceptances_read_own on legal_acceptances;
create policy legal_acceptances_read_own
  on legal_acceptances
  for select
  using (user_id = auth.uid());

drop policy if exists legal_acceptances_insert_own on legal_acceptances;
create policy legal_acceptances_insert_own
  on legal_acceptances
  for insert
  with check (user_id = auth.uid());
