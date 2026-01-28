-- Add voice detection metadata to calls

alter table calls
  add column if not exists voice_synthetic_score real,
  add column if not exists voice_analysis jsonb,
  add column if not exists voice_detected_at timestamptz;

create index if not exists idx_calls_voice_synthetic_score on calls(voice_synthetic_score);
