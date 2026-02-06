# VoIP Push Notification Setup

## Overview
VoIP push notifications are critical for call bridging - they wake up the app when it's closed/backgrounded so incoming calls can be received. Both iOS and Android require platform-specific push services.

## Why VoIP Push is Required

**The Problem:**
- User's phone is locked/app is closed
- Scam call comes in to their Twilio number
- App needs to wake up, analyze the call, and alert the user
- Regular push notifications aren't reliable enough for real-time calls

**The Solution:**
- **iOS:** PushKit (Apple Push Notification service) - High priority, immediate delivery
- **Android:** Firebase Cloud Messaging (FCM) - Optimized for VoIP use case

**Without VoIP Push:**
- ❌ App only works when actively open
- ❌ Missed calls when phone is locked
- ❌ No background fraud detection
- ❌ Basically unusable for call protection

## Architecture

```
Incoming Call Flow:
┌─────────────┐         ┌──────────┐         ┌─────────────┐
│  Scammer    │────────>│  Twilio  │────────>│  Your API   │
└─────────────┘         └──────────┘         └─────────────┘
                              │                      │
                              │ VoIP Push            │ Analyze
                              ▼                      ▼
                        ┌──────────┐         ┌─────────────┐
                        │   APNS   │         │   Fraud     │
                        │   (iOS)  │         │   Detection │
                        │    OR    │         └─────────────┘
                        │   FCM    │                │
                        │ (Android)│                │ Alert
                        └──────────┘                ▼
                              │              ┌─────────────┐
                              │              │  User's     │
                              └─────────────>│  Phone      │
                                Wake up app  └─────────────┘
```

## iOS Setup (Apple Developer Program Required)

