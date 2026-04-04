# Live Activities (iOS Lock Screen) Testing Guide

## Overview

This guide provides comprehensive testing instructions for iOS Live Activities (lock screen call widgets) as implemented in v1.1.0. Live Activities display incoming call information on the lock screen and Dynamic Island.

## Architecture Overview

**Permission Gating (CRITICAL):**
- Only users with `canManageProfile=true` (owners/managers) can see live activities
- Gating enforced in `TwilioVoiceClientManager.tsx` → `buildLiveActivityPayload()`
- Returns `null` if user lacks permission or profile is invalid
- All native calls are guarded: `if (payload) { startLiveCallActivity(payload) }`

**Payload Flow:**
```
Incoming Call → parseTwilioEventData() → buildLiveActivityPayload() → iOS ActivityKit
     ↓
Permission check (canManageProfile)
     ↓
Profile validation (activeProfile?.id)
     ↓
Trusted contact lookup (normalizedNumber)
     ↓
Phone number formatting (formatPhoneNumber for 7/10/15+ digits)
     ↓
Live Activity created (iOS 16.1+)
```

## User Roles & Permissions

### Owner (canManageProfile = true)
- **Should see:** ✅ Live activities for all incoming calls
- **Lock screen widget:** ✅ Displayed with caller info
- **Dynamic Island:** ✅ Expanded/compact/minimal views
- **Trusted badge:** ✅ Shows if caller is in trusted contacts
- **Test:** Call owner's number while viewing lock screen

### Manager/Caretaker (canManageProfile = false)
- **Should see:** ❌ No live activities, even if sitting with device
- **Call handling:** ✅ Accepts calls normally via CallKit
- **Sentry log:** `LIVE_ACTIVITY_PERMISSION_DENIED` with callSid
- **Test:** Call while caretaker logged in, verify no widget appears

### Family Member (canManageProfile = false)
- **Should see:** ❌ No live activities, even if device is nearby
- **Call handling:** ✅ Accepts calls normally via CallKit
- **Sentry log:** `LIVE_ACTIVITY_PERMISSION_DENIED` with callSid
- **Test:** Call while family member logged in, verify no widget appears

## Test Cases

### TC1: Owner Receives Live Activity on Lock Screen

**Preconditions:**
- Owner logged in locally
- Owner's number registered in system
- iOS 16.1+ device
- Battery good, not in Low Power mode

**Steps:**
1. Lock device (physical lock button)
2. From another phone, call owner's number
3. Observe lock screen

**Expected Result:**
- Live Activity widget appears immediately on lock screen
- Shows caller name, phone number, status ("Ringing")
- Blue "Ringing" status indicator
- Phone/shield icon (blue for ringing)
- Timer not running (status != "Connected")

**Actual Result:** _______________

### TC2: Owner Sees Connected Call Timer

**Preconditions:**
- Owner logged in, device locked
- Live activity visible with "Ringing" status
- Setup call to auto-answer (if available)

**Steps:**
1. Call owner's number
2. Let call connect
3. Observe lock screen widget

**Expected Result:**
- Status changes to "Connected"
- Green status indicator
- Timer starts running (h:mm:ss format)
- Timer increments each second

**Actual Result:** _______________

### TC3: Owner Sees Trusted Call Badge

**Preconditions:**
- Owner has added phone number to trusted contacts
- Owner logged in, device locked

**Steps:**
1. Call owner from trusted contact number
2. Observe lock screen widget immediately
3. Check icon and label

**Expected Result:**
- Shield icon (blue) instead of phone icon
- Label shows "Trusted Call" instead of "Protected Call"
- Caller name displayed (from contacts, not redacted)

**Actual Result:** _______________

### TC4: Owner Sees Dynamic Island Expanded

**Preconditions:**
- iPhone 14+ with Dynamic Island
- Owner logged in, call incoming

**Steps:**
1. Call owner's number
2. Long-press Dynamic Island during call
3. Observe expanded view

**Expected Result—Expanded View:**
- Leading: Shield or phone icon
- Center: "Ringing"/"Connected" status and caller name
- Trailing: Call duration timer (if connected)
- Bottom: "Tap to open calls" hint + timer

**Actual Result:** _______________

### TC5: Owner Sees Dynamic Island Compact

**Preconditions:**
- Dynamic Island present, call active

**Steps:**
1. Call owner while app in foreground
2. Swipe up (minimize or enter background)
3. Observe Dynamic Island

**Expected Result—Compact View:**
- Leading: Shield/phone icon
- Trailing: Short status code (R=Ringing, C=Connected) OR timer if connected

**Actual Result:** _______________

### TC6: Owner Sees Dynamic Island Minimal

**Preconditions:**
- Dynamic Island present, call active, app in background

