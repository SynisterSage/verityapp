create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status text not null default 'active',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facilities_status_check check (status in ('active', 'inactive'))
);

create table if not exists facility_codes (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  code text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz,
  max_redemptions integer,
  redemption_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_codes_max_redemptions_check check (
    max_redemptions is null or max_redemptions >= 0
  ),
  constraint facility_codes_redemption_count_check check (redemption_count >= 0)
);

create table if not exists facility_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  facility_code_id uuid not null references facility_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  transaction_id text,
  original_transaction_id text,
  redeemed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists idx_facility_code_redemptions_unique_user_product
  on facility_code_redemptions (facility_code_id, user_id, product_id);

create index if not exists idx_facility_codes_lookup
  on facility_codes (code, is_active, expires_at);

create index if not exists idx_facility_code_redemptions_user
  on facility_code_redemptions (user_id, redeemed_at desc);

create or replace function set_facilities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_facilities_updated_at on facilities;
create trigger trg_facilities_updated_at
before update on facilities
for each row
execute function set_facilities_updated_at();

create or replace function set_facility_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_facility_codes_updated_at on facility_codes;
create trigger trg_facility_codes_updated_at
before update on facility_codes
for each row
execute function set_facility_codes_updated_at();

