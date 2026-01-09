-- Add detected locale from transcription to calls

alter table if exists calls
  add column if not exists detected_locale text;

create index if not exists idx_calls_detected_locale on calls(detected_locale);
