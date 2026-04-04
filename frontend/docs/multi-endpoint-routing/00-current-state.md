# 00 - Current State (Codebase Reality)

Release context: `v1.0.4` planning

This captures what is currently true in this frontend repo so implementation does not drift.

## Current Profile Data Shape (Frontend)

The active profile type currently assumes:

- `phone_number` (single recipient number)
- `fallback_phone_number` (single optional fallback)
- `twilio_virtual_number` (single Verity ingress number)

Reference:
- [`src/context/ProfileContext.tsx`](/Users/lex/Desktop/safecall/frontend/src/context/ProfileContext.tsx#L46)

## Current Profile Write Paths

Profile create/update currently write only legacy fields:

- Create: `phone_number`, `fallback_phone_number`, `twilio_virtual_number`
- Update: `phone_number`, `fallback_phone_number`

References:
- [`src/screens/onboarding/CreateProfileScreen.tsx`](/Users/lex/Desktop/safecall/frontend/src/screens/onboarding/CreateProfileScreen.tsx#L138)
- [`src/screens/settings/AccountScreen.tsx`](/Users/lex/Desktop/safecall/frontend/src/screens/settings/AccountScreen.tsx#L234)

## Current Product Messaging in App

Existing UI/help copy describes:

- one Verity number used for forwarding and screening
- app-first behavior with fallback route
- warning about forwarding loops

References:
- [`src/screens/onboarding/OnboardingCallForwardingScreen.tsx`](/Users/lex/Desktop/safecall/frontend/src/screens/onboarding/OnboardingCallForwardingScreen.tsx#L62)
- [`src/data/resourceSections.ts`](/Users/lex/Desktop/safecall/frontend/src/data/resourceSections.ts#L20)
- [`src/components/common/ReliableFallbackInfoModal.tsx`](/Users/lex/Desktop/safecall/frontend/src/components/common/ReliableFallbackInfoModal.tsx#L114)

## Constraint This Creates

If multi-endpoint routing is introduced without backward compatibility, existing users can break.

Required compatibility posture:

1. Legacy fields remain valid throughout rollout.
2. Legacy routing path stays available as immediate fallback.
3. Frontend must tolerate profiles that have no endpoint-array data yet.

## Ingress-Aware Target (Delta)

Current app does not yet model ingress-aware behavior.

For `v1.0.4`, ingress-aware routing decisioning will live in backend webhook logic, while frontend remains mostly field collection and settings display.
