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

2026-01-18
Scope
- Align the remaining settings screens (Blocklist, Automation, Account, Security, etc.) with the refreshed onboarding experience while keeping the interactions familiar.
+ Ensure automation sliders/switches live inside a tactile card + shared footer, and tighten the blocklist manual entry/list layout to match Trusted Contacts.

Frontend work
- Reworked `BlocklistScreen` so manual entry mirrors trusted contacts (inline row + label spacing), added avatar/icon rows for blocked numbers, normalized the tray copy/UI, and tightened the “Current block list” spacing.
- Updated `AutomationScreen` to reuse `SettingsHeader`, `ActionFooter`, and the notifications-inspired card layout; added helper messaging, change detection, and saved footer behavior.
- Standardized the tray, spacing, and slider/toggle language so the remaining settings screens now follow the onboarding design system, keeping labels readable for older users.

Next suggested steps
- Prototype the remaining main pages and confirm the new headers/footers carry over everywhere; continue pairing the settings experience to onboarding before moving on to any backend follow-up.

2026-02-10
Scope
- Centralize support documentation access (resources/billing) across the portal and settings screens, including a dedicated billing page that explains App Store/Play Store charges and support’s role in refunds.
- Surface those resources directly on the Settings support screen via the 2×2 pill grid, keep the headers/hero copy distinct from the portal, and ensure resource navigation can be reached from both locations without going through the portal.
- Improve haptics on support interactions and align resource pills’ visual treatment with the portal design.

Frontend work
- Added billing-focused content (FAQ entry + dedicated resource sections) and a shared `SUPPORT_PORTAL_RESOURCES` list so both portal pills and settings tiles share the same config and navigation targets.
- Enhanced `SupportResourceScreen` to honor the new billing type, choose tailored titles/subtitles/intros, and keep hero copy specific to each resource.
- Surface the resource grid inside Settings above the “Need support” hero while keeping the hero and portal cards underneath with their previous treatments, and wire each tile to `navigateToSupportResource`.
- Applied Expo Haptics to the support quick prompts and resource pills so tapping these controls yields consistent tactile feedback.

Next steps
- Verify the billing resource is reachable from both the portal and the new Settings grid, and that the App Store guidance stays visible even if the user never opens the chat portal.
- Keep observing analytics (if available) for flyers on billing tickets so we can refine the quick prompt wording and the FAQ narrative.

2026-02-12
Scope
- Fix long doctor/contact names overflowing off-screen in Trusted Contacts and Doctor Lookup flows.
- Ensure auto-added doctor entries from lookup do not save giant provider titles that later break list rows.

Frontend work
- Updated Settings Trusted Contacts safe-list rows to enforce real truncation behavior by combining `numberOfLines={1}` with non-shrinking action layout and shrinkable text containers.
- Applied the same truncation/flex constraints to Onboarding Trusted Contacts safe-list rows.
- Updated Doctor Lookup trusted-care-team rows to hard-truncate long labels and prevent overflow with `minWidth: 0` + clipped row layout.
- Added provider-name normalization before saving trusted contacts from Doctor Lookup so newly added doctors store compact names instead of long registry strings.

Files touched
- `frontend/src/screens/settings/TrustedContactsScreen.tsx`
- `frontend/src/screens/onboarding/OnboardingTrustedContactsScreen.tsx`
- `frontend/src/screens/settings/DoctorLookupScreen.tsx`
- `frontend/src/services/professionalLookup.ts`

Result
- Long names in current safe lists now truncate instead of running off the right edge.
- New doctor entries added from lookup are shorter by default, reducing repeated overflow issues.

2026-02-13 to 2026-02-14

Scope
- Complete iOS VoIP + push setup for Twilio call bridging.
- Stabilize local iOS build tooling (Ruby/CocoaPods/Xcode) for native device testing.
- Ship alert push notifications (with deep links) and trusted-call activity surfacing.
- Expand Support to work during onboarding (pre-profile) and carry state after profile creation.

Platform and infra work
- Completed Apple capability/config steps for iOS calling stack:
  - Push Notifications enabled.
  - Background Modes enabled for `Remote notifications` and `Voice over IP`.
  - VoIP credential created/exported and uploaded to Twilio Mobile Push Credentials (APN).
- Resolved local CocoaPods/Ruby environment churn by standardizing on rbenv-managed Ruby + working pod flow in project context.
- Confirmed Twilio client token issuance includes push credential SID and periodic heartbeat.

VoIP and call bridging outcomes
- Twilio Voice client registration and incoming invite handling now works on physical iOS device.
- Trusted caller bridge path now successfully dials `client:profile-...` and connects to in-app call flow.
- Verified loop-avoidance behavior for trusted caller handling (bridge path no longer re-dials forwarded number flow).
- Added/validated backend logging around bridge attempts, dial status, and token issuance.

Push notification work
- Added alert push dispatch pipeline for app alerts (server-side dispatcher + routing metadata).
- Implemented push payload routing/deep-link mapping (fraud -> call detail, trusted -> calls filtered view, fallback -> alerts).
- Added per-profile push rate limit behavior (target: max 1 per 60 seconds).
- Device token registration/upsert confirmed in Supabase (`profile_device_tokens` rows created).

Trusted activity and UI work
- Added trusted bridge activity surfacing in app activity feeds.
- Updated home/calls treatment for trusted activity cards (non-drilldown where intended, visual label cleanup).
- Added long-press tray actions for trusted entries to support deletion flow similar to handled alerts.
- Fixed section behavior so closed support conversations are classified into handled/muted section.

Support system expansion
- Added onboarding/pre-profile support message flow (setup tickets/messages).
- Added setup assistant-status endpoint and setup ticket listing endpoint.
- Added setup ticket creation with initial auto greeting.
- Added merge behavior to carry onboarding support history into profile support context after profile creation.
- Improved auto-reply logic so setup auto message triggers only on first user message in a ticket.
- Fixed unread behavior to be ticket-scoped (opening one conversation only clears that conversation).

Account/data lifecycle updates
- Improved account deletion-related cleanup paths, including Twilio number release back to pool (`available`) during owner deletion flow.
- Added/updated scripts/flows for Twilio number pool sync/upsert and release verification.

Known issues and in-progress items
- Sign in with Apple setup progressed (Identifiers/Service ID/keys/Supabase provider config), but end-to-end auth exchange had intermittent `Unable to exchange external code` errors during this session; needs final validation.
- Expo debug log noise still appears in dev for `expo-notifications` appId validation (`"appId": Expected string, received null`) even when backend/device token registration succeeds; not blocking verified backend push dispatch but should be cleaned up.
- Backend full TypeScript check still reports pre-existing test alias resolution issues in `backend/tests/*` (not introduced by support/voip changes in this session).

Verification done
- Call bridge test from trusted contacts completed with in-app incoming call and two-way audio connection.
- Push dispatch logs show successful sends for generated alerts, and at least one closed-app push delivery was observed on device.
- Setup support tickets/messages creation and history rendering tested, including handoff behavior post-onboarding.