**Steps:**
1. Dynamic Island is inactive (no interaction)
2. Observe top notch area

**Expected Result—Minimal View:**
- Shield/phone icon visible
- No text, just icon badge

**Actual Result:** _______________

### TC7: Manager/Caretaker Doesn't See Live Activity

**Preconditions:**
- Manager/caretaker logged in locally
- Manager's number registered (if different from owner)

**Steps:**
1. Lock device
2. Call manager's number from another phone
3. Wait 2-3 seconds
4. Observe lock screen

**Expected Result:**
- ❌ No live activity widget appears on lock screen
- CallKit call picker still appears (normal incoming call UI)
- Sentry: Check "LIVE_ACTIVITY_PERMISSION_DENIED" log with the callSid

**Actual Result:** _______________
**Sentry Verification:** [Paste log entry] _______________

### TC8: Family Member Doesn't See Live Activity

**Preconditions:**
- Family member logged in locally via family sharing/guardian setup
- Family member's number registered

**Steps:**
1. Lock device
2. Call family member's number from another phone
3. Wait 2-3 seconds
4. Observe lock screen

**Expected Result:**
- ❌ No live activity widget appears on lock screen
- CallKit call picker still appears
- Sentry: "LIVE_ACTIVITY_PERMISSION_DENIED" log

**Actual Result:** _______________
**Sentry Verification:** [Paste log entry] _______________

### TC9: Owner App Backgrounded - Live Activity Persists

**Preconditions:**
- Owner logged in, device locked
- Call incoming

**Steps:**
1. Call owner
2. Observe live activity on lock screen
3. Unlock device and bring app to background (press Home)
4. Re-lock device
5. Observe lock screen

**Expected Result:**
- Live activity widget persists across app backgrounding
- Timer continues running
- Widget remains refreshed with call status updates

**Actual Result:** _______________

### TC10: Three Rapid Calls - Only Latest Visible

**Preconditions:**
- Owner logged in
- Ability to make 3 calls from different numbers

**Steps:**
1. Call owner with Number A
2. Rapid call from Number B (while A ringing)
3. Rapid call from Number C (while B ringing)
4. Observe live activity status

**Expected Result:**
- Only C (latest) live activity widget visible on lock screen
- If A was answered, widget shows C ringing
- If C answered, widget shows C connected
- Previous call SIDs cleaned up in native code

**Actual Result:** _______________

### TC11: Manual Hangup Shows "Ended" Preview

**Preconditions:**
- Owner on active call (status="Connected")
- Device locked (to see live activity)

**Steps:**
1. Active call in progress
2. Hangup (either side)
3. Watch lock screen for 1-2 seconds

**Expected Result:**
- Live activity status changes to "Ended"
- Widget visible for ~1.8 seconds
- Activity then dismisses
- No lingering widget with stale data

**Actual Result:** _______________

### TC12: Call Rejection Clears Activity

**Preconditions:**
- Owner receives incoming call
- Live activity visible with "Ringing" status

**Steps:**
1. Call incoming, live activity visible
2. Reject call (swipe down or deny)

**Expected Result:**
- Activity immediately cleared
- No "Ended" preview visible
- Activity removed from lock screen

**Actual Result:** _______________

### TC13: Reconnecting State Shows Orange

**Preconditions:**
- Owner on active call
- Network disconnect/poor connectivity occurs

**Steps:**
1. Active call in progress
2. Simulate network disconnect (toggle WiFi + cellular)
3. Observe status change to "Reconnecting"
4. Let call reconnect

**Expected Result:**
- Status updates to "Reconnecting"
- Orange indicator color (vs. green for connected)
- Timer pauses (or shows last connected time)
- On reconnect, returns to "Connected" + green

**Actual Result:** _______________

### TC14: Phone Number Formatting - 10 Digit

**Preconditions:**
- Owner receives call from 10-digit number (e.g., 5551234567)

**Steps:**
1. Call from 10-digit US number
2. Observe lock screen widget

**Expected Result:**
- Formatted as `(555) 123-4567`
- Properly aligned in widget layout

**Actual Result:** _______________

### TC15: Phone Number Formatting - 7 Digit Landline

**Preconditions:**
- Owner receives call from 7-digit landline (e.g., 1234567)

**Steps:**
1. Call from 7-digit number
2. Observe lock screen widget

**Expected Result:**
- Formatted as `123-4567`
- Not showing fallback text
- Properly aligned

**Actual Result:** _______________

### TC16: Phone Number Formatting - International

**Preconditions:**
- Owner receives call from international number (e.g., +44 20 xxxx xxxx)

**Steps:**
1. Call from international number
2. Observe lock screen widget

