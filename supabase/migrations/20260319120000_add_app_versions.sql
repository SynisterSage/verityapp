create table if not exists public.app_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android')),
  latest_version text,
  min_supported_version text,
  soft_prompt_enabled boolean not null default true,
  hard_block_enabled boolean not null default false,
  update_message text,
  store_url text,
  updated_at timestamptz not null default now()
);

create unique index if not exists app_versions_platform_key
  on public.app_versions (platform);

alter table public.app_versions enable row level security;

create policy "read app versions"
  on public.app_versions
  for select
  using (true);

create or replace function public.app_versions_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_versions_updated_at on public.app_versions;
create trigger set_app_versions_updated_at
  before update on public.app_versions
  for each row execute function public.app_versions_set_updated_at();