### Prerequisites
- Apple Developer Program membership ($99/year)
- Xcode with valid signing certificate
- Physical iOS device (VoIP push doesn't work in simulator)

### Step 1: Enable VoIP Push in Apple Developer Portal
1. Go to https://developer.apple.com/account/
2. Navigate to **Certificates, Identifiers & Profiles**
3. Select your app identifier (`com.lexferguson.verityprotect.com`)
4. Enable **Push Notifications** capability
5. Create a **VoIP Services Certificate**:
   - Type: VoIP Services Certificate
   - App ID: Your app
   - Generate CSR from Keychain Access on Mac
   - Download certificate

### Step 2: Configure Xcode Project
```xml
<!-- ios/VerityProtect/VerityProtect.entitlements -->
<key>aps-environment</key>
<string>production</string>
<key>com.apple.developer.pushkit</key>
<array>
  <string>voip</string>
</array>
```

### Step 3: Upload Certificate to Twilio
1. Convert certificate to .p12:
   ```bash
   # In Keychain Access, export certificate with private key
   # Save as VoIPPush.p12
   ```
2. Go to Twilio Console → Mobile → Push Credentials
3. Create **Apple Push Credential**
4. Upload VoIPPush.p12
5. Save Credential SID (starts with `CR...`)

### Step 4: Implement PushKit in App
```typescript
// frontend/src/services/pushkit.ts (to be created)
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import VoipPushNotification from 'react-native-voip-push-notification';

export const setupVoIPPush = () => {
  VoipPushNotification.addEventListener('register', (token) => {
    // Send token to your backend
    registerDeviceToken('ios', token);
  });

  VoipPushNotification.addEventListener('notification', (notification) => {
    // Handle incoming call
    handleIncomingCall(notification);
  });

  VoipPushNotification.registerVoipToken();
};
```

## Android Setup (Google Play + Firebase)

### Prerequisites
- Google Play Console account ($25 one-time)
- Firebase account (free)
- Android device or emulator

### Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com/
2. Create new project: "VerityProtect"
3. Add Android app:
   - Package name: `com.lexferguson.verityprotect.com`
   - Download `google-services.json`
4. Copy to `android/app/google-services.json`

### Step 2: Get FCM Server Key
1. Firebase Console → Project Settings
2. Cloud Messaging tab
3. Copy **Server Key** (starts with `AAAA...`)
4. Copy **Sender ID** (numeric)

### Step 3: Configure Android Project
```gradle
// android/app/build.gradle (already has most of this)
dependencies {
  implementation 'com.google.firebase:firebase-messaging:23.0.0'
  implementation 'com.twilio:voice-android:6.+'
}

apply plugin: 'com.google.gms.google-services'
```

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<service
  android:name=".VoipFirebaseMessagingService"
  android:exported="false">
  <intent-filter>
    <action android:name="com.google.firebase.MESSAGING_EVENT" />
  </intent-filter>
</service>

<uses-permission android:name="android.permission.USE_SIP" />
<uses-permission android:name="android.permission.BIND_TELECOM_CONNECTION_SERVICE" />
```

### Step 4: Upload FCM to Twilio
1. Twilio Console → Mobile → Push Credentials
2. Create **FCM Push Credential**
3. Enter Server Key
4. Save Credential SID (starts with `CR...`)

### Step 5: Implement FCM in App
```typescript
// frontend/src/services/fcm.ts (to be created)
import messaging from '@react-native-firebase/messaging';

export const setupFCMPush = async () => {
  const token = await messaging().getToken();
  
  // Send token to your backend
  await registerDeviceToken('android', token);

  // Handle incoming call notification
  messaging().onMessage(async (remoteMessage) => {
    handleIncomingCall(remoteMessage.data);
  });

  // Handle notification when app is in background
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    handleIncomingCall(remoteMessage.data);
  });
};
```

## Backend Integration

### Store Push Credentials in Environment
```bash
# backend/.env
TWILIO_PUSH_CREDENTIAL_SID_IOS=CRxxxxxxxxxxxxx
TWILIO_PUSH_CREDENTIAL_SID_ANDROID=CRxxxxxxxxxxxxx
```

### Device Registration Endpoint
```typescript
// backend/src/routes/devices.ts
router.post('/devices/register', authenticate, async (req, res) => {
  const { platform, pushToken, deviceId } = req.body;
  const userId = req.user.id;

  // Store in database
  await supabase
    .from('user_devices')
    .upsert({
      user_id: userId,
      platform, // 'ios' or 'android'
      push_token: pushToken,
      device_id: deviceId,
      updated_at: new Date(),
    });

  res.json({ success: true });
});
```

### Twilio Call Creation with Push
```typescript
// backend/src/services/twilio.ts
export async function initiateCallWithPush(
  userId: string,
  toNumber: string,
  fromNumber: string
) {
  // Get user's device
  const { data: device } = await supabase
    .from('user_devices')
    .select('platform, push_token')
    .eq('user_id', userId)
    .single();

  // Select appropriate push credential
  const pushCredentialSid = device.platform === 'ios'
    ? process.env.TWILIO_PUSH_CREDENTIAL_SID_IOS
    : process.env.TWILIO_PUSH_CREDENTIAL_SID_ANDROID;

  // Create call with push notification
  const call = await twilioClient.calls.create({
    to: toNumber,
    from: fromNumber,
    pushCredentialSid,
    // Custom parameters for your app
    params: {
      userId,
      callType: 'incoming',
      // Add fraud analysis data here
    },
  });

  return call;
}
```

## Database Schema

```sql
-- supabase/migrations/add_user_devices.sql
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  push_token TEXT NOT NULL,
  device_id TEXT,
  device_name TEXT,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_platform ON user_devices(platform);
