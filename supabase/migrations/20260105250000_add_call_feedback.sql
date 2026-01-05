-- Add feedback fields for call review

alter table calls
  add column if not exists feedback_status text,
  add column if not exists feedback_notes text,
  add column if not exists feedback_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists feedback_at timestamptz;

create index if not exists idx_calls_feedback_status on calls(feedback_status);
