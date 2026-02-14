# VoIP Push Notifications Setup Guide

This document explains how to configure VoIP push notifications to ensure calls **always** wake the iOS app, even when it's been killed or is in deep sleep.

## Overview

VoIP push notifications use Apple's PushKit framework to deliver high-priority notifications that can wake your app from any state. This is the iOS-standard solution for VoIP apps like FaceTime, WhatsApp, and all professional calling apps.

## Why VoIP Push?

**The Problem:**
- iOS aggressively kills background apps to save battery
- Twilio Voice Client can go "stale" when the app is suspended
- Without VoIP push, calls fall back to the secondary number, annoying family/caretakers

**The Solution:**
- VoIP push notifications wake the app **instantly** from any state
- The app then reports the call to CallKit, showing the native iOS call UI
- The Twilio client connects, and the call goes through to the primary user

## Architecture

```
Incoming Call Flow:
1. Call arrives at Twilio number
2. Backend sends VoIP push to iOS device
3. iOS wakes app (even if killed)
4. App shows native call UI via CallKit
5. User answers → Twilio connects
```

## Prerequisites

### 1. Apple Developer Account
- You need an Apple Developer account with VoIP push entitlements
- VoIP push certificates are different from regular push certificates

### 2. APNs Auth Key (.p8 file)
You already have the auth key file: `/AuthKey_FVZBR5687U.p8`

**Key ID:** `FVZBR5687U` (already known)

**Find your Team ID:**
1. Go to [Apple Developer - Membership](https://developer.apple.com/account/#/membership/)
2. Note your **Team ID** (10 characters)

## Backend Configuration

### 1. Install Dependencies

```bash
cd /Users/lex/Desktop/safecall/backend
npm install
```

This installs the `apn` package for sending VoIP pushes.

### 2. Set Environment Variables

Add these to `/Users/lex/Desktop/safecall/backend/config/.env`:

```bash
# APNs VoIP Push Configuration
APNS_AUTH_KEY_PATH=/Users/lex/Desktop/safecall/AuthKey_FVZBR5687U.p8
APNS_AUTH_KEY_ID=FVZBR5687U
APNS_TEAM_ID=YOUR_TEAM_ID_HERE
IOS_BUNDLE_IDENTIFIER=com.lexferguson.verityprotect.com
APNS_PRODUCTION=false  # Set to 'true' for production builds
```

**Replace:**
- `YOUR_TEAM_ID_HERE` with your actual Apple Team ID
- Use the correct auth key file path if using a different key
- Set `APNS_PRODUCTION=true` when deploying to production

### 3. Run Database Migration

```bash
cd /Users/lex/Desktop/safecall
npx supabase migration up
```

This creates the `voip_push_token` column in the profiles table.

## iOS Configuration

### 1. Add VoIP Push Entitlement

The Info.plist already has VoIP background mode enabled:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>voip</string>
</array>
```

### 2. Add PushKit Framework

Open Xcode:
```bash
cd /Users/lex/Desktop/safecall/frontend/ios
open VerityProtect.xcworkspace
```

In Xcode:
1. Select the **VerityProtect** target
2. Go to **Signing & Capabilities**
3. Click **+ Capability**
4. Add **Push Notifications**

### 3. Install Dependencies

```bash
cd /Users/lex/Desktop/safecall/frontend
npm install
cd ios
pod install
```

## Testing

### 1. Development Testing

For development builds (TestFlight or connected device):
- Use `APNS_PRODUCTION=false` in backend .env
- The app will connect to APNs sandbox environment

### 2. Production Testing

For App Store builds:
- Use `APNS_PRODUCTION=true` in backend .env
- The app will connect to APNs production environment

### 3. Verify Setup

**Check backend logs for:**
```
APNs VoIP provider initialized (development/production)
```

**Check frontend logs for:**
```
[VoIPPush] Registered for VoIP push notifications
[VoIPPush] Token updated: <token>
[VoIPPush] Token updated on backend
```

**Test incoming call:**
1. Kill the app completely (swipe up from app switcher)
2. Have a trusted contact call the Twilio number
3. The iOS call screen should appear **immediately**
4. Answer the call to verify Twilio connection works

## How It Works

### Backend Flow
1. Call arrives at Twilio number (`TwilioController.callIncoming`)
2. Backend identifies profile and checks if caller is trusted
3. **Before** dialing Twilio Client, backend sends VoIP push via APNs
4. Backend then attempts Twilio Client dial
5. If app was asleep, VoIP push woke it before the dial, so it succeeds

### iOS Flow
1. iOS receives VoIP push (even if app is killed)
2. iOS launches/wakes the app in background
3. `VoIPPushModule.pushRegistry(_:didReceiveIncomingPushWith:)` is called
4. App reports incoming call to CallKit
5. iOS shows native call UI
6. Twilio Client connects when user answers

## Troubleshooting

### VoIP push not waking app
- Verify `APNS_PRODUCTION` matches your build type (dev vs production)
- Check backend logs for "VoIP push sent successfully"
- Ensure the auth key (.p8) file path is correct
- Verify Key ID and Team ID are correct

### CallKit not showing
- Check Xcode console for errors in `VoIPPushModule`
- Ensure app has Phone permissions
- Verify `com.apple.developer.pushkit` entitlement is present

### Token not updating
- Check frontend logs for `[VoIPPush] Token updated on backend`
- Verify the API endpoint is working: `PUT /api/v1/profiles/:id/voip-token`
- Check network requests in React Native debugger

### Calls still falling back to secondary number
- Verify VoIP push is being sent (check backend logs)
- Ensure the profile has a `voip_push_token` in the database
- Check that the Twilio Client timeout (10 seconds) is sufficient

## Security Considerations

1. **Token Storage**: VoIP push tokens are stored in the `profiles` table and can only be updated by the profile owner
2. **Push Validation**: The backend validates tokens before sending pushes
3. **CallKit Integration**: iOS validates incoming calls through CallKit
4. **Auth Keys**: Keep your .p8 auth key files secure and never commit them to git

## Production Checklist

Before releasing to production:

- [ ] Set `APNS_PRODUCTION=true` in backend environment
- [ ] Use production APNs auth key
- [ ] Test with TestFlight build (production APNs)
- [ ] Verify calls wake app when completely killed
- [ ] Monitor backend logs for VoIP push failures
- [ ] Set up alerting for APNs errors

## Additional Resources

- [Apple PushKit Documentation](https://developer.apple.com/documentation/pushkit)
- [Apple CallKit Documentation](https://developer.apple.com/documentation/callkit)
- [Twilio Voice iOS SDK](https://www.twilio.com/docs/voice/sdks/ios)
- [APNs Token Authentication](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/establishing_a_token-based_connection_to_apns)
