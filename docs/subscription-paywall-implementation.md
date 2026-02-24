# Subscription Paywall Implementation

## Context
Verity Protect is a paid-first service. Every new profile requires a subscription because we provision a Twilio number, recording, and background infrastructure. We gate the app before onboarding so paying customers are the only ones that consume those costs. This document lays out the work for connecting the auto-renewable subscriptions, building the review-friendly paywall, and storing receipt state.

## Frontend (App)
1. **Paywall screen (pre-onboarding)**
   - Build `MembershipScreen` presented modally before account creation.
   - Copy: “Trusted-call shield, instant risk alerts, prioritized trusted routing for your family.”
   - Price tiles for $9.99/mo and $99/yr + benefits list.
   - Subscription CTA buttons call `purchaseProduct("verityprotect_monthly")` / annual.
   - Provide alternate CTA for “Why pay?” that opens the mock walkthrough/benefits screen we already capture for the review screenshot.
   - Show progress indicator during transactions; background theme is your shield gradient.
   - When the paywall loads, allow the user to open a brief “How Verity Works” tour (see below) that explains the service, flows, and value before purchase, so Apple reviewers and customers understand the app without an account.
2. **Mock walkthrough (“How Verity Works”)**
   - Create a three-panel carousel or scroll view that animates key steps:
     1. “Point your existing number to Verity Protect; we screen every incoming call.”
     2. “Trusted contacts jump the queue and alerts flow to you fast.”
     3. “Every call generates a clean alert/history view so you always know what happened.”
   - These slides should appear before the CTA buttons or on a modal so it’s visible without requiring a completed purchase.
   - Capture the walkthrough screen for use in the IAP metadata if the paywall alone isn’t enough context.
2. **StoreKit integration**
   - Use `SKProductsRequest` to fetch the two product IDs.
   - `SKPaymentQueue` handles transactions; on `.purchased` call backend `POST /subscriptions/verify` with receipt.
   - Provide failure alerts, especially for sandbox (requires login). Use spinner + disable other controls while the queue is busy.
3. **Post-purchase flow**
   - On successful receipt validation, mark onboarding as allowed and proceed to `CreateProfileScreen`.
   - Tie receipt token plus expiration to user profile (`subscriptions` column in Supabase).
   - Provide UI showing “Subscription active until…” on the home screen.
4. **Review screenshot**
   - Capture the paywall screen on an iPhone simulator (Screenshot > 1170×2532). Use that file for the subscription review screenshot metadata.

## Backend
1. **Receipt validation endpoint**
   - `POST /subscriptions/verify` takes `profileId`, `productId`, `receiptData`.
   - Use Apple’s receipt verification API with the App-Specific Shared Secret (store env var `APPLE_SHARED_SECRET`).
   - Record `receipt_status`, `expires_date`, and `transaction_id` in `profiles` table or a dedicated `subscriptions` table. Set `subscribed = true` when valid.
   - Return status and expiry for the app.
2. **Subscription guard**
   - Middleware ensures new profiles can only be created when `subscribed` flag is true or a recent valid receipt exists.
   - Provide endpoints for status checks (support/restore purchases) that call the backend to revalidate the stored receipt if the app requests.
3. **Infra monitoring**
   - Emit logs when new subscriptions spin up (Twilio number assigned).
   - Track receipt expiration so we know when to reprovision or warn users.

## Review and QA
- Document sandbox credentials in App Review notes (test account + Safety PIN) plus steps to enter the paywall and tap on the product.
- Use the paywall screenshot as the subscription review asset.
- Test: purchase monthly/annual via Sandbox and confirm backend sets `subscribed=true`, Twilio number provisioned, onboarding unlocks.
 - Validate the “How Verity Works” tour appears before purchase and clearly explains the flow so reviewers understand the service even though the app is gated.

## Session Summary
- Created blocking paywall screen to explain membership value; screenshot doubles as subscription review asset.
- Integrated StoreKit purchase flow to fetch `verityprotect_monthly` / `verityprotect_annual`, queue transactions, and display errors.
- Backend receipt verification endpoint records Apple expiry + toggles the user profile subscription state; middleware now gates profile creation until receipt validation completes.
- Added review notes + sandbox account entry to App Review info so testers can follow the flow without login friction.
 - Added a “How Verity Works” explanation/walkthrough so the gated flow still communicates app purpose before the purchase button, keeping the experience understandable for reviewers and families alike.
