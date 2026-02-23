# Known Good Call Flow (Single Call UX)

Last verified: February 23, 2026 (production/TestFlight path)

## Goal

One incoming CallKit call only (no placeholder handoff), with reliable answer behavior when:

- app open
- app closed + phone unlocked
- app closed + phone locked

## Canonical Production Mode

Use Twilio-native incoming invite flow only.

- Do not run manual pre-dial backend VoIP push.
- Do not run custom frontend PushKit placeholder handoff path.

This mode produced stable repeated `sip=200` results in production testing.

## Required Environment Settings

### Backend (Render)

- `ENABLE_CALL_BRIDGE=true`
- `ENABLE_MANUAL_VOIP_PUSH=false`
- `TWILIO_PUSH_CREDENTIAL_SID_IOS` must be set

### Frontend Build Environment (EAS production)

- `EXPO_PUBLIC_ENABLE_CUSTOM_VOIP_PUSH=false`

Important: `EXPO_PUBLIC_*` values are compile-time. Changing this requires a new iOS build install.

## Required Runtime Signals

### Good backend signals

- Token issuance confirms Twilio push credential:
  - `[twilio-client] token issued ... hasPushCredentialSid=true`
- Bridge path active:
  - `Trusted caller bridged client=profile-...`
- Answered call completes on client leg:
  - final `Dial status ... sip=200`

### Config drift signals

- If you see:
  - `[VoIP] Sending: callSid=...`
  then manual backend VoIP push mode is active and this doc's flow is not in effect.

## Validation Matrix

Run each scenario with an actual answer action:

1. App open
2. App closed, phone unlocked
3. App closed, phone locked

Pass criteria for each:

- One incoming call UI only
- Answer connects call
- Active call UI appears
- Caller identity is shown correctly
- Backend final status for answered call is `sip=200`

## Build Order (iOS Release/TestFlight)

```bash
cd /Users/lex/Desktop/safecall
git pull

cd frontend
npm install
npx pod-install
```

Build and distribute with your standard TestFlight pipeline.

If backend code/config changed, redeploy latest `main` on Render before retesting.

## Notes

- Release testing is required for true cold-start behavior.
- JS logs are not enough for this path; use backend logs as source of truth.
- `DialCallSid=undefined` can still appear in status callbacks in this TwiML client-dial path; rely on final SIP outcome (`sip=200` vs failure codes).
