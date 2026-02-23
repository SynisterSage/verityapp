# TestFlight Smoke Test - Build 32

Date target: 2026-02-24
Build under test: `1.0.0 (32)`
Goal: confirm production stability before App Store distribution prep.

## Preconditions

- TestFlight build `#32` installed on primary test device.
- Backend deployed with:
  - `ENABLE_CALL_BRIDGE=true`
  - `ENABLE_MANUAL_VOIP_PUSH=false`
- EAS production env used for build includes:
  - `EXPO_PUBLIC_ENABLE_CUSTOM_VOIP_PUSH=false`
- Twilio push credential configured and valid.

## Core call-flow matrix

- [ ] App open: trusted call arrives, answer succeeds, call stays connected.
- [ ] App backgrounded: trusted call arrives, answer succeeds.
- [ ] App force-closed + phone unlocked: trusted call arrives, answer succeeds.
- [ ] App force-closed + phone locked: trusted call arrives, answer succeeds.

Pass signals (backend logs):
- [ ] `Trusted caller bridged client=profile-...`
- [ ] `hasPushCredentialSid=true` on token issue
- [ ] final dial status `sip=200`

Fail signals:
- [ ] `sip=487`, `sip=600`, or repeated no-answer outcomes
- [ ] user answers but caller still hears ringing
- [ ] no call UI shown in closed/locked scenario

## UX sanity checks

- [ ] Single-call UX (no duplicate/stacked incoming call UI).
- [ ] Caller identity appears correctly in incoming call UI.
- [ ] Active call screen transitions cleanly after answer.
- [ ] End-call behavior syncs on both ends.

## Alerts and routing checks

- [ ] Fraud/risk push opens expected destination.
- [ ] Trusted activity push/content copy looks correct.
- [ ] Support reply push (if triggered) routes to support portal list.

## Widgets and Live Activities quick sanity

- [ ] Existing widgets render correctly after app relaunch/device lock.
- [ ] Live call activity appears/updates during active call session.
- [ ] No stale activity remains after call end.

## Sign-off

- [ ] Smoke test passed.
- [ ] Ready to start App Store distribution prep.
- [ ] Any issues logged with timestamp + backend log snippet.
