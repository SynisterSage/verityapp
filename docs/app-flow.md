# App Flow (MVP)

Primary onboarding persona: **caregiver/family member**  
Default protection: **PIN-gated**  
Auth: **Google signup + email/password**

## Onboarding Flow (Caregiver-First)

1) **Sign Up / Sign In**
   - Options: Google signup, email + password
   - After auth, land on onboarding

2) **Create Elder Profile**
   - Fields: name, phone number, timezone
   - Assign caretaker (current user)

3) **Set Passcode (PIN)**
   - Default: required
   - Show PIN on screen (no SMS for MVP)
   - Option to regenerate or edit

4) **Safe Phrases**
   - User enters custom safe phrases (free-text)
   - No defaults

5) **Invite Family Members**
   - Email invite
   - Full permissions (view, mark safe/fraud, manage safe phrases, block/unblock)

6) **Alert Preferences**
   - MVP: email alerts for critical
   - Push notifications later (alert queue already exists)

7) **Test Call (Recommended)**
   - Default: test the flow by calling the **Twilio number**
   - Purpose: confirm PIN + voicemail + transcript + fraud scoring
   - Skippable

---

## Core App Screens

### 1) Dashboard / Calls List
- Shows recent calls
- Fraud badge: low / medium / high / critical
- Quick actions: mark safe / mark fraud

### 2) Call Detail
- Transcript
- Fraud reasons (keywords + notes)
- Recording playback (signed URL)
- Feedback status (marked safe/fraud)

### 3) Alerts
- List of pending alerts
- Actions: acknowledge / resolve

### 4) Safe Phrases
- Manage safe phrases

### 5) Blocklist
- List blocked callers
- Add/remove block

### 6) Family Members
- Manage invites / permissions

---

## API Endpoints (MVP)

Profiles:
- `GET /api/v1/profiles`
- `POST /api/v1/profiles`
- `POST /api/v1/profiles/:profileId/passcode`
- `PATCH /api/v1/profiles/:profileId/alerts`
- `GET /api/v1/profiles/:profileId/invites`
- `POST /api/v1/profiles/:profileId/invites`

Calls:
- `GET /api/v1/calls/:callId/recording-url`
- `PATCH /api/v1/calls/:callId/feedback`

Alerts:
- `GET /api/v1/alerts?profileId=...&status=pending&limit=50`
- `PATCH /api/v1/alerts/:alertId` (status: pending | acknowledged | resolved)

Fraud Settings:
- `GET /api/v1/fraud/safe-phrases?profileId=...`
- `POST /api/v1/fraud/safe-phrases`
- `DELETE /api/v1/fraud/safe-phrases/:phraseId`
- `GET /api/v1/fraud/blocked-callers?profileId=...`
- `POST /api/v1/fraud/blocked-callers`
- `DELETE /api/v1/fraud/blocked-callers/:blockId`

---

## Data Model Touchpoints

- `profiles`: elder profile + caretaker
- `profile_members`: family members with full permissions
- `calls`: recordings, transcript, fraud score, feedback
- `alerts`: queued fraud alerts (for push/email later)
- `fraud_safe_phrases`: caregiver-defined phrases
- `blocked_callers`: caller blocklist

---

## Notes

- Fraud detection runs on **voicemail transcripts** only.
- Bridged calls are not analyzed unless recording is enabled later.
- PIN is required by default for production safety.

---

## Quick Test Steps

1) Sign in (Google or email/password).
2) Complete onboarding:
   - Create profile
   - Set 6‑digit passcode
   - Add a safe phrase (optional)
   - Invite a family member (optional)
   - Review alert preferences
3) Place a test call to the Twilio number.
4) Leave a voicemail and confirm:
   - Call row created in `calls`
   - Transcript populated
   - Fraud score + alert row (if over threshold)
