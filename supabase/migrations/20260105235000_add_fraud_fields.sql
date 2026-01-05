-- Add fraud detection + caller patterning fields

alter table calls
  add column if not exists caller_number text,
  add column if not exists caller_hash text,
  add column if not exists fraud_score integer,
  add column if not exists fraud_risk_level text,
  add column if not exists fraud_keywords text[],
  add column if not exists fraud_notes jsonb,
  add column if not exists fraud_alert_required boolean default false,
  add column if not exists fraud_alerted_at timestamptz;

create index if not exists idx_calls_caller_hash on calls(caller_hash);
