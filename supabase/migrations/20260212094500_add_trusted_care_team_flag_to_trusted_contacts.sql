alter table trusted_contacts
  add column if not exists trusted_care_team boolean not null default false;

comment on column trusted_contacts.trusted_care_team is 'Marks entries that should appear in the Trusted Care Team module.';
