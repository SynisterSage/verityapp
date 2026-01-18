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

Session Summary (2026-01-09)

Scope
- Alerts list UX and filters
- Background polling behavior
- Alert card visual treatment

Frontend work
- Added alert filtering (All/New/Critical) with dropdown UI and animated menu.
- Show caller name/number in alerts using trusted contacts map + call lookup fallback.
- Sorted resolved alerts to the bottom and muted non-pending items.
- Added silent background polling (60s) gated by AppState; manual pull-to-refresh unchanged.
- Closed alert filter menu on screen focus to avoid stale open state.

Testing
- Frontend type check: `npx tsc --noEmit`.

2026-01-11

Scope
- Prevent accidental polling loops on account/config screens while keeping focused data fresh.
- Surface safe-phrase matches in the call detail transcript without merging them into the fraud keyword list.

Backend work
- Added a lightweight `GET /api/v1/profiles/:profileId` handler that returns a single profile row for focused screens so we can avoid reloading the entire list.

Frontend work
- Automation, Notifications, and Account screens now call the focused endpoint via `useFocusEffect`, update the context with the returned profile, and no longer reload the app or hit `/profiles/:profileId` repeatedly.
- Dashboard tabs (Home, Calls, Alerts) gate their 60‑second polling timers behind `useIsFocused` so the server only sees those requests while you actually have the tab open.
- Call Detail pulls `fraud_notes.safePhraseMatches` alongside fraud keywords, highlights them with a teal background in the transcript, and renders a “Trusted phrase(s)” block that matches the fraud card styling so trusted language is easy to spot.

Testing
- Manual walkthrough of the account/notifications/automation screens confirmed only one fetch per entry and no reload behavior.
- Verified safe phrases (e.g., “golf”) now highlight in the transcript and appear in the call detail fraud block without being labeled as red keywords.

Members Integration Status

Backend: profile members/invite endpoints added (ProfileMembersController) plus routing and helpers. Invite accept handles both UUIDs and placeholder emails (used when we auto-generate sms-invite-…@verityprotect.sms). RLS unchanged, invite creation now tolerates missing email by inventing a safe placeholder so SMS-only sharing works.
Frontend: Brand-new MembersScreen under Settings, plus main Settings/Account navigation that routes there. The screen lists current members, pending invites, lets admins create SMS-only invites (Messages opens automatically), and exposes copy/share actions per code. “Enter invite code” screen still available for manual redemption. Invite flow refreshes profiles and can highlight the pending area if you land there from onboarding.
Onboarding: Added choice screen with “Create profile” vs “Have an invite code?” paths and the invite-code screen itself so a new user can skip onboarding by redeeming a code. Members screen accepts a highlightInviteEntry flag triggered by this path (still needs testing).
Testing notes: Members flow works end-to-end via the copy/paste code path (no real device SMS yet). Haven’t yet exercised the onboarding “enter invite code” screen or real-device linking.


sat jan 17 26
Shared permissions cache now drives both the Data & Privacy toggle and Trusted Contacts import/sync buttons so the settings screens stay in sync, while Trusted Contacts also shows helpful messaging when contacts access is blocked.
“Manage data” got full backend support (export, clear records, delete profile) plus pin-gated modals, native-sharing for exports, improved error normalization, and centralized delete helpers reused by the Account screen.
The passcode modal now blurs the background, dismisses on outside taps, and keeps the UI consistent, and the manual phone input no longer fights deletions, bringing settings closer to the onboarding style you’ve rolled out.
Onboarding is looking solid—only the test flow still needs a quick pass for minor inconsistencies. You’ve begun refactoring the settings pages to match onboarding; we’ll keep prototyping that tomorrow and then tackle the remaining main screens.