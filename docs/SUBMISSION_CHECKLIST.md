# App Store Submission Checklist — VerityProtect 1.0.0

Target: This week. Solo operator. iOS only.

Mark each item ✅ when confirmed. Do not submit until all Gate 1–3 items are checked.

---

## Gate 1 — App Store Connect Readiness

### Metadata
- [ ] App name, subtitle, description final and reviewed
- [ ] Keywords optimized (call screening, spam blocker, fraud call protection, etc.)
- [ ] Support URL live and reachable
- [ ] Marketing URL live (or same as support URL)
- [ ] Privacy Policy URL live and matches `LEGAL_PRIVACY_URL` env var
- [ ] Age rating correct (likely 4+)
- [ ] Category correct (primary: Utilities or Productivity; secondary: optional)

### Screenshots
- [ ] 6.9" (iPhone 16 Pro Max) screenshots — **needed, not current**
- [ ] 6.5" (iPhone 15 Plus / 14 Plus) screenshots — **needed, not current**
- [ ] Screenshots show current UI (post all polish changes from this session)
- [ ] At least 1 screenshot showing call screening in action

### In-App Purchases
- [ ] Annual subscription — Ready to Submit ✅ (confirmed)
- [ ] Monthly subscription — Ready to Submit ✅ (confirmed)
- [ ] Both products attached to this app version submission

### Privacy Nutrition Labels (App Privacy)
- [ ] Data collected: phone number, name, call data — declared
- [ ] Usage: third-party advertising? (likely No) — confirm
- [ ] Data linked to identity declared correctly
- [ ] PrivacyInfo.xcprivacy in iOS bundle matches declared APIs

---

## Gate 2 — Production Config Freeze

### Backend (Render)
- [ ] `NODE_ENV=production`
- [ ] `APPLE_ENVIRONMENT=production` (not sandbox)
- [ ] `ENABLE_SENTRY_TEST_ROUTES=false` or not set
- [ ] `TWILIO_VALIDATE_SIGNATURE=true`
- [ ] All secrets rotated from any dev/test values if applicable
- [ ] No test/debug routes exposed in production

### Frontend (app.json / EAS build)
- [ ] `version: "1.0.0"` confirmed
- [ ] `buildNumber` bumped for submission build
- [ ] `EXPO_PUBLIC_ENABLE_CUSTOM_VOIP_PUSH` absent or `false` (confirmed)
- [ ] Sentry DSN pointing at production project
- [ ] Splash screen background white (fixed ✅)

### Keys & Certs
- [ ] APNs VoIP cert / auth key not expired — check expiry in Apple Developer portal
- [ ] Twilio push credential SID matches production APNs key
- [ ] App Store Connect API key not expired (used for IAP validation)

---

## Gate 3 — App Review Notes

Your notes should cover these points (partial notes exist — fill gaps):

```
VOIP & CALL SCREENING
- This app uses CallKit + Twilio to screen incoming calls before they ring the user.
- When a call arrives, the app answers via a Twilio bridge, runs fraud analysis, and
  presents the caller's identity + risk score. The user can then accept or reject.
- VoIP push (APNs VoIP) is used to wake the app when a call arrives, required by iOS
  for CallKit integration. This is the only use of VoIP entitlement.

IN-APP PURCHASES
- Two auto-renewable subscriptions: Monthly ($9.99/mo) and Annual ($99.99/yr).
- Restore Purchases button is available on the membership screen.
- Subscription is required to use call screening features; a free tier is not offered.

PERMISSIONS USED
- Microphone: required for the two-way call bridge via Twilio.
- Notifications: used to alert user of screened calls and circle activity updates.
- (No location permission required at launch.)

TEST ACCOUNT (if reviewer needs one)
- Email: [ADD TEST ACCOUNT EMAIL]
- Password: [ADD TEST ACCOUNT PASSWORD]
- Note: Use sandbox IAP; do not use real payment method.
- The app will not receive real incoming calls in the reviewer's environment.
  To test call screening flow: [describe any demo/test mode if you have one,
  or explain it requires a live Twilio number configured to the account]
```

- [ ] App Review notes filled in completely (test account added)
- [ ] Demo video attached if call screening flow is hard for reviewer to replicate

---

## Gate 4 — Final TestFlight Pass (sign off each scenario)

### New User
- [ ] Signup → email confirm → profile setup → membership purchase → first protected call
- [ ] IAP success screen (MembershipActivated) shows correctly
- [ ] Onboarding completes and lands on home screen

### Returning User
- [ ] Reinstall → login → entitlement restored automatically
- [ ] Restore Purchases button works if entitlement not auto-restored
- [ ] All settings, trusted callers, circle intact after reinstall

### Call Flow
- [ ] Incoming call while app is open → CallKit → active call screen
- [ ] Incoming call while app is backgrounded → VoIP push wakes app → CallKit
- [ ] Incoming call while phone locked → CallKit rings on lock screen
- [ ] Incoming call while app is killed (cold start) → VoIP push → CallKit
- [ ] Active call screen does not flicker/reopen (race condition fix ✅)
- [ ] Call ends cleanly from both sides
- [ ] Trusted caller detail shows call length if available

### Edge Cases
- [ ] No network → graceful error, no crash
- [ ] IAP cancelled mid-flow → no crash, lands back on membership screen
- [ ] Blocked caller calls → handled per block settings
- [ ] App in dark mode — all screens correct (splash white ✅, ghost card border ✅)

---

## Gate 5 — Day-of Submission

- [ ] Build submitted in App Store Connect with correct metadata version
- [ ] "Release this version" set to manual release (so you control go-live timing)
- [ ] All IAP products attached to the submitted version
- [ ] Set up App Review reply notifications in App Store Connect

---

## Gate 6 — First 72 Hours Post-Approval (Solo)

### Before flipping to live
- [ ] Sentry — confirm alerts firing to your phone/email
- [ ] Verify one real production IAP purchase end-to-end
- [ ] Verify one real incoming VoIP call end-to-end in production

### Watch daily
- [ ] Sentry: crash rate < 1% of sessions
- [ ] Sentry: any `voip_push_received` → `call_connected` drop-off
- [ ] Sentry: IAP purchase failures
- [ ] App Store Connect: user ratings, review text
- [ ] Render logs: Twilio webhook errors, transcription failures

### Common first issues (prepared responses ready?)
- [ ] "I can't restore my purchase" → Settings > Apple Account > Subscriptions; also try Restore button
- [ ] "I'm not receiving calls" → Check notification + mic permissions in Settings
- [ ] "App crashed on startup" → Force quit, reopen; escalate to Sentry

---

## Rejected? Fast response plan
1. Read rejection reason in full before responding
2. If guideline 2.5.4 (background mode) — clarify VoIP is for CallKit, not streaming
3. If guideline 3.1.1 (IAP) — confirm no external payment links exist in app
4. If metadata rejection — fix and resubmit same build (no new build needed)
5. If binary rejection — patch, bump build number, resubmit

---

*Last updated: 2026-03-02*
