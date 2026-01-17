alter table trusted_contacts
  add column relationship_tag text null;

alter table trusted_contacts
  alter column relationship_tag set default null;

comment on column trusted_contacts.relationship_tag is 'Optional locally-managed relationship tag';