**Expected Result:**
- Formatted with country code (e.g., `+44 (201) 234-5678`)
- Correct digit extraction and formatting

**Actual Result:** _______________

## Edge Cases & Negative Tests

### EC1: Update Activity While Payload Null (Permission Denied Mid-Call)

**Scenario:**
- Owner starts call (live activity created)
- Owner's profile permission revoked (unlikely in production, but possible if synced)
- Trusted contact lookup updates

**Expected Behavior:**
- Update silently fails (no crash)
- Sentry logs "LIVE_ACTIVITY_UPDATE_ERROR"
- Existing lock screen widget remains showing

### EC2: Activity End During Permission Check

**Scenario:**
- Call ending
- clearActiveCall() checks buildLiveActivityPayload()
- Permission check fails

**Expected Behavior:**
- basePayload = null
- Function returns early
- No endLiveCallActivity() call
- Activity dismissed by iOS system after timeout

### EC3: Malformed CallSid in Payload

**Scenario:**
- Twilio returns empty or null callSid

**Expected Behavior (React Native):**
- parseTwilioEventData() handles gracefully
- Early returns before calling buildLiveActivityPayload
- No null pointer exception
- Console or Sentry log

### EC4: Missing Profile ID in Active Profile

**Scenario:**
- User somehow has no profileId but canManageProfile=true
- Concurrency issue

**Expected Behavior:**
- buildLiveActivityPayload() detects !activeProfile?.id
- Returns null early
- Logs "LIVE_ACTIVITY_INVALID_PROFILE"
- No activity created

## Deployment Checklist

- [ ] **Code Review:** PR approved with permission gating review
- [ ] **TypeScript:** No compilation errors (`npm run type-check`)
- [ ] **Lint:** ESLint passes (`npm run lint`)
- [ ] **Unit Tests:** New tests added for null payload handling
- [ ] **Integration Tests:** All TwilioVoiceClientManager handlers tested
- [ ] **Sentry:** New log event types (`LIVE_ACTIVITY_PERMISSION_DENIED`, `LIVE_ACTIVITY_*_ERROR`) configured
- [ ] **iOS Build:** TestFlight/EAS build succeeds with 1.1.0 version
- [ ] **Smoke Test:** Manual testing with owner role
- [ ] **Caretaker Test:** Manual verify no widget (at least 2 devices)
- [ ] **Family Member Test:** Manual verify no widget
- [ ] **Release Notes:** Document lock screen call widget feature, permission-gated access
- [ ] **Support Docs:** Update FAQ about why family members don't see live activities

## Logging & Debugging

### Sentry Event Types
- `LIVE_ACTIVITY_PERMISSION_DENIED`: User lacks canManageProfile
- `LIVE_ACTIVITY_INVALID_PROFILE`: activeProfile?.id missing
- `LIVE_ACTIVITY_START_ERROR`: startCallActivity promise rejected
- `LIVE_ACTIVITY_UPDATE_ERROR`: updateCallActivity promise rejected
- `LIVE_ACTIVITY_END_ERROR`: endCallActivity promise rejected
- `LIVE_ACTIVITY_END_PREVIEW_ERROR`: Update before end dismissed
- `LIVE_ACTIVITY_ACTIVATION_ENDED`: MANUAL_HANGUP case

### Console Logging (Development)
- [twilio-voice] failed hydrating live activity
- [twilio-voice] Ignoring incoming invite without callSid
- [twilio-voice] failed starting live activity
- [twilio-voice] failed updating live activity
- [twilio-voice] failed ending live activity

### XCode Debugging (Native Side)
In Swift breakpoints:
- VerityLiveActivityModule.swift:38 (startCallActivity after attribute creation)
- VerityCallLiveActivityWidget.swift:120 (ActivityConfiguration)

## Known Limitations

1. **7-digit landlines:** Formatted as `123-4567` without area code (no data available)
2. **Hidden caller numbers:** Show "Protected Call" label only
3. **iOS 15.1 deployment:** Live Activity not shown (requires iOS 16.1+, falls back gracefully)
4. **No cross-profile sync:** Family members don't see owner's activities, by design
5. **No audio:** Lock screen widget is view-only, no call control options

## Success Criteria

- ✅ Owner sees live activities for all incoming calls
- ✅ Manager/caretaker don't see live activities (permission denied)
- ✅ Family members don't see live activities (permission denied)
- ✅ No crashes or TypeScript errors
- ✅ Call still connects via CallKit even if activity fails
- ✅ Phone numbers formatted correctly (7, 10, 15+ digits)
- ✅ Trusted contacts show shield icon + correct name
- ✅ Timer displays accurate call duration
- ✅ Sentry logs permission denials for audit trail
- ✅ Zero production incidents in first week post-release

