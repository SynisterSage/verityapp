# Verity v1.0.4 - Testing Guide

Release target: `v1.0.4`

## Overview

Two passes are required:

1. Regression with flags OFF
2. Feature validation with flags ON

Never skip regression pass.

Debug principle:
- every failure above should be diagnosable from logs within minutes
- if a failure is not diagnosable, logging is insufficient and rollout should pause

## Pass 1 - Regression (Flags OFF)

Goal: prove existing mobile flow is unchanged.

Setup:

- `MULTI_ENDPOINT_ROUTING_V1=false` on Render
- `multi_endpoint_enabled=false` on all profiles
- fresh TestFlight build installed

### Regression Test Checklist

1. Sign up
- Steps: create account, complete onboarding
- Expected: no new endpoint fields visible, flow completes normally

2. Sign in
- Steps: sign in with existing account
- Expected: profile loads normally, no endpoint-only UI visible

3. Forwarding setup
- Steps: follow current forwarding setup
- Expected: instructions unchanged from current product

4. Incoming call
- Steps: call Verity number from external phone
- Expected: app ring behavior matches current production

5. Answer call
- Steps: answer in app
- Expected: clean connection, normal audio

6. Decline call
- Steps: decline incoming call
- Expected: handled per current policy

7. Missed call
- Steps: let call ring unanswered
- Expected: missed-call handling and notifications match current behavior

8. Fallback behavior
- Steps: background app and place test call
- Expected: fallback number behavior unchanged (if configured)

9. Call log
- Steps: inspect calls history
- Expected: call records appear correctly

10. Transcript
- Steps: complete call and open transcript
- Expected: transcript appears correctly

11. Blocked caller behavior
- Steps: call from number that should be blocked
- Expected: blocked behavior unchanged, app notified

Pass criteria:
- every item above matches production behavior exactly
- any difference is regression and blocks pass 2

## Pass 2 - Feature Testing (Flags ON, Pilot Profile Only)

Goal: prove ingress-aware routing works and fails safe.

Setup (staging first, then production pilot profile):

- `MULTI_ENDPOINT_ROUTING_V1=true`
- `multi_endpoint_enabled=true` on your profile only
- mobile saved as `pstn_mobile`
- landline saved as `pstn_landline`
- mobile forwarding active to Verity number
- landline forwarding active (`*72 + Verity number`) to same Verity number

### 2A - Mobile Ingress Tests

1. Mobile ingress basic
- Steps: call mobile from external number
- Expected: forwards to Verity, screened, routes back to mobile path

2. Mobile ingress answer
- Steps: answer routed call
- Expected: clean connection

3. Mobile ingress missed
- Steps: let call go unanswered
- Expected: no-answer policy executes, app receives expected artifact

4. Mobile ingress blocked
- Steps: blocked/untrusted caller hits mobile path
- Expected: blocked behavior triggers, mobile does not ring

5. Mobile ingress transcript
- Steps: complete call through mobile ingress
- Expected: transcript available in app

### 2B - Landline Ingress Tests

1. Landline ingress basic
- Steps: call landline from external number
- Expected: forwards to Verity, screened, routes back to landline path only

2. Landline ingress answer
- Steps: answer on landline
- Expected: clean connection

3. Landline ingress missed
- Steps: do not answer landline
- Expected: no-answer policy executes, app still gets expected notification/review artifact

4. Landline ingress blocked
- Steps: blocked caller dials landline
- Expected: blocked behavior triggers, landline does not ring

5. Isolation checks
- Steps: call landline and verify mobile is silent
- Expected: mobile does not ring
- Steps: call mobile and verify landline is silent
- Expected: landline does not ring

### 2C - Loop Guard Tests

1. Direct ingress block
- Steps: call Verity from endpoint number that can cause bounce
- Expected: loop guard blocks and logs `loop_blocked`

2. Hop limit
- Steps: simulate >2 forwarding hops
- Expected: blocked at limit, logs `hop_limit_blocked`

3. Duplicate window
- Steps: replay same call signature rapidly (or equivalent duplicate scenario)
- Expected: second occurrence blocked, logs `duplicate_call_blocked`

### 2D - Failure and Fallback Tests

1. Forced routing error
- Steps: intentionally throw in ingress-aware path
- Expected: legacy routing takes over, call still works, log `endpoint_fallback_to_legacy`

2. Low-confidence ANI
- Steps: simulate carrier-rewritten caller identity
- Expected: `ani_confidence=low`, no unsafe auto-trust behavior

3. Empty destination set
- Steps: profile configuration leaves no valid post-filter endpoints
- Expected: controlled no-answer/fallback behavior, no crash

4. Flag off mid-run
- Steps: set `MULTI_ENDPOINT_ROUTING_V1=false` during testing
- Expected: subsequent calls route via legacy immediately

### 2E - Log Verification (Every Test Call)

Per call:

- `call_sid`
- `profile_id`
- `routing_mode` (`legacy`, `endpoint`, or `endpoint_fallback_to_legacy`)
- `ingress_type` (`mobile`, `landline`, `unknown`)
- `ingress_confidence`
- `ani_confidence`
- `loop_guard_result`

Per leg:

- `call_sid`
- `endpoint_type`
- masked destination (for example last 4 only)
- `status` (`attempted`, `answered`, `failed`, `cancelled`, `blocked`)
- `block_reason` when blocked

## Cost and Reliability Watch (Pilot Window)

Track during pass 2:

- call-leg count trend
- blocked-loop event count
- retry volume
- abnormal duration spikes

If any trend suggests loop/retry storm, disable global flag and investigate before continuing.

## Go / No-Go Before Facility Pilot

All must be true:

- pass 1 complete with zero regressions
- mobile ingress routes to mobile only
- landline ingress routes to landline only
- loop guard tests pass with expected logs
- forced failure cleanly falls back to legacy path
- missed landline calls still produce expected app artifact
- logs are complete and readable
- global flag off returns routing to legacy immediately

If any item is false: do not launch facility pilot.

## Rollback

If anything is off:

1. Set `MULTI_ENDPOINT_ROUTING_V1=false`
2. Place a validation call
3. Confirm logs show `routing_mode=legacy`
4. Keep endpoint data in DB (no destructive rollback)
5. Investigate and patch before re-enabling

## Fast Triage Map (Pilot Operations)

1. Forwarding metadata missing:
- symptom: forwarded fields null/blank
- action: check fallback ingress detection and `ingress_confidence`

2. Suspected loop:
- symptom: repeated call signature + rising leg attempts/cost
- action: identify which guard failed (ingress exclusion, hop limit, dedupe)

3. Wrong endpoint ringing:
- symptom: landline rings on mobile ingress (or inverse)
- action: inspect `ingress_type` and `ingress_confidence`, then patch carrier pattern logic

4. Duplicate webhook delivery:
- symptom: same `CallSid` appears twice
- action: verify second attempt was blocked by dedupe

5. Feature appears inactive:
- symptom: tests always show `routing_mode=legacy`
- action: verify both global flag and per-profile flag are enabled
