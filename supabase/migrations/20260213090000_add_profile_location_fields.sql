alter table profiles
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text;

comment on column profiles.address is 'Optional mailing address for the profile';
comment on column profiles.city is 'City for the profile used in lookups';
comment on column profiles.state is 'State abbreviation for the profile';
comment on column profiles.zip_code is 'ZIP code for the profile used to scope lookups';
