# Live Activities (v1.1.0) Production Deployment Checklist

## Pre-Deployment Verification

### Code Quality
- [x] Permission gating implemented in `buildLiveActivityPayload()`
- [x] All `buildLiveActivityPayload()` calls guarded with null checks
- [x] Sentry logging added for permission denials and errors
- [x] Race condition fixed in `clearActiveCall()` with proper timer cleanup
- [x] `formatPhoneNumber()` enhanced to handle 7-digit landlines
- [x] JSDoc documentation added explaining permission logic
- [x] TypeScript compilation: zero errors
- [x] ESLint: clean
- [x] No console.warn calls (replaced with `logEvent()`)

### Testing Completed
- [ ] Owner role: Receives live activities on all incoming calls
- [ ] Owner role: Live activities persist during app backgrounding
- [ ] Manager/caretaker: No live activities visible (permission denied)
- [ ] Family member: No live activities visible (permission denied)
- [ ] All phone number formats tested (7-digit, 10-digit, international)
- [ ] Trusted contact badge displays correctly
- [ ] Call timer runs accurately
- [ ] Dynamic Island displays all views (expanded, compact, minimal)
- [ ] Edge cases tested (rapid calls, hangup preview, rejection)
- [ ] No crashes in role switching scenarios

### Native Build & Testing
- [ ] iOS TestFlight build: v1.1.0 build 4
- [ ] App launches without errors
- [ ] Call functionality works for all users
- [ ] No iOS build warnings related to ActivityKit
- [ ] Deployment target: iOS 15.1 (Live Activity iOS 16.1+ gracefully skipped)

### Backend & Infrastructure
- [ ] Sentry configured for new event types:
  - `LIVE_ACTIVITY_PERMISSION_DENIED`
  - `LIVE_ACTIVITY_INVALID_PROFILE`
  - `LIVE_ACTIVITY_START_ERROR`
  - `LIVE_ACTIVITY_UPDATE_ERROR`
  - `LIVE_ACTIVITY_END_ERROR`
  - `LIVE_ACTIVITY_END_PREVIEW_ERROR`
- [ ] Sentry alerts configured for error spikes
- [ ] Analytics dashboard updated to track feature usage
- [ ] No database schema changes required (all client-side)
- [ ] CDN/caching not impacted (native module)

## Deployment Steps

### Step 1: Release Candidate Build
```bash
# Increment build number
# frontend/ios/VerityProtect.xcodeproj: CURRENT_PROJECT_VERSION = 5

# Create TestFlight build
eas build --platform ios --auto-submit

# Wait for TestFlight processing
# Time estimate: 15-30 minutes
```

### Step 2: QA Sign-Off
- [ ] Internal QA team tests on iPhone 14 Pro (Dynamic Island present)
- [ ] Internal QA tests on iPhone 13 (Dynamic Island not present)
- [ ] Internal QA tests on iPhone SE (no notch, iOS 15.x fallback)
- [ ] Each role tested (owner, manager, family member)
- [ ] Sentry integration verified
- [ ] Production-like environment confirmed

### Step 3: Documentation Updates
- [ ] [docs/live-activities-testing-guide.md](live-activities-testing-guide.md) published to team wiki
- [ ] Release notes updated: "Lock screen call widgets now available on iOS 16.1+"
- [ ] FAQ updated: "Why don't family members see live activities?"
- [ ] Support documentation: "Live Activities permission explained"
- [ ] Designer collaboration: Design assets for lock screen widget documented

### Step 4: Support Team Briefing
- [ ] Support team trained on Live Activities feature
- [ ] Common troubleshooting guide created:
  - Widget not appearing: Check iOS version (16.1+)
  - Widget not appearing: Check user role (must be owner/manager)
  - Widget not updating: Force-kill and relaunch app
  - Widget not appearing: Enable "Allow Notifications" for app
- [ ] Escalation path defined for ActivityKit errors

### Step 5: Production Release
```bash
# After TestFlight internal QA complete and approved:
eas submit --platform ios

# Release to App Store
# Wait for App Store review: 24-48 hours
```

### Step 6: Post-Release Monitoring

#### Hour 0-1: Crash Monitoring
- [ ] No crashes reported in Sentry
- [ ] No spike in HTTP 500 errors
- [ ] No Twilio integration errors

#### Hour 1-4: Feature Metrics
- [ ] Live activities being created (Sentry event count > 0)
- [ ] Permission denials logged appropriately
- [ ] No permission denial for owner role (count should be ~0)
- [ ] Call success rate unchanged

#### Hour 4-24: User Reports
- [ ] No user-reported issues in support channels
- [ ] Sentry error clusters: investigate and patch if needed
- [ ] Check for iOS version-specific issues

