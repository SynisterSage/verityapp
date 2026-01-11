-- Align existing profiles schema with new Argon2 fields and lock-table security

-- Ensure pin_salt stores raw bytes so Argon2 can reuse it
alter table profiles
  alter column pin_salt type bytea using decode(pin_salt, 'hex');

-- Remove the legacy failure counter (locks now live in pin_attempts)
alter table profiles
  drop column if exists pin_failed_attempts;

-- Protect the attempt tracker with RLS so only the service role can query it
alter table pin_attempts enable row level security;

create policy pin_attempts_service_role on pin_attempts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
