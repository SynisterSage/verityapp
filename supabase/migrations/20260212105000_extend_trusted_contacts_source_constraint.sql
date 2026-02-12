alter table trusted_contacts
  drop constraint if exists trusted_contacts_source_check;

alter table trusted_contacts
  add constraint trusted_contacts_source_check
    check (source in ('manual', 'contacts', 'auto', 'professional_lookup', 'quick_action'));

comment on constraint trusted_contacts_source_check on trusted_contacts is 'Restricts the source tag for trusted contacts.';

alter table trusted_contacts
  add column if not exists professional_lookup_place_id text;

comment on column trusted_contacts.professional_lookup_place_id is 'Origin place identifier used when adding professionals from the lookup search.';
