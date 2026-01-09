-- Auto-mark and auto-trust preferences per profile

alter table profiles
  add column if not exists auto_mark_enabled boolean default false,
  add column if not exists auto_mark_fraud_threshold integer default 90,
  add column if not exists auto_mark_safe_threshold integer default 30,
  add column if not exists auto_trust_on_safe boolean default false,
  add column if not exists auto_block_on_fraud boolean default true;

-- Allow auto source for trusted contacts
alter table trusted_contacts
  drop constraint if exists trusted_contacts_source_check;

alter table trusted_contacts
  add constraint trusted_contacts_source_check
    check (source in ('manual', 'contacts', 'auto'));
