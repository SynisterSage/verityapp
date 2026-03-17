alter table facilities enable row level security;
alter table facility_codes enable row level security;
alter table facility_code_redemptions enable row level security;

drop policy if exists facilities_service_role on facilities;
create policy facilities_service_role on facilities
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists facility_codes_service_role on facility_codes;
create policy facility_codes_service_role on facility_codes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists facility_code_redemptions_service_role on facility_code_redemptions;
create policy facility_code_redemptions_service_role on facility_code_redemptions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists facility_code_redemptions_select_own on facility_code_redemptions;
create policy facility_code_redemptions_select_own on facility_code_redemptions
  for select
  using (auth.uid() = user_id);
