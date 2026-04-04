# 02 - Rollout and Migration (No-Regression First)

Release target: `v1.0.4`

## Rollout Goal

Ship ingress-aware PSTN support without disrupting existing mobile production flow.

## Safety Contract

At any point, a single env/config change must return all traffic to legacy routing.

## Flags (Required)

## Global env flag (Render)

- `MULTI_ENDPOINT_ROUTING_V1=false` (default)

## Per-profile control

- `profiles.multi_endpoint_enabled=false` (default)

Effective activation condition:

- endpoint routing runs only when both are true

## Phase 1 - Data + Dual-Write (Behavior Unchanged)

1. Add endpoint schema and routing preference schema.
2. Keep existing profile fields untouched and active.
3. On profile create/update:
- write legacy fields as today
- also upsert endpoint records (dual-write)
4. If endpoint upsert fails:
- log error
- do not fail legacy save

Exit criteria:
- no profile save regressions
- endpoint data being created for new/updated profiles

## Phase 2 - Backend Routing Behind Flags

1. Implement loop guards first.
2. Implement ingress detection and endpoint resolver.
3. Implement endpoint route path with try/catch guard.
4. On any route-path error or ambiguity:
- immediately execute legacy route path

Exit criteria:
- forced-error test proves legacy fallback always works
- loop tests prove block behavior

## Phase 3 - Frontend Minimal Exposure

Frontend for `v1.0.4` should stay minimal:

1. Account screen:
- add optional landline/second PSTN input behind flag

2. Save behavior:
- continue sending legacy fields
- include endpoint payload only when flag is enabled

3. Compatibility:
- if endpoint payload not present from backend, app uses legacy shape silently

4. Keep onboarding logic simple:
- add landline field where needed
- do not add complex routing controls in UI

## Phase 4 - Pilot Enablement

1. Keep global flag off.
2. Enable `multi_endpoint_enabled` only for internal profile(s).
3. Run internal calls for multiple days.
4. Enable tiny facility cohort.

## Immediate Rollback Procedure

If P0/P1 routing issue appears:

1. Set `MULTI_ENDPOINT_ROUTING_V1=false`.
2. Confirm route mode in logs is legacy.
3. Keep endpoint data in DB; do not run destructive rollback.

## "No-Surprise" Deployment Order

1. Migrations
2. Dual-write
3. Loop guard code
4. Endpoint route code (still off)
5. Frontend flagged UI
6. Internal enablement
7. Facility pilot
