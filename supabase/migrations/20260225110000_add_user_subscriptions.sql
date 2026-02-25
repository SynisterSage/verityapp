-- Stores per-user App Store subscription verification state.
-- Owners require an active membership; invited members can still access shared circles.

create table if not exists user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  platform text not null default 'ios',
  source text not null default 'app_store',
  status text not null default 'inactive',
  is_active boolean not null default false,
  product_id text,
  transaction_id text,
  original_transaction_id text,
  purchased_at timestamptz,
  expires_at timestamptz,
  verification_environment text,
  latest_receipt_status integer,
  latest_receipt_data text,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_status_check check (
    status in ('active', 'inactive', 'expired', 'cancelled', 'billing_retry', 'unknown')
  )
);

create index if not exists idx_user_subscriptions_active
  on user_subscriptions (is_active, expires_at desc nulls last);

create or replace function set_user_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_subscriptions_updated_at on user_subscriptions;

create trigger trg_user_subscriptions_updated_at
before update on user_subscriptions
for each row
execute function set_user_subscriptions_updated_at();

alter table user_subscriptions enable row level security;

drop policy if exists user_subscriptions_select_own on user_subscriptions;
create policy user_subscriptions_select_own
  on user_subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists user_subscriptions_insert_own on user_subscriptions;
create policy user_subscriptions_insert_own
  on user_subscriptions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists user_subscriptions_update_own on user_subscriptions;
create policy user_subscriptions_update_own
  on user_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
