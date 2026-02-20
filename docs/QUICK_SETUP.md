# Quick Setup Checklist - VoIP Push Notifications

Follow these steps to complete the setup. Total time: ~15 minutes.

## ✅ Step 1: Get Apple Team ID

1. Open https://developer.apple.com/account/#/membership/
2. Copy your **Team ID** (10 characters)

Your Key ID is: `YOUR_APNS_KEY_ID` (from your existing auth key)

## ✅ Step 2: Configure Backend

Edit `/Users/lex/Desktop/safecall/backend/config/.env`:

```bash
# Add these lines:
APNS_AUTH_KEY_PATH=/absolute/path/to/AuthKey_<YOUR_APNS_KEY_ID>.p8
APNS_AUTH_KEY_ID=YOUR_APNS_KEY_ID
APNS_TEAM_ID=PASTE_YOUR_TEAM_ID_HERE
IOS_BUNDLE_IDENTIFIER=com.lexferguson.verityprotect.com
APNS_PRODUCTION=false
```

## ✅ Step 3: Run Database Migration

```bash
cd /Users/lex/Desktop/safecall
npx supabase migration up
```

## ✅ Step 4: Install Frontend Dependencies

```bash
cd /Users/lex/Desktop/safecall/frontend
npm install
cd ios
pod install
```

## ✅ Step 5: Add Push Capability in Xcode

```bash
cd /Users/lex/Desktop/safecall/frontend/ios
open VerityProtect.xcworkspace
```

In Xcode:
1. Select **VerityProtect** target (top left)
2. Click **Signing & Capabilities** tab
3. Click **+ Capability** button (top left of capabilities area)
4. Search for "Push Notifications"
5. Double-click to add it

## ✅ Step 6: Build and Test

1. Connect a **physical iOS device** (VoIP push doesn't work on simulator)
2. Build and run from Xcode (Cmd+R)
3. Log in to the app
4. Check console logs for:
   ```
   [VoIPPush] Registered for VoIP push notifications
   [VoIPPush] Token updated on backend
   ```
5. **Kill the app** completely (swipe up in app switcher)
6. Have someone call your Twilio number
7. The iOS call screen should appear **instantly**
8. Answer to verify the call connects

## Done! 🎉

Your app now wakes for incoming calls, even when killed. No more unwanted fallback calls to family/caretakers.

## If Something Goes Wrong

Check:
- [ ] Backend logs show "APNs VoIP provider initialized"
- [ ] Frontend logs show "[VoIPPush] Token updated"
- [ ] Using a real device (not simulator)
- [ ] Team ID and Key ID are correct in .env
- [ ] Auth key file path is correct
- [ ] Push Notifications capability was added in Xcode

See `VOIP_PUSH_SETUP.md` for detailed troubleshooting.
