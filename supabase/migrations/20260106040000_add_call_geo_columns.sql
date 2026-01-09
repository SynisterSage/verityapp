-- Add caller geography metadata to stored calls

alter table if exists calls
  add column if not exists caller_country text,
  add column if not exists caller_region text;

create index if not exists idx_calls_caller_country on calls(caller_country);
create index if not exists idx_calls_caller_region on calls(caller_region);
