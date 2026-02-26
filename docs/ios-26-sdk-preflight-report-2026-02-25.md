# iOS 26 SDK Migration - Preflight Report

Date: 2026-02-25
Branch: chore/ios26-sdk-migration

## Current baseline
1. Local Xcode: 26.1 (Build 17B55)
2. Selected developer dir: /Applications/Xcode.app/Contents/Developer
3. macOS: 26.1
4. Repo state: clean except migration docs added in `docs/`

## Confirmed findings
1. App source is under `frontend/` within the `safecall` mono repo.
2. Build/archive scripts exist:
   - `ci_scripts/ci_post_clone.sh`
   - `frontend/ios/ci_scripts/ci_post_clone.sh`
3. Xcode Cloud previously showed workflow environment configured to Xcode 16.4 in screenshots. This must be changed to Xcode 26.x to meet Apple’s SDK requirement.

## Immediate blockers / risks
1. If workflow runs with Xcode 16.x, uploads can trigger ITMS-90725.
2. If build number is reused, ASC handoff can warn/fail even with successful archive/export.
3. StoreKit plan fetch can still fail if ASC product metadata propagation is incomplete, independent of SDK migration.

## Actions started
1. Created migration branch `chore/ios26-sdk-migration`.
2. Added master migration plan: `docs/ios-26-sdk-migration-plan-2026-02-25.md`.
3. Captured this preflight baseline report.

## Next execution steps
1. Update Xcode Cloud workflow to Xcode 26.x and rebuild.
2. Confirm resulting artifact is compiled with iOS 26 SDK.
3. Increment build number and upload fresh RC to avoid duplicate-build rejection.
4. Run full smoke matrix (VoIP, Live Activities, widgets, Siri, subscriptions).
