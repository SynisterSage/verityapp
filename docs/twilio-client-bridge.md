# Twilio Client Bridge Status & Next Steps

## What’s working today

- The backend checks for a “fresh” `twilio_client_last_seen_at` timestamp on each profile and, when it exists, emits a `<Dial><Client>profile-{id}</Client></Dial>` (`backend/src/controllers/TwilioController.ts`). Logs indicate the trusted flow is hitting that branch (`Trusted caller bridged client=profile-…`), so Twilio is dialing the client identity instead of the carrier-forwarded PSTN number.
- `/profiles/:profileId/twilio-client/token` mints a Voice JWT (uses the new API key/secret env vars + TTLs) and `/heartbeat` keeps the profile marked as available (`backend/src/controllers/TwilioClientController.ts`, `supabase/migrations/20260114123000_add_twilio_client_fields.sql`).
- `ProfileContext` fetches the token, stores identity/token/heartbeat flags, and exposes `isTwilioClientReady` plus `refreshTwilioClientSession` (`frontend/src/context/ProfileContext.tsx`).
- `TwilioVoiceClientManager` initializes the native SDK when `isTwilioClientReady` is true, keeps the heartbeat timer active, and auto-accepts incoming `<Client>` invites while logging the device/ invite events (`frontend/src/components/twilio/TwilioVoiceClientManager.tsx`).
- An `iOS` build with `react-native-twilio-programmable-voice` is installed and pods reinstalled, so the native module exists in your app bundle and the app tries to register softphones whenever a token is provided.

## Current blocker on iOS

- iOS requires a VoIP Push Credential (VoIP certificate) so Twilio can deliver incoming `<Client>` call invites via Apple’s VoIP services. Without it the SDK never receives the invite, so Twilio reports `DialCallSid=undefined` with `sip=480` and the call bails out after “Thank you. Connecting your call.”
- Apple only issues that VoIP certificate once you enroll in the [Apple Developer Program](https://developer.apple.com/programs/). That membership is required to request VoIP provisioning profiles, enable the `voip` background mode in `Info.plist`, and upload the certificate to Twilio.
- Until that credential exists, the native client cannot answer incoming Twilio pushes, so the bridge is effectively stuck at `No Answer`. The app can still fall back to the previous PSTN path while you wait on the Apple Dev enrollment, but the `<Client>` leg simply won't reach the device.

## Next steps once Apple Developer access exists

1. **Generate VoIP cert** – Create a VoIP Services certificate in Apple Developer, export it as `.p12`, convert to PEM, and use the Twilio CLI to upload it:
   ```
   openssl pkcs12 -in apple_voip.p12 -nokeys -out cert.pem
   openssl pkcs12 -in apple_voip.p12 -nocerts -out key.pem
   twilio api:voice:v1:credentials:create --type=apn --friendly-name="verdict-voice" --certificate="$(cat cert.pem)" --private-key="$(cat key.pem)"
   ```
2. **Enable `voip` background mode** – Add `UIBackgroundModes` → `voip` to `ios/<proj>/Info.plist` so VoIP pushes can wake the app.
3. **Update tokens** – Persist the push credential SID and pass it into the Voice token grant so Twilio knows which push credential to use when crafting the client invite.
4. **Rebuild app** – After the certificate/entitlement is in place, rebuild the iOS app so the native module registers the device token with the VoIP push service.
5. **Verify invites** – Call the Twilio number from a trusted number. The Metro console should log `TwilioVoice device ready` and `TwilioVoice incoming invite …`, and `/webhook/twilio/dial-status` will now show a real `DialCallSid` (no more `sip=480`).

## Diagnostic hints

- Use the console logs added to `TwilioVoiceClientManager`: look for `TwilioVoice device ready`, `TwilioVoice incoming invite …`, and `TwilioVoice device not ready …` to confirm the native client registration and incoming push delivery.
- Use the backend logs no volley: `Trusted caller bridged client=…` plus the dial status log to confirm the bridge targeted the client identity.
- Until VoIP push is configured you can still test the fallback PSTN path over the forwarded number; once you have the VoIP certificate you’ll see the full softphone path light up.

Prepare the VoIP steps (generate cert, run the OpenSSL/Twilio CLI commands, enable voip background mode) and hold them until you’ve enrolled.