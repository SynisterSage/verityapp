# Sentry Integration Summary

## Overview
We wired Sentry for both backend (Node/Express) and frontend (React Native). This includes capture helpers, test routes, and instrumented user flows so errors and key events are visible in Sentry.

## Backend (Node/Express)

### What was added
- Sentry initialization and middleware setup in [backend/src/config/sentry.ts](../backend/src/config/sentry.ts)
- Test routes to generate events in [backend/src/routes/sentry-test.ts](../backend/src/routes/sentry-test.ts)
- Sentry initialization order fixed to run before Express instrumentation in [backend/src/server.ts](../backend/src/server.ts)

### Backend flow
- Sentry is initialized early (before Express import) to ensure correct instrumentation.
- Express middleware is attached after app creation.
- Test endpoints are available at:
  - /sentry-test/test-error
  - /sentry-test/test-message
  - /sentry-test/test-performance

### Key configuration
- `SENTRY_DSN` is read from environment (Render).
- Debug logging disabled in production.
- `tracesSampleRate` set to 0.1 (10% sampling for performance traces).
- Sensitive headers stripped in `beforeSend`.

## Frontend (React Native)

### What was added
- Sentry init in [frontend/App.tsx](../frontend/App.tsx)
- DSN read from `EXPO_PUBLIC_SENTRY_DSN` env
- Sentry helper functions in [frontend/src/services/sentry.ts](../frontend/src/services/sentry.ts)

### Event instrumentation added
**Auth & Onboarding**
- Sign in/out and onboarding events in:
  - [frontend/src/screens/auth/SignInScreen.tsx](../frontend/src/screens/auth/SignInScreen.tsx)
  - [frontend/src/screens/auth/SignUpScreen.tsx](../frontend/src/screens/auth/SignUpScreen.tsx)
  - [frontend/src/screens/auth/ConfirmEmailScreen.tsx](../frontend/src/screens/auth/ConfirmEmailScreen.tsx)
  - [frontend/src/screens/onboarding/PasscodeScreen.tsx](../frontend/src/screens/onboarding/PasscodeScreen.tsx)
  - [frontend/src/screens/onboarding/OnboardingChoiceScreen.tsx](../frontend/src/screens/onboarding/OnboardingChoiceScreen.tsx)
  - [frontend/src/screens/onboarding/OnboardingInviteCodeScreen.tsx](../frontend/src/screens/onboarding/OnboardingInviteCodeScreen.tsx)

**Fraud & Call UX**
- Call views, marking safe/fraud, block/trust, voice feedback:
  - [frontend/src/screens/dashboard/CallsScreen.tsx](../frontend/src/screens/dashboard/CallsScreen.tsx)
  - [frontend/src/screens/dashboard/CallDetailScreen.tsx](../frontend/src/screens/dashboard/CallDetailScreen.tsx)
  - [frontend/src/screens/dashboard/AlertsScreen.tsx](../frontend/src/screens/dashboard/AlertsScreen.tsx)

**Notifications**
- Push permission and token errors:
  - [frontend/src/context/ProfileContext.tsx](../frontend/src/context/ProfileContext.tsx)
- Notification open events:
  - [frontend/App.tsx](../frontend/App.tsx)

**Networking**
- API errors and timeouts logged in:
  - [frontend/src/services/backend.ts](../frontend/src/services/backend.ts)

**Settings**
- Safe phrases, notification prefs, automation, security:
  - [frontend/src/screens/settings/SafePhrasesScreen.tsx](../frontend/src/screens/settings/SafePhrasesScreen.tsx)
  - [frontend/src/screens/settings/NotificationsScreen.tsx](../frontend/src/screens/settings/NotificationsScreen.tsx)
  - [frontend/src/screens/settings/AutomationScreen.tsx](../frontend/src/screens/settings/AutomationScreen.tsx)
  - [frontend/src/screens/settings/SecurityScreen.tsx](../frontend/src/screens/settings/SecurityScreen.tsx)

## Environment & Secrets
- Backend uses `SENTRY_DSN` in Render.
- Frontend uses `EXPO_PUBLIC_SENTRY_DSN` in `.env`.
- Sentry auth tokens were removed from:
  - [frontend/ios/sentry.properties](../frontend/ios/sentry.properties)
  - [frontend/android/sentry.properties](../frontend/android/sentry.properties)

## How to Test
**Backend**
- Call `/sentry-test/test-message` or `/sentry-test/test-error` to generate events.

**Frontend**
- Events fire during real flows (sign in, onboarding, calls, settings). Use Sentry feed to verify.

## Next Steps
- Keep `tracesSampleRate` at 0.1 unless you need more performance sampling.
- Add or adjust events in [frontend/src/services/sentry.ts](../frontend/src/services/sentry.ts) if noise becomes high.
