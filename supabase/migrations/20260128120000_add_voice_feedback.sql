-- Track voice-feedback hints from trusted contacts.
alter table calls
  add column if not exists voice_feedback text;
