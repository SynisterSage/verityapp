Session Summary (2026-01-05 to 2026-01-06)

Scope
- Twilio voice webhooks, recording storage, and transcription
- Supabase schema + RLS + storage policies for calls, alerts, and blocklist
- Fraud detection heuristics and alerting workflow
- Frontend auth + onboarding + dashboard UI polish

Backend work
- Switched email provider references to Resend in docs.
- Added Twilio call-in + recording-ready webhooks; fixed TwiML and callbacks.
- Stored recordings in Supabase Storage (private bucket) and persisted call rows.
- Added Azure transcription ingestion and saved transcripts to calls.
- Added secure signed URL endpoint for recordings with auth gating.
- Added fraud detection pipeline with scoring, notes, keywords, alerts, and auto-block support.
- Added blocked callers table + RLS + timestamps.
- Added call feedback fields and fraud settings endpoints.
- Added Twilio signature validation + rate limiting.

Supabase migrations
- Base schema: profiles, profile members, calls; RLS for caretaker + members.
- Storage bucket/policies for private recordings.
- Call transcript fields.
- Fraud fields + alerts + safe phrases + blocklist.
- Profile preferences + invites.
- Policy fixes to avoid recursion.

Frontend work
- Implemented Google OAuth + email auth flow with Expo Auth Session.
- Fixed redirect/deeplink handling for Expo Go.
- Implemented onboarding flow that upserts profiles + preferences.
- Built dashboard navigation (Home, Calls, Alerts, Settings) with a custom dock.
- Added call detail playback with signed URLs and safe UI states.
- Added skeleton loaders on Home, Calls, Alerts, Safe Phrases, Blocklist.
- Normalized safe-area spacing and headers across screens.
- Added 401 handling to force sign-out and avoid onboarding lock-in.

Known pain points addressed
- SIP 603 outbound call declines on Twilio (carrier-side).
- Expo auth redirect loops and local web fallback.
- UI jitter during data fetch; now uses skeleton overlays.
- RLS recursion errors on profiles; simplified policies.

Testing outcomes
- Call-in, recording-ready, transcript, fraud scoring, alerts, and storage uploads verified.
- OAuth login verified; onboarding upserts confirmed.
- Recording playback via signed URL verified in call detail.

Next suggested steps
- Finish home dashboard data wiring (recent activity + alerts counts).
- Add push notification integration scaffolding.
- Revisit fraud thresholds after collecting real-world samples.
- Prepare production hosting (replace ngrok) and configure Twilio webhooks.

2026-01-06
Backend
- Added trusted contacts table + endpoints and allowlist logic for Twilio inbound calls.
- Skipped recording/transcription for trusted callers and created lightweight alerts for them.
- Strengthened fraud detection with strict tax and bank/fraud impersonation phrases and scoring.
- Added profile update/delete endpoints to support account management.

Frontend
- Built Trusted Contacts settings with native contact picker (iOS + Android), sync logic, and local contact name mapping.
- Added Trusted Contacts to onboarding and implemented call forwarding tutorial step.
- Added Account, Notifications, Security, and Change Passcode settings screens.
- Added call forwarding screenshots and improved onboarding layout and scrolling.
- Fixed navigation/dock behavior on nested settings, plus UX tweaks (keyboard dismiss, save flows).

Native
- Prebuilt native projects and added custom ContactPicker modules for iOS/Android.
- Added contact permissions to app config and wired JS bridge.

Operational notes
- iOS build requires proper signing and a unique bundle identifier.
- Expo Go cannot load custom native modules; use dev client builds for contact picker.
