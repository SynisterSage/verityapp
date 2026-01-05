# Fraud Detection Implementation Notes

Last updated: 2026-01-05

## What We Shipped

- **Voicemail-only fraud analysis** (runs after transcription is saved).
- **Fraud scoring engine** with:
  - Weighted keyword categories (banking, government, tech support, prize/lottery, donations/charities, payment apps/gift cards, urgency).
  - Combo boosts (e.g., donation + charity, verification code + bank).
  - Heuristics for secrecy/urgency/impersonation/OTP requests.
  - Negation handling (e.g., "did not give my SSN").
- **Caller patterning**: store `caller_hash` + 30-day history counts in `fraud_notes`.
- **Safe phrase dampening** (caretaker-approved phrases reduce score).
- **Alert queue** for future push notifications.
- **Optional auto-block** (feature-flagged) for high fraud callers.

## Backend Changes

- Fraud logic: `backend/src/services/fraud.ts`
- Recording pipeline integration: `backend/src/controllers/TwilioController.ts`
- Alerts API:
  - `GET /api/v1/alerts`
  - `PATCH /api/v1/alerts/:alertId`
  - Implemented in `backend/src/controllers/AlertsController.ts`

## Database Migrations

- `supabase/migrations/20260105235000_add_fraud_fields.sql`
  - Adds `fraud_*` fields + `caller_number` and `caller_hash` on `calls`
- `supabase/migrations/20260105240500_add_fraud_alerts_and_safe_phrases.sql`
  - Adds `alerts` table + `fraud_safe_phrases` table with RLS
- `supabase/migrations/20260105243000_add_blocked_callers.sql`
  - Adds `blocked_callers` table with RLS and `updated_at` trigger

## Feature Flags

In `backend/config/.env.development`:

```
FRAUD_SCORE_THRESHOLD=90
ENABLE_CALL_BLOCKING=false
```

## Notes on Flow

- **Fraud detection runs only on voicemail transcripts.**
- If a correct PIN bridges the call and no recording is made, no fraud analysis runs.
- Alerts are created when `fraud_score >= FRAUD_SCORE_THRESHOLD`.
- Auto-block only happens if `ENABLE_CALL_BLOCKING=true`.

## Quick Test Script

Example voicemail text to trigger a strong score:

```
Hi, this is the fraud department from your bank. We noticed suspicious activity.
Please verify your account and send a small payment through Zelle today.
Don’t tell anyone about this.
```

Check the `calls` row for:
- `fraud_score`
- `fraud_risk_level`
- `fraud_keywords`
- `fraud_notes`
- `fraud_alert_required`

Check the `alerts` table for a new `fraud` alert.
