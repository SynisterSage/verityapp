# 05 - Facility Pilot Runbook (Ingress-Aware)

Release target: `v1.0.4`

## Pilot Promise

"Same phone behavior residents already use, just protected."

- mobile calls come back to mobile path
- landline calls come back to landline path
- family/caregiver app remains monitoring and review layer

## Pilot Cohort Plan

1. Internal self-profile only.
2. Tiny facility cohort.
3. Expand only after stable multi-day run.

## Before Pilot Day

Must be true:

1. global flag exists and can be turned off instantly
2. per-profile enablement works
3. loop guards tested
4. legacy fallback tested under forced failure
5. log visibility is ready

## Pilot Test Script

1. Mobile ingress test
- call resident mobile
- verify screened and routed back to mobile

2. Landline ingress test
- call resident landline
- verify screened and routed back to landline

3. Missed-call/no-answer test
- do not answer landline
- verify expected no-answer handling
- verify app receives expected notification/review artifact

4. Guardrail test
- simulate call from endpoint number
- verify block and proper logging

5. Failure fallback test
- force endpoint route exception
- verify legacy route takes over

## What Facility Staff Should Be Told

"Residents keep using phones the same way. Calls are screened before they connect. Family can review missed, blocked, or suspicious calls in the app."

## Success Criteria

All required:

1. zero unresolved loop incidents
2. no mobile flow regression
3. ingress-aware path correct in repeated tests
4. predictable missed-call behavior
5. no abnormal Twilio leg-cost patterns

## Stop / Rollback Triggers

Immediately disable global flag if:

1. loop escapes guardrails
2. repeated wrong-endpoint routing
3. fallback path fails under real call
4. cost spike suggests bounce/retry issue

## Post-Pilot Decision

Proceed only when:

1. stability observed across multiple days
2. no P0/P1 open issues
3. facility feedback confirms behavior is intuitive
