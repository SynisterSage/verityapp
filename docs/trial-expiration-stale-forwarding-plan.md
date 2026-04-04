# Trial Expiration Edge Case: Stale Call Forwarding

## Problem Statement

**Current Behavior (Broken):**
1. User is on trial, receives a Twilio DID number (e.g., +14422173673)
2. User sets call forwarding on their phone to point to this DID
3. Trial ends, user does NOT renew subscription
4. Backend trial cleanup script runs:
   - Resets/reclaims the DID number (removes from user's profile)
   - Sets `hasActiveSubscription=false` or similar
5. **BUT:** User's phone still has the old DID number in their local call forwarding settings
6. Incoming call to old DID number:
   - Twilio routes to backend webhook
   - Backend receives call, tries to find profile by `To=+14422173673`
   - **Profile not found** → "Cannot coerce the result to a single JSON object"
   - Call logged as orphaned, potentially wasting storage/resources
   - No clear indication to user that forwarding is broken

**Impact:**
- Orphaned call records (storage waste)
- User receives calls but doesn't know they're being received (silent failure)
- Potentially confusing user experience (call forwarding seems to work on phone, but no alerts in app)
- Uncertain subscription state on client

---

## Root Cause Analysis

### Backend Flow (Trial Cleanup)
```
pruneRetention.ts (hourly) →
  1. Find trial users with expiredAt < now AND no renewal
  2. Reset profile.twilio_number = null (NUMBER IS NOW ORPHANED)
  3. Return number to Twilio pool
  4. Set subscription status → inactive/expired
  logs: reclaimedUsers=0 reclaimedProfiles=0 (if no change detected)
```

### Client Flow (Stale State)
```
AccountScreen.tsx →
  If user set call forwarding BEFORE trial expiry:
  - Settings stored locally: "Forward to +14422173673"
  - App backgrounded/closed during trial expiry
  - Trial expiry notification received (or not received if offline)
  - User's phone STILL has local forwarding rule pointing to old number
  
  When call comes in:
  - Phone forwards to +14422173673
  - Twilio backend receives webhook
  - Backend queries: WHERE phone_number = '+14422173673'
  - Result: No profile found (it was reset)
  - Error logged, call orphaned
```

### Why This Happens

1. **Async state:** Client state is cached locally, not real-time synced
2. **No invalidation:** When trial expires, no signal sent to client to clear settings
3. **Phone OS level:** iOS/Android phone OS forwarding rules are OS-level settings, not app-controlled
4. **Offline edge case:** If app was closed when trial expired, user never gets notification

---

## Solution Architecture

### Option A: Client-Side (Recommended - Immediate Fix)

**On app launch, validate subscription & clear stale forwarding:**

```typescript
// AccountScreen.tsx or useProfile.ts

useEffect(() => {
  // On every app open, check if user still has active subscription
  if (useProfile().activeProfile?.hasActiveSubscription === false) {
    // Trial expired without renewal
    clearLocalForwardingSettings();
    showAlert("Your call forwarding was disabled because your trial expired");
    logEvent('TRIAL_FORWARDING_CLEARED');
  }
}, [subscriptionStatus]);

function clearLocalForwardingSettings() {
  // Clear any local state holding the DID number
  AsyncStorage.removeItem('forwarding_number');
  AsyncStorage.removeItem('forwarding_enabled');
  
  // NOTE: Cannot directly clear iOS/Android OS-level call forwarding
  // (requires user manual action), but we can:
  // 1. Show warning in app
  // 2. Guide user to Settings → Call Forwarding → Disable
}
```

**Pros:** Catches issue before call even comes in, prevents orphaned records  
**Cons:** Requires user manual action on phone; can't automatically clear OS-level forwarding

---

### Option B: Server-Side Validation (Defense in Depth)

**Validate subscription when Twilio webhook arrives:**

```typescript
// backend/src/handlers/twilio/incomingCall.ts

export async function handleTwilioIncomingCall(req: Request) {
  const { To } = req.body; // The DID number that was called
  
  // Find profile by DID
  const profile = await db.profiles.findOne({ twilio_number: To });
  
  if (!profile) {
    logger.warn('No profile found for To=' + To);
    // NEW: Check if number exists in ORPHANED pool
    // (was reclaimed during trial cleanup)
    const orphaned = await db.orphanedNumbers.findOne({ number: To });
    if (orphaned) {
      // This is a stale call from a user whose trial ended
      logger.info('Call to orphaned DID (trial expired)', {
        number: To,
        originalProfileId: orphaned.originalProfileId,
        expiredAt: orphaned.expiredAt,
      });
      // REJECT: Send Twilio a 403 or let call ring out
      // Don't process further - don't create recording
      return res.status(404).send('Profile not found');
    }
    // If not in orphaned pool either, something else is wrong
    logger.warn('Unknown DID in call', { To });
    return res.status(404).send('Unknown DID');
  }
  
  // Validate subscription
  if (!profile.hasActiveSubscription) {
    logger.warn('Call to expired/inactive profile', {
      profileId: profile.id,
      To,
      subscriptionStatus: profile.subscriptionStatus,
    });
    // Don't forward the call - subscription inactive
    return res.status(403).send('Subscription inactive');
  }
  
  // OK to process call
  await forwardToUserNumber(profile);
}
```

**Pros:** Stops orphaned records at source, validates subscription state  
**Cons:** Requires database changes (track orphaned numbers), server logic changes

---

### Option C: Trial Expiration Notification (User Experience)

**Send clear notification to user when trial expires:**

```typescript
// backend/scripts/pruneRetention.ts (on trial expiry)

async function notifyTrialExpired(profile) {
  const user = await db.users.findOne({ id: profile.userId });
  
  // Push notification to app
  await sendPushNotification(user.deviceTokens, {
    title: 'Your Verity Protect trial has ended',
    body: 'Call forwarding has been disabled. Update settings if you continue your subscription.',
    deepLink: 'verityprotect://account/subscription',
  });
  
  // Email notification
  await sendEmail(user.email, 'trial-expired-template.html', {
    daysUntilDataDelete: 30,
    renewLink: 'https://verityprotect.com/renew',
  });
  
  // In-app alert (next launch)
  await db.userAlerts.create({
    userId: user.id,
    type: 'TRIAL_EXPIRED',
    message: 'Your trial ended. Call forwarding has been disabled.',
    dismissible: true,
  });
}
```

**Pros:** User knows what's happening, can re-enable if they renew  
**Cons:** Still requires manual action on phone

---

## Recommended Implementation Plan

### Phase 1: Immediate (This Sprint)
1. **Client-side check on app launch**
   - [AccountScreen.ts](../frontend/src/screens/dashboard/AccountScreen.tsx): Query `useProfile().subscriptionStatus`
   - If `status === 'expired'` or `hasActiveSubscription === false`:
     - Show alert: "Your trial expired. Call forwarding has been disabled. Go to Settings > Phone > Call Forwarding to disable forwarding on your phone."
     - Clear local async storage settings
     - Log `TRIAL_FORWARDING_CLEARED` event to Sentry

2. **Server-side orphaned call handling**
   - [incomingCall.ts](../backend/src/handlers/twilio/incomingCall.ts): Check if profile exists AND has active subscription
   - If not found: Log `CALL_TO_ORPHANED_DID` with original profile context
   - Early return (don't create call record)

### Phase 2: Short Term (Next Sprint)
3. **Trial expiration notifications**
   - [pruneRetention.ts](../backend/scripts/pruneRetention.ts): Send push notification when trial ends
   - Include guidance: "Disable call forwarding on your phone"
   - Link to subscription renewal page

4. **Orphaned number tracking**
   - Create `orphaned_dids` table:
     ```sql
     CREATE TABLE orphaned_dids (
       id UUID PRIMARY KEY,
       number VARCHAR(20) NOT NULL UNIQUE,
       originalUserId UUID,
       originalProfileId UUID,
       reclaimed_at TIMESTAMP,
       expires_at TIMESTAMP, -- Twilio may cycle number back later
       reason VARCHAR(50), -- 'trial_expired', 'subscription_cancelled', etc
       created_at TIMESTAMP DEFAULT NOW()
     );
     ```

### Phase 3: Long Term (Future)
5. **Client-side auto-disable (if possible)**
   - Investigate iOS/Android APIs to programmatically disable call forwarding
   - May require app permission for iOS 14+
   - Not feasible on current OS versions (would need user consent anyway)

---

## Test Plan

### Test Case 1: Trial Expired, User Offline During Cleanup

**Setup:**
- Create user with active trial + forwarding to DID
- App backgrounded during trial expiry window
- User comes online after expiry

**Steps:**
1. User launches app 12 hours after trial expiry
2. App has no network, then connects
3. Observe AccountScreen behavior

**Expected:**
- Alert shown: "Your trial expired. Call forwarding disabled."
- `TRIAL_FORWARDING_CLEARED` logged to Sentry
- AsyncStorage keys cleared
- User prompted to manually disable phone forwarding

### Test Case 2: Call Arrives After Trial Expired

**Setup:**
- User on trial, set call forwarding
- Trial expires without renewal
- Someone calls the old DID number

**Steps:**
1. Trial cleanup runs (numbers reclaimed)
2. Call comes in to old DID
3. Backend webhook triggered
4. Check logs

**Expected:**
- Webhook returns 404 or 403 (early)
- No orphaned call record created
- Sentry: `CALL_TO_ORPHANED_DID` logged with context
- Call log shows `profile_not_found` reason

### Test Case 3: User Renews Mid-Trial, Then Expires

**Setup:**
- User on trial, had forwarding disabled, trial end
- Within grace period, user renews (reactivates subscription)

**Steps:**
1. User sees alert on app open
2. User checks Subscription page → sees "Active"
3. Alert should disappear or update

**Expected:**
- If user renews BEFORE trying to access account, no disruption
- If user renews AFTER alert, next app open shows active subscription
- Forwarding rules on phone still need manual re-enable (app can't do it)

---

## Database Schema Changes

### New Table: Orphaned DIDs
```sql
CREATE TABLE orphaned_dids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  original_profile_id UUID REFERENCES profiles(id),
  reclaim_reason VARCHAR(100),  -- 'trial_expired', 'subscription_cancelled'
  reclaimed_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,  -- When Twilio may cycle this back
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orphaned_dids_number ON orphaned_dids(phone_number);
```

### Update: Profiles Table
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_active_subscription BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS forwarding_number_cleared_at TIMESTAMP;
```

---

## Code Changes Required

### Frontend: [AccountScreen.tsx](../frontend/src/screens/dashboard/AccountScreen.tsx)

```typescript
useEffect(() => {
  const validateSubscription = async () => {
    const profile = activeProfile;
    if (!profile) return;
    
    // Check if subscription is inactive
    if (profile.subscriptionStatus === 'expired' || 
        profile.subscriptionStatus === 'trial_ended' ||
        !profile.hasActiveSubscription) {
      
      // Clear old forwarding settings
      await AsyncStorage.removeItem('twelio_forwarding_number');
      
      // Show alert first time only
      const alreadyShown = await AsyncStorage.getItem('forwarding_expired_alert_shown');
      if (!alreadyShown) {
        Alert.alert(
          'Call Forwarding Disabled',
          'Your trial ended and call forwarding was disabled. ' +
          'For security, please go to Settings > Phone > Call Forwarding and disable it manually.',
          [
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openURL('app-prefs:root=Phone&path=Call%20Forwarding');
                AsyncStorage.setItem('forwarding_expired_alert_shown', '1');
              },
            },
            { text: 'Done', onPress: () => AsyncStorage.setItem('forwarding_expired_alert_shown', '1') },
          ]
        );
      }
      
      logEvent('TRIAL_FORWARDING_CLEARED', {
        subscriptionStatus: profile.subscriptionStatus,
        profileId: profile.id,
      });
    }
  };
  
  validateSubscription();
}, [activeProfile?.subscriptionStatus]);
```

### Backend: [incomingCall.ts](../backend/src/handlers/twilio/incomingCall.ts)

```typescript
export async function handleIncomingCall(req: GinRequest, res: GinResponse) {
  const { To, From, CallSid } = req.body;
  
  // Find profile by DID
  let profile = await db.profiles.findOne({ twilio_number: To });
  
  if (!profile) {
    // Check if this is an orphaned number (trial expired)
    const orphaned = await db.orphanedDids.findOne({ phone_number: To });
    
    if (orphaned) {
      logger.info('[twilio-incoming] Call to orphaned DID (trial expired)', {
        callSid: CallSid,
        number: To,
        originalProfileId: orphaned.original_profile_id,
        expiredAt: orphaned.reclaimed_at,
      });
      
      logEvent('CALL_TO_ORPHANED_DID', {
        number: To,
        originalProfileId: orphaned.original_profile_id,
        reason: orphaned.reclaim_reason,
      });
      
      // Reject the call - don't process further
      res.status(404).send('Profile not found');
      return;
    }
    
    logger.warn('[twilio-incoming] No profile found for number', { To });
    res.status(404).send('Unknown DID');
    return;
  }
  
  // Validate subscription is active
  if (!profile.hasActiveSubscription) {
    logger.info('[twilio-incoming] Call to inactive profile', {
      profileId: profile.id,
      subscriptionStatus: profile.subscriptionStatus,
    });
    
    logEvent('CALL_TO_INACTIVE_PROFILE', {
      profileId: profile.id,
      subscriptionStatus: profile.subscriptionStatus,
    });
    
    res.status(403).send('Subscription inactive');
    return;
  }
  
  // Process call normally
  // ... rest of logic
}
```

### Backend: [pruneRetention.ts](../backend/scripts/pruneRetention.ts)

Add at the point where trial numbers are reclaimed:

```typescript
// When reclaiming a trial user's DID
async function reclaimTrialDid(profile: Profile) {
  const didNumber = profile.twilio_number;
  
  if (didNumber) {
    // Track as orphaned (for call validation)
    await db.orphanedDids.create({
      phone_number: didNumber,
      original_profile_id: profile.id,
      reclaim_reason: 'trial_expired',
      reclaimed_at: new Date(),
      expires_at: addDays(new Date(), 30), // Keep orphaned record for 30 days
    });
    
    // Send notification
    const user = await db.users.findOne({ id: profile.userId });
    await sendPushNotification(user.deviceTokens, {
      title: 'Trial Ended',
      body: 'Your trial has expired. Call forwarding has been disabled.',
      deepLink: 'verityprotect://account/subscription',
    });
    
    logEvent('TRIAL_DID_RECLAIMED', {
      profileId: profile.id,
      number: didNumber,
    });
  }
  
  // Reset profile
  await db.profiles.update(
    { id: profile.id },
    {
      twilio_number: null,
      hasActiveSubscription: false,
      subscriptionStatus: 'trial_expired',
      forwarding_number_cleared_at: new Date(),
    }
  );
}
```

---

## Deployment Checklist

- [ ] Create `orphaned_dids` table in production
- [ ] Add `has_active_subscription` column to `profiles`
- [ ] Deploy backend changes (early validation in incomingCall.ts)
- [ ] Test: Call to orphaned DID returns 404 (no orphaned record created)
- [ ] Check: Sentry shows `CALL_TO_ORPHANED_DID` logs
- [ ] Deploy frontend changes (app startup validation)
- [ ] Test: App open after trial expiry shows alert
- [ ] Test: Alert appears only once (AsyncStorage flag)
- [ ] QA: Manual testing with trial user workflow

---

## Success Criteria

✅ When trial expires without renewal:
- DID number is reclaimed and tracked as orphaned
- User's phone still has local forwarding (can't auto-disable)
- User sees alert on app open within 24 hours
- If call comes in after expiry, it's rejected early (no orphaned record)
- Sentry shows clear event trail: `TRIAL_EXPIRED` → `DID_RECLAIMED` → `CALL_TO_ORPHANED_DID`

✅ No more:
- Orphaned call records with "Cannot coerce result" errors
- Silent call failures (user never knows call came in)
- Stale forwarding rules causing confusion
