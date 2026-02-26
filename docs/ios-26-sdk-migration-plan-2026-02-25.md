# iOS 26 SDK Migration Plan (Xcode 26)

Date: 2026-02-25  
Owner: Verity Protect (solo dev)  
Scope: iOS app, widget extension, VoIP call flow, push, subscriptions, TestFlight/App Store delivery

## Why this migration is required
Apple warned build `1.0.0 (50)` was compiled with iOS 18.5 SDK. Starting **April 28, 2026**, App Store Connect uploads require builds compiled with **iOS 26 SDK or later** (Xcode 26+).

This is mainly a toolchain migration. Expected impact is build/dependency/signing adjustments, not a core product rewrite.

## Success criteria
1. App archives and exports cleanly with Xcode 26 toolchain.
2. TestFlight build from new toolchain installs and runs without regressions.
3. VoIP call flow works in all states (foreground/background/terminated/locked).
4. Widgets, Siri, Live Activities, subscription paywall, and deep links remain stable.
5. New build is deliverable to App Store Connect with no SDK-version warning.

## Non-goals
1. No feature redesign.
2. No deployment target raise unless forced by dependency breakage.
3. No backend architecture changes.

---

## Work split

### What Codex will do
1. Create/maintain a migration branch and keep commits scoped.
2. Apply build-system and iOS code compatibility fixes.
3. Update project-level settings/scripts needed for Xcode 26 compatibility.
4. Run compile/archive checks and provide precise test checklist.
5. Document every change and rollback path.

### What Lex will do
1. Confirm local Xcode 26 installation and selected CLI tools.
2. Maintain Apple portal assets (certs/profiles/capabilities) if signing issues appear.
3. Run real-device smoke tests (especially VoIP + push + subscription).
4. Validate TestFlight behavior and approve release candidate.

---

## Phase plan

## Phase 0 - Preflight and freeze
1. Branch: `chore/ios26-sdk-migration`.
2. Freeze unrelated feature merges.
3. Snapshot current stable state:
   - last known-good build numbers
   - provisioning/cert profile names
   - current environment vars (frontend/backend)
4. Keep rollback checkpoint commit.

## Phase 1 - Toolchain alignment
1. Local:
   - Ensure Xcode 26.x installed.
   - Set active CLT to Xcode 26 (`xcode-select`).
2. CI:
   - Pin workflow to Xcode 26.x.
   - Keep deterministic archive/export settings.
3. Verify generated binary metadata reflects iOS 26 SDK.

## Phase 2 - Dependency and build-system compatibility
1. Refresh pods and lockfile as required by Xcode 26.
2. Resolve pod or module-map mismatches.
3. Resolve stricter Swift compiler issues (types/deprecations).
4. Keep changes minimal and explicit; no behavior changes unless necessary.

## Phase 3 - Signing and entitlement integrity
Validate app + widget targets still match required capabilities:
1. Push Notifications
2. App Groups
3. Sign in with Apple
4. Background modes/VoIP requirements
5. Widget extension signing

Check profile mapping for:
1. Main app: Development, Ad Hoc, App Store
2. Widget: Development, Ad Hoc, App Store

## Phase 4 - Functional regression pass (must pass)

### Core app
1. Auth flows (sign in, sign out, password reset, email confirm callback).
2. Membership/paywall load, plan fetch, purchase/restore paths.
3. Main navigation and no blank-screen transitions.

### Calls and alerts
1. Calls list + call details load consistency.
2. Alerts routing and deep links (including critical notification paths).
3. Active call stale-mount prevention after ended calls.

### VoIP and callkit
Test all four states:
1. App foreground
2. App background
3. App terminated
4. Phone locked

For each state verify:
1. Incoming call presentation timing
2. Accept/decline behavior
3. End-call synchronization
4. No orphaned ringing UI

### Live Activities
1. Starts on active/ringing state correctly.
2. Ends immediately when call ends or times out.
3. No stale activities after app resume.

### Widgets / Siri
1. Widget data consistency and theme rendering.
2. Siri shortcut invocation and routing variants.

## Phase 5 - Release candidate and submission
1. Build RC with Xcode 26.
2. Upload to TestFlight.
3. Execute smoke checklist on physical device.
4. If pass, tag as submission candidate.

---

## High-risk areas and likely issues
1. **Pods/SPM incompatibility**
   - Symptom: module map missing, pod install parser issues, archive fail.
   - Mitigation: clean install + lockfile alignment + targeted dependency bumps.
2. **Signing drift across app/widget**
   - Symptom: export code 70, capability mismatch errors.
   - Mitigation: verify all six profiles + target entitlements + automatic/manual consistency.
3. **StoreKit product fetch intermittency**
   - Symptom: `Could not load app store plans`.
   - Mitigation: keep sync/retry logic; ensure products are attached to app version and propagated.
4. **VoIP token environment mismatch**
   - Symptom: APNs rejects token, missing incoming screen.
   - Mitigation: verify production APNs credentials + token freshness + backend env alignment.
5. **CI export warnings/no upload**
   - Symptom: archive/export pass but ASC handoff warns/fails.
   - Mitigation: bump build number, rerun handoff, fallback to artifact upload if needed.

---

## Risk controls
1. Keep migration in isolated branch.
2. Use small commits by category:
   - `toolchain/ci`
   - `deps/build`
   - `swift compatibility`
   - `signing fixes`
3. Run focused verification after each category.
4. Do not mix feature work into migration commits.

---

## Rollback strategy
1. If critical breakage appears, hard stop migration branch.
2. Revert to last known-good TestFlight deliverable branch.
3. Re-apply fixes one category at a time from clean branch.

---

## Checklist for migration night

## Before coding
1. Confirm Xcode 26 selected locally.
2. Confirm CI workflow pinned to Xcode 26.
3. Confirm branch created and clean.

## During migration
1. Resolve compile errors first.
2. Resolve archive/export/signing second.
3. Run targeted regression matrix third.

## Before upload
1. Increment build number.
2. Verify SDK/toolchain metadata.
3. Upload RC and run physical-device smoke tests.

## Sign-off gate
Only promote the build if all pass:
1. VoIP all states
2. Live Activities sync
3. Push deep links
4. Paywall plan load + restore
5. Widgets + Siri

---

## Notes on deployment target and older devices
Building with iOS 26 SDK does **not** force dropping older iPhones. Older support remains controlled by deployment target (unless a dependency forces a bump). We will preserve current minimum iOS support unless technically blocked.

---

## Immediate next action
1. Execute Phase 0 + Phase 1 tonight.
2. If compile/archive succeeds, move directly into Phase 4 VoIP+subscription smoke matrix.
3. Prepare first Xcode 26 TestFlight RC before cutoff pressure window.
