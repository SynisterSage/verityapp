# Verity Multi-Endpoint Routing Plan (Ingress-Aware, v1.0.4)

Target release: `v1.0.4`

This doc set defines a production-safe rollout for one Verity number with multiple destinations (mobile + landline + app), using **ingress-aware routing** as the default behavior.

Important scope note: this repository is `frontend`. Backend/Twilio webhook routing details below are implementation contracts for your Render API service, not existing files in this repo.

## What "Ingress-Aware" Means

- If call ingress came from mobile forwarding path, route back to mobile path.
- If call ingress came from landline forwarding path, route back to landline path.
- App remains monitoring/review layer and may receive notifications regardless of ingress.

This avoids confusing dual-ring behavior and matches facility expectations.

## Documents

1. [00-current-state.md](./00-current-state.md)
Current app assumptions and constraints from this codebase.

2. [01-architecture-and-flow.md](./01-architecture-and-flow.md)
Target ingress-aware behavior and user/facility call scenarios.

3. [02-rollout-and-migration.md](./02-rollout-and-migration.md)
Phased rollout, environment flags, per-profile enablement, and rollback path.

4. [03-risks-failures-and-tests.md](./03-risks-failures-and-tests.md)
Failure modes (looping, ANI rewrite, voicemail race), required guardrails, and test matrix.

5. [04-implementation-blueprint.md](./04-implementation-blueprint.md)
Build contract for backend webhook/routing logic, loop guards, fail-safe behavior, and logs.

6. [05-facility-pilot-runbook.md](./05-facility-pilot-runbook.md)
Pilot operations plan, success thresholds, stop/rollback triggers, and facility messaging.

7. [06-testing-plan.md](./06-testing-plan.md)
Step-by-step testing plan for flags-off regression, flags-on feature validation, and pilot go/no-go.

## Core Principles

- Keep legacy routing path intact and callable at all times.
- Add new routing as opt-in behind global + per-profile flags.
- Run hard loop guards before any endpoint dialing.
- On any uncertainty/error in new path, fail safe to legacy routing.
- Roll out by profile cohorts, not all users at once.
