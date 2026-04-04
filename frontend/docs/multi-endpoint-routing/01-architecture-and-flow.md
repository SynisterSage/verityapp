# 01 - Architecture and Call Flow (Ingress-Aware Default)

Release target: `v1.0.4`

## Product Behavior

One Verity number per profile. Optional endpoints behind it:

- mobile PSTN endpoint
- landline PSTN endpoint
- app endpoint (for monitoring/caregiver workflows)

Ingress-aware rule:

- call that came from mobile forwarding path routes back to mobile path
- call that came from landline forwarding path routes back to landline path

This preserves "same phone behavior users are used to, just protected."

## User Journey (Facility-Friendly)

1. Caregiver sets up account.
2. Adds resident mobile and/or landline.
3. Forwards each line to the same Verity number.
4. Resident keeps using their phone(s) normally.
5. Family/caregiver uses app for alerts, transcripts, and review.

## Canonical Call Scenarios

## Scenario A - Caller dials resident mobile

1. Mobile forwards to Verity number.
2. Verity screens.
3. If passed, Verity routes back to mobile path (ingress-aware).
4. If unanswered, no-answer policy executes.
5. App notification/review still occurs per policy.

## Scenario B - Caller dials resident landline

1. Landline forwards to Verity number.
2. Verity screens.
3. If passed, Verity routes back to landline path (ingress-aware).
4. If unanswered, no-answer policy executes.
5. App can still receive missed/flagged call artifacts.

## Scenario C - Only one endpoint configured

- If only mobile exists, mobile behaves as current flow.
- If only landline exists, landline behaves as protected line.

## Routing Policy for v1.0.4

- Default: ingress-aware single-target return.
- No default simultaneous dual PSTN ring.
- App endpoint remains notification/monitoring layer unless explicitly enabled for live ring behavior.

## Why This Over Simultaneous

1. Matches resident/facility expectations.
2. Reduces "why are both phones ringing" confusion.
3. Reduces voicemail race complaints.
4. Keeps mobile flow closest to current behavior.

## Caveat (Real-World)

Carrier forwarding metadata is not fully uniform.

Implication:
- ingress detection can occasionally be ambiguous
- system must fail safe when ambiguity is high

Mitigation details are defined in `03` and `04` docs.