```

## Testing Checklist

### iOS Testing
- [ ] VoIP certificate installed in Apple Developer
- [ ] Push capability enabled in Xcode
- [ ] Certificate uploaded to Twilio
- [ ] Test on physical device (required for VoIP)
- [ ] App registers push token successfully
- [ ] Twilio can send push notification
- [ ] App wakes up when push received
- [ ] CallKit UI appears for incoming call
- [ ] Audio connects properly

### Android Testing
- [ ] Firebase project created
- [ ] google-services.json in android/app/
- [ ] FCM credentials uploaded to Twilio
- [ ] Test on physical device or emulator
- [ ] App registers FCM token successfully
- [ ] Twilio can send FCM notification
- [ ] App wakes up when notification received
- [ ] ConnectionService UI appears
- [ ] Audio connects properly

### Backend Testing
- [ ] Device registration endpoint works
- [ ] Tokens stored in database
- [ ] Twilio call creation includes push credentials
- [ ] Different credentials used for iOS vs Android
- [ ] Push notifications sent successfully
- [ ] Error handling for expired/invalid tokens

## Common Issues & Solutions

### iOS Issues

**Issue:** VoIP push not received
- **Solution:** Must test on physical device, not simulator
- **Solution:** Check certificate is not expired
- **Solution:** Ensure aps-environment is "production" in release builds

**Issue:** App doesn't wake up
- **Solution:** Verify PushKit delegate is registered
- **Solution:** Check Background Modes capability includes "Voice over IP"

### Android Issues

**Issue:** FCM not working
- **Solution:** Verify google-services.json is in correct location
- **Solution:** Check Firebase Server Key is correct
- **Solution:** Ensure app has notification permissions

**Issue:** App killed by battery optimization
- **Solution:** Request battery optimization exemption
- **Solution:** Use FCM high priority messages

### Twilio Issues

**Issue:** Invalid push credential SID
- **Solution:** Verify credential is created in correct Twilio account
- **Solution:** Check environment variables are set correctly

**Issue:** Push sent but not received
- **Solution:** Verify push token is current (tokens can expire)
- **Solution:** Check device is online and has connectivity

## Production Considerations

### Token Refresh
- Push tokens can expire or change
- Implement periodic token refresh (every 24 hours)
- Re-register on app launch

### Multiple Devices
- User might have multiple devices (iPhone + iPad)
- Store all device tokens
- Send push to all registered devices

### Token Cleanup
- Remove tokens for devices that haven't been active in 30+ days
- Handle invalid token responses from APNS/FCM

### Monitoring
- Log push notification delivery success/failure
- Alert if push delivery rate drops below threshold
- Track time from push sent to app wake

### Fallback Strategy
- If push fails, try regular phone call as fallback
- Send SMS alert if all else fails

## Dependencies to Install

```bash
# iOS VoIP
npm install react-native-voip-push-notification

# Android FCM
npm install @react-native-firebase/app @react-native-firebase/messaging

# Both platforms
npm install @react-native-community/push-notification-ios
```

## Cost Breakdown

### One-Time Costs
- Apple Developer Program: **$99/year**
- Google Play Console: **$25 one-time**

### Ongoing Costs (Twilio)
- VoIP push notifications: **Free** (included with Programmable Voice)
- Voice minutes: **$0.013/min** (already using)

### Free Services
- Firebase FCM: **Free** (unlimited push notifications)
- Apple APNS: **Free** (unlimited push notifications)

## Timeline Estimate

**With Apple Developer + Firebase accounts ready:**
- iOS setup: **2-4 hours**
- Android setup: **2-3 hours**
- Backend integration: **2-3 hours**
- Testing both platforms: **2-4 hours**
- **Total: 1-2 days**

## Next Steps

1. **Enroll in Apple Developer Program** ($99/year)
   - Wait 24-48 hours for approval
   
2. **Create Firebase Project** (immediate)
   - Add Android app
   - Download google-services.json

3. **Generate Push Certificates**
   - iOS: VoIP Services Certificate
   - Android: FCM Server Key

4. **Upload to Twilio**
   - Create push credentials for both platforms
   - Save credential SIDs

5. **Implement in App**
   - Install dependencies
   - Add native modules
   - Register push tokens
   - Handle incoming notifications

6. **Test End-to-End**
   - Test on physical devices
   - Verify push delivery
   - Confirm calls connect

7. **Monitor & Optimize**
   - Track delivery rates
   - Handle edge cases
   - Optimize battery usage

## Resources

- [Twilio Voice Push Notifications](https://www.twilio.com/docs/voice/sdks/ios/receive-calls-with-push-notifications)
- [Apple PushKit Documentation](https://developer.apple.com/documentation/pushkit)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Twilio Push Credential Guide](https://www.twilio.com/docs/voice/sdks/ios/ios-voice-notification-payload)
