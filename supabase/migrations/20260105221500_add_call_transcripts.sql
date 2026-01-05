-- Add transcription fields to calls

alter table calls
  add column if not exists transcript text,
  add column if not exists transcript_confidence real,
  add column if not exists transcribed_at timestamptz;
