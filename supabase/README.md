# Supabase Migrations

This folder tracks database migrations applied to Supabase.

## How to apply
Option A (Supabase CLI):
1. `supabase login`
2. `supabase link --project-ref <project-ref>`
3. `supabase db push`

Option B (SQL editor):
1. Open Supabase dashboard → SQL Editor
2. Paste the migration SQL and run it

## Recording storage path convention
Store recordings in the `call-recordings` bucket using:

```
profiles/{profile_id}/calls/{call_id}.wav
```

The storage policy reads the `{profile_id}` from the path to allow access for
caretakers and family members.
