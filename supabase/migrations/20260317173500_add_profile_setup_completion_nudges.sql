alter table profiles
  add column if not exists completed_safe_phrases boolean not null default false,
  add column if not exists completed_alert_prefs boolean not null default false,
  add column if not exists completed_test_call boolean not null default false,
  add column if not exists dismissed_nudge_cards text[] not null default '{}';
