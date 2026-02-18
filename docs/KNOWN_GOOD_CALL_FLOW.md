# Known Good Call Flow (Single Call UX)

Last verified: February 18, 2026

## Goal

One incoming CallKit call only (no placeholder handoff), with reliable answer behavior when:

- app open
- app closed + phone unlocked
- app closed + phone locked

## Required Environment Settings

### Backend (Render)

- `ENABLE_CALL_BRIDGE=true`
- `ENABLE_MANUAL_VOIP_PUSH=false` (or unset)

### Frontend Build Environment

- `EXPO_PUBLIC_ENABLE_CUSTOM_VOIP_PUSH=false` (or unset)

## Required Code State

- Twilio is the single incoming-call owner for production flow.
- Manual pre-dial VoIP push is disabled by default.
- `react-native-twilio-programmable-voice` iOS behavior is patched via `patch-package`.
- `postinstall` runs `patch-package` automatically.

## Build Order (iOS Release)

```bash
cd /Users/lex/Desktop/safecall
git pull

cd frontend
npm install
npx pod-install

# Release device build
npx expo run:ios --device --configuration Release
```

If you changed backend code, also redeploy latest `main` on Render.

## Expected Runtime Signals

### Good backend signals

- Trusted bridge log appears:
  - `Trusted caller bridged client=profile-...`
- Final dial status for answered call:
  - `sip=200`

### Bad signal

- `sip=487` after user answered (means the client leg did not connect in time).

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

## Notes

- Release testing is required for true cold-start behavior.
- JS console logs are limited in this path; use backend logs and device native logs for diagnosis.
