# Release Phase Plan (Post Build 32)

Date drafted: 2026-02-23
Current status: build `1.0.0 (32)` uploaded and showing good call-flow logs.

## Phase 1 - Production Smoke Test (Gate)

Objective:
- Confirm call flow and critical navigation/routing are stable on TestFlight build `#32`.

Tasks:
- Run `docs/testflight-smoke-test-build-32.md` fully.
- Capture backend log snippets for each call scenario.
- Record pass/fail and defects.

Exit criteria:
- All core call-flow scenarios pass.
- No blocking regressions in push routing/call UX.

## Phase 2 - Live Call Activity + Widget Follow-up

Objective:
- Final polish and reliability pass on lock-screen/live activity/widget behavior.

Tasks:
- Validate live activity lifecycle (start/update/end) across call states.
- Validate widget consistency (small/medium/large variants, light/dark, truncation, spacing).
- Fix any residual UI hierarchy/layout issues discovered during smoke tests.

Exit criteria:
- Live activity and widgets are visually consistent and stable.
- No stale state or broken routing from widget/live activity entry points.

## Phase 3 - App Store Distribution Setup

Objective:
- Prepare App Store Connect assets and metadata for submission readiness.

Tasks:
- Create/export required screenshot sets.
- Finalize app metadata and store copy.
- Confirm privacy/tracking/encryption answers.
- Validate TestFlight internal group coverage and tester notes.

Exit criteria:
- App Store listing assets and metadata are complete.
- Ready for final submission workflow.

## Phase 4 - Submission Readiness Review

Objective:
- Final go/no-go decision and submission package lock.

Tasks:
- Review open bugs and classify blockers/non-blockers.
- Reconfirm backend env + mobile build config parity.
- Freeze release branch and submit.

Exit criteria:
- Submission approved and pushed.
- Post-submit monitoring checklist ready.

## Notes

- Keep production call mode locked to known-good path documented in `docs/KNOWN_GOOD_CALL_FLOW.md`.
- Do not toggle back to manual/custom VoIP path during this release cycle unless a new controlled test plan is created.
