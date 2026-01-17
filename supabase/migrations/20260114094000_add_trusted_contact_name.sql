alter table trusted_contacts
  add column contact_name text null;

alter table trusted_contacts
  alter column contact_name set default null;

comment on column trusted_contacts.contact_name is 'Optional canonical name for the trusted contact';
