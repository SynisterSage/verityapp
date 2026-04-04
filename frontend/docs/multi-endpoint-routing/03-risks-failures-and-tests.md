# 03 - Risks, Failures, and Required Tests

Release target: `v1.0.4`

## Reality Check

You can minimize risk aggressively, but zero production issues is unrealistic with telecom/carrier variance.

Success means:

- no severe looping incidents
- no regression to current mobile behavior
- fast rollback if anomalies appear

## Critical Failure Modes

## 1) Looping (P0)

What happens:
- forwarded call re-enters Verity repeatedly

Impact:
- bad UX
- rapid Twilio cost burn

Required prevention:
1. ingress exclusion
2. hop limit
3. short-window duplicate detection

## 2) Wrong Ingress Classification (P1)

What happens:
- system thinks landline ingress was mobile ingress (or vice versa)

Impact:
- call rings wrong endpoint

Mitigation:
- confidence scoring for ingress source
- ambiguity => fail safe to legacy route or controlled fallback path

## 3) ANI Rewrite (P1)

What happens:
- carrier rewrites caller identity in forwarded chain

Impact:
- trust/scam automations can misclassify

Mitigation:
- set `ani_confidence=low`
- disable auto-trust behavior for low-confidence calls

## 4) Voicemail Race (P1 for facilities)

What happens:
- endpoint voicemail answers before intended user does

Impact:
- facility perceives behavior as unreliable

Mitigation:
- explicit no-answer policy in Verity routing
- tight ring timeout and fast loser-leg cancellation

## 5) Double Ring / Cancel Delay (P2)

What happens:
- two endpoints briefly ring even after one answers

Mitigation:
- immediate cancel on winner answer
- acceptable only if short and consistent

## 6) Cost Drift (P1)

What happens:
- call-leg count increases from retries/misroutes

Mitigation:
- cost and leg-count monitoring with alert thresholds

## Hard Loop Guards (Must Be Live Before Endpoint Routing)

1. Never dial ingress number back.
2. Never dial `twilio_virtual_number` as destination.
3. Block if hop count exceeds threshold.
4. Block repeated appearance of same call signature in short window.

## Required Structured Logs

Per call:
- `call_sid`
- `profile_id`
- `routing_mode`
- `ingress_detected`
- `ingress_confidence`
- `ani_confidence`
- `loop_guard_result`

Per leg:
- `call_sid`
- `endpoint_type`
- `masked_destination`
- `status` (`attempted`, `answered`, `failed`, `cancelled`, `blocked`)
- `block_reason`

## Must-Pass Test Matrix

1. Mobile ingress -> mobile return path.
2. Landline ingress -> landline return path.
3. Call from endpoint number -> guard block.
4. Forced routing exception -> legacy fallback path executes.
5. Low-confidence ANI path -> no auto-trust.
6. No-answer behavior -> deterministic and documented.
7. Duplicate/hop tests -> blocks fired and logged.

## Go / No-Go Criteria

No-go if any of the following are unresolved:

- loop event escaped guardrails
- legacy fallback fails in failure simulation
- ingress-aware route sends calls to wrong endpoint in repeatable way
- voicemail/no-answer behavior is inconsistent in pilot

## Operational Error Playbook (Top 6)

## Error 1 - Carrier strips forwarding metadata

Signal:
- `ForwardedFrom` (or equivalent) is null/blank for clearly forwarded calls.

Response:
1. Use fallback ingress chain:
- if `ForwardedFrom` missing, compare `From` against known profile endpoints.
2. If still ambiguous:
- set `ingress_confidence=low`
- fail safe to legacy route.

## Error 2 - Loop slips through

Signal:
- repeated webhook hits for same call signature
- sudden leg-count/cost spike.

Response:
1. Identify which guard missed:
- ingress exclusion, hop limit, or duplicate window.
2. Tighten the failed guard.
3. Add a regression test for that exact loop shape.

## Error 3 - Landline voicemail answers first

Signal:
- caller says voicemail was left, but artifact is on carrier voicemail not Verity flow.

Response:
1. Set Verity ring timeout below typical landline voicemail pickup window.
2. Route to no-answer handling before carrier voicemail wins.
3. Validate by carrier during pilot.

## Error 4 - Wrong endpoint rings

Signal:
- per-leg logs show landline leg on mobile-ingress call (or inverse).

Response:
1. Inspect `ingress_type` + `ingress_confidence` logs.
2. Patch ingress detection rules for that carrier/number pattern.
3. Re-test the exact scenario and keep regression test.

## Error 5 - Twilio webhook retries/duplicates

Signal:
- duplicate webhook attempts for same `CallSid`, often when response timing is slow.

Response:
1. `CallSid` dedupe check blocks second attempt from creating duplicate routing.
2. Confirm duplicate event logged as blocked/ignored.
3. Monitor webhook latency to reduce retries.

## Error 6 - Flag enabled but endpoint routing not running

Signal:
- expected endpoint test calls show `routing_mode=legacy`.

Response:
1. Verify both:
- global flag
- per-profile enablement.
2. Keep `routing_mode` logging mandatory on every call for immediate visibility.
