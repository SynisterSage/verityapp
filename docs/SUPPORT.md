# Support System Improvements

## Overview
Captured a full support ticket workflow: the portal, chat screen, settings info page, notification hooks, CLI, and backend surfaces now behave consistently.

## Backend / Supabase
- Added `support_messages` table (with metadata containing ticketId, ticketState, feedback) plus RLS policies for caretakers/members.  (see migration `20260208090000_add_support_messages.sql`).
- Added `assistant_status` table for the dev support persona and an API/controller to get/set it; CLI commands `status online/offline/show` now update this table.
- SupportController filters messages by ticketId, inserts new UUID-based ticket metadata, and exposes unread counts plus mark-read API.
- Dev CLI (`backend/scripts/dev-support.ts`) gained `list history`, `mark-read`, `status`, delete, close, feedback summaries, and commands to send replies while honoring metadata. `list history` now dumps each ticket timeline.

## Frontend context
- `SupportContext` tracks unread counts/assistant status, exposes `playNotificationSound`, and triggers the shared `support-notification.wav` whenever new agent replies arrive or unread count increases.
- `SupportButton`, portal headers, and settings support info screen all read from `SupportContext` so the badge/status text stays in sync.

## Support Portal (`SupportTicketsScreen`)
- Active/handled sections separated, with unread badge overlay on active icons.
- Long-press tray now offers End/Delete; End now navigates to the chat with `autoEnd` flag to trigger the existing end-ticket flow automatically.
- Adjusted spacing/padding to align cards, used dashboard header, and shared action footer from other screens.

## Chat Screen (`SupportScreen`)
- Uses shared notification sound, reads `autoEnd` flag to auto-open feedback flow, and displays statuses/dates per style tokens.
- Maintains ticket metadata, auto-infers ticketId from metadata, and surfaces `feedback` responses in the timeline.
- Added success animation and ensured composer/resizable layout matches design.

## Support Info Screen
- Converted to settings-style layout with `SettingsHeader`, matching safe-area treatment, card spacing, and borderline treatments from `AccountScreen`.
- Simplified hero copy (“Need support”), removed secondary FAQ card, and renamed CTA to “Support portal”.
- Email row now opens `mailto:` and there is consistent spacing/padding to prevent clipping at the bottom.

## Home Screen
- `NeedAssistanceCard` now just invokes `navigateToSupportPortal` so the card opens the chat instead of navigating to Settings.

## Testing / Validation
- Run `npm run dev-support list history` to inspect CLI history output.
- Use `SupportContext` badge/unread to confirm notification sound and counts are synced across home, calls, alerts, and settings headers.
