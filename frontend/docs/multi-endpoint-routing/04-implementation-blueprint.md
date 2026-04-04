# 04 - Implementation Blueprint (Ingress-Aware v1.0.4)

Release target: `v1.0.4`

This is the concrete implementation contract for backend webhook routing.

## V1 Behavioral Contract

1. Determine ingress source (mobile path or landline path).
2. Screen call as usual.
3. Route to ingress-matching endpoint path.
4. Keep app as monitoring/review layer unless explicitly configured otherwise.
5. If route logic errors or confidence is too low, fail safe to legacy routing.

## Required Flags

- Global env flag: `MULTI_ENDPOINT_ROUTING_V1`
- Per-profile flag: `multi_endpoint_enabled`

Routing path used only when both are true.

## Data Contract Additions

- `profile_endpoints` table
- `profile_routing_prefs` table
- per-profile opt-in flag

Mandatory constraints:

1. unique endpoint number per profile
2. normalized E.164 on write
3. endpoint cannot equal profile Verity number

## Ingress Detection Inputs

Use available Twilio webhook fields in this order of trust (implementation may vary):

1. explicit forwarded metadata if available
2. normalized `From`
3. fallback heuristics using `To`/known profile number mappings

Output:

- `ingress_type`: `mobile` | `landline` | `unknown`
- `ingress_confidence`: `high` | `medium` | `low`

Policy:

- if ingress confidence is low, do not execute risky endpoint route path without fallback safety.

## Loop Guard Algorithm (Mandatory Before Dial)

1. Build `ingressSet` from candidate ingress numbers + profile Verity number.
2. Remove all destinations matching anything in `ingressSet`.
3. Enforce hop limit guard.
4. Enforce short-window duplicate guard.
5. If blocked or destination set empty:
- return controlled hangup or legacy fallback path by policy

## Routing Function Contract

`routeIngressAware(profileId, callContext)` should:

1. never throw uncaught errors
2. return `{ twiml, mode: "endpoint" }` on success
3. return `null` on uncertainty/failure

Caller behavior:

- if `null`, run legacy route and log `endpoint_fallback_to_legacy`

## Legacy Fallback Requirement

Legacy route path must remain executable and unchanged in logic.

Use cases where fallback is required:

1. ingress classification low confidence
2. endpoint lookup failure
3. TwiML build failure
4. any runtime exception in new path

## Error Classes and Fix Paths

## Class A - Loop escaped

Action:
- disable global flag
- inspect guard logs
- patch guard condition and add regression test

## Class B - Wrong endpoint chosen

Action:
- inspect ingress classification logs
- improve carrier-specific detection rules
- temporarily fallback to legacy for affected cohort

## Class C - No-answer confusion

Action:
- tune timeout/no-answer policy
- verify voicemail interaction by carrier
- document expected behavior in support scripts

## Class D - Cost anomaly

Action:
- disable flag if rapid leg growth
- inspect retries/duplicates
- tighten dedupe and timeout limits

## Required Logs (Structured)

Per call:

- `call_sid`
- `profile_id`
- `routing_mode`
- `ingress_type`
- `ingress_confidence`
- `ani_confidence`
- `loop_guard_result`

Per leg:

- `call_sid`
- `endpoint_type`
- `masked_destination`
- `status`
- `block_reason`

## Frontend v1.0.4 Contract

Frontend changes remain intentionally minimal:

1. collect mobile + optional landline in onboarding/settings
2. account screen supports optional second PSTN field behind flag
3. preserve legacy payload fields
4. include endpoint payload only when flag/config enabled
5. no complex routing controls in UI for v1

## Definition of Done

1. loop guards active and tested
2. ingress-aware route working in staging
3. forced endpoint failure falls back to legacy route
4. logs complete and visible
5. pilot profile runs stable before facility expansion