#### Day 1-7: Production Stability
- [ ] Crash rate < 0.1%
- [ ] Error rate for Live Activity operations < 1%
- [ ] Timer accuracy confirmed (spot check multiple calls)
- [ ] Trusted contact badge working correctly
- [ ] No memory leaks reported (check iOS memory usage monitoring)

## Rollback Plan

If critical issues discovered post-release:

### Immediate Actions
1. [ ] Stop promoting the version in App Store (if not yet public)
2. [ ] Create incident in incident tracking system
3. [ ] Notify support team to prepare user communications
4. [ ] Gather Sentry data for root cause analysis

### Rollback Scenario A: Bug in Live Activity Logic
- [ ] Publish v1.1.1 with fix (same app version, build +1)
- [ ] TestFlight validation: 1 hour
- [ ] App Store resubmission: 24 hours
- [ ] User messaging: "Update app for improved call widget stability"

### Rollback Scenario B: iOS Compatibility Issue
- [ ] Disable Live Activity feature flag (if implemented)
- [ ] OR: Publish v1.1.1 with Activity gating for specific iOS versions
- [ ] User messaging: "Call widgets will be enabled once stability improves"

### Rollback Scenario C: Permission Gating Broken
- [ ] **CRITICAL:** Family members seeing activities
- [ ] Publish v1.1.1 immediately with permission check restored
- [ ] User messaging: "We've temporarily improved our privacy controls"
- [ ] Add stricter integration tests before final release

### Full Rollback (Last Resort)
- [ ] Revert to v1.0.x in App Store
- [ ] Publish v1.2.0 with Live Activities removed/disabled
- [ ] User messaging: "Focused on call quality improvements this cycle"

## Monitoring & Maintenance

### Daily (First Week)
- [ ] Review Sentry dashboard for permission-related events
- [ ] Check for any regressions in call success rate
- [ ] Monitor app crashes vs. baseline
- [ ] Review support tickets mentioning "lock screen" or "widget"

### Weekly (First Month)
- [ ] Run through full test suite with live calls
- [ ] Review Sentry trends (permission denials trending toward zero for owners?)
- [ ] Validate phone number formatting edge cases
- [ ] Check for any iOS 17+ preview compatibility issues

### Monthly
- [ ] Performance audit: does Live Activity polling impact battery?
- [ ] Security audit: is profileId properly validated?
- [ ] User feedback: general satisfaction with feature
- [ ] Error rate trends: are we stable?

## Rollout Strategy

### Phase 1: Internal Testing (Current)
- Developers and QA only
- TestFlight build
- All features enabled
- Status: ✅ Complete

### Phase 2: Beta Release
- Time estimate: 1-2 weeks
- Target beta users (opt-in signup form)
- Full monitoring and metrics
- Rapid patch cycle (if needed, push daily)
- Collect feedback via in-app survey

### Phase 3: General Availability
- All users receive v1.1.0
- Standard App Store release schedule
- Full documentation and support resources
- Ongoing monitoring and maintenance

## Success Metrics

### Technical KPIs
- Creation success rate: ≥ 99%
- Update success rate: ≥ 98%
- End success rate: ≥ 99%
- Error rate: ≤ 1% of activities attempted
- Mean time to display: ≤ 500ms from call receipt

### User Engagement KPIs
- Lock screen widget visible in: ≥ 80% of incoming calls
- Widget interaction rate (tap to open call): ≥ 25% of locked calls
- Feature retention (still visible after 1 week): ≥ 90%

### Security & Privacy KPIs
- Permission denial rate for non-owners: 100%
- Cross-profile activity leakage: 0 incidents
- Unauthorized profile access via Live Activity: 0 incidents

## Testing Artifacts

### Test Spreadsheet
- Location: [Team Shared Drive]/safecall/Live-Activities-v1.1-Test-Matrix.xlsx
- Contains: All 16 test cases + sign-off
- Updated: After each test run
- Signed by: QA Lead

### Sentry Alerts
- Alert 1: Live Activity permission denied count > 100/day (investigate permission logic change)
- Alert 2: Live Activity any error rate > 5% (critical quality issue)
- Alert 3: Multiple crashes in VerityLiveActivityModule (native code issue)

## Documentation References

- [Technical Design](technical-architecture.md) - Overall architecture
- [Quick Setup Guide](QUICK_SETUP.md) - Development environment
- [iOS Setup](docs/VOIP_PUSH_SETUP.md) - VoIP Push integration
- [Testing Guide](live-activities-testing-guide.md) - Comprehensive test cases
- [App Store Submission](APP_STORE_METADATA.md) - Release notes

## Final Approval

- [ ] Engineering Lead: Approve code quality _______________
- [ ] QA Lead: Approve test coverage _______________
- [ ] Product Manager: Approve feature scope _______________
- [ ] Security Lead: Approve permission gating _______________
- [ ] Release Manager: Approve deployment plan _______________

**Deployment Date:** _______________
**Deployed By:** _______________
**Notes:** _______________

