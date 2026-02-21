# Verity Protect Launch, Ops, and Pricing Plan

**Date:** February 21, 2026
**Scope:** Product readiness + operations + legal/security hardening + subscription economics

## 1) What We Completed Recently (High-Level)

### Calls and Alerts UX/System
- Calls header counts now respect each filter correctly (including trusted in All).
- Calls filter and alerts filter UI were cleaned up for consistency and less visual clutter.
- Trusted activity visuals/icons were normalized across calls and home activity.
- Long-press tray interactions were standardized (press animation + swipe-down/tap-outside behavior).
- Delete actions in Calls header were scoped to handled/archive/trusted-style categories (not unresolved risk/verified).
- Routing and payload normalization work was done for alerts/push handling.

### Notifications + Support
- Added support-reply push behavior (human agent replies only, no auto-reply spam).
- Added support reply notification preference wiring.
- Added custom activity notification sound support and iOS asset wiring.
- Added/updated support contact options in settings.

### Security/Legal Hardening
- Added/updated legal version tracking behavior and legal doc date alignment.
- Added backend hardening work around CORS/internal ops controls/retention-related guardrails.
- Restored safer signup email check behavior with generic messaging pattern while keeping pre-submit validation UX.

## 2) Current Product Direction (Planned + Agreed)

### Alerts UX direction (older audience, low confusion)
- Use two top-level buckets only:
  - `Needs Attention`
  - `History`
- Keep high-risk alerts obvious and non-destructive.
- Allow long-press/delete actions only for non-priority/history-like items.
- Keep interaction model consistent with Calls (same filter placement and visual language).

### Calls UX direction
- Keep horizontal pills (compact) but avoid harsh clipping and visual jank.
- Keep trusted activity compact and visually consistent with other cards.
- Preserve long-press behavior for now (bulk actions planned separately later).

## 3) Cost Model (Updated)

## Known recurring costs right now
- Render Professional: **$19/month**
- Domain: **~$10/year** (~$0.83/month)
- Apple Developer Program: **$99/year** (~$8.25/month)
- Resend: currently free tier (until volume increases)

### Twilio rates provided
- Local number: **$1.15/month/number**
- Inbound voice: **$0.0085/min**
- Outbound forwarded voice: **$0.0140/min**
- Recording: **$0.0025/min**
- Recording storage: first 10,000 min free, then **$0.0005/min-month**

### Moderate usage profile model (your current assumption)
Assumption per profile/month:
- 30 inbound minutes
- 25% of inbound minutes forwarded outbound (7.5 min)
- Recording enabled on inbound minutes

Cost math per profile/month:
- Number: `1.15`
- Inbound: `30 * 0.0085 = 0.255`
- Outbound: `7.5 * 0.014 = 0.105`
- Recording: `30 * 0.0025 = 0.075`
- Total: `1.15 + 0.255 + 0.105 + 0.075 = 1.585` => **~$1.59/profile/month**

## 4) Number Pool Planning

### Initial launch pool
- 50-number pool baseline cost: `50 * 1.15 = $57.50/month`

### Scaling note
- If each paid profile needs a dedicated number, Twilio number cost scales linearly with active paid profiles.
- If you exceed 10,000 recorded minutes total/month, add storage overage.

## 5) Subscription Recommendation

### Recommended starting price
- **$9.99/month**
- **$99/year** (effective $8.25/month, ~17% discount)

Why this works now:
- Keeps pricing simple for older/family buyers.
- Large margin above current per-profile telecom cost under moderate usage.
- Leaves room for support, fraud model improvements, and infra growth.

## 6) Revenue Scenarios

## Example: 1,500 paid profiles
Assume all monthly at $9.99 and Apple Small Business Program 15% fee.

- Gross monthly revenue: `1,500 * 9.99 = $14,985`
- After 15% platform fee: `14,985 * 0.85 = $12,737.25`

Estimated monthly operating costs at moderate usage:
- Twilio usage + number (1.59/profile): `1,500 * 1.59 = $2,385`
- Recording storage overage estimate:
  - 45,000 recorded minutes total - 10,000 free = 35,000 paid
  - `35,000 * 0.0005 = $17.50`
- Render + domain + Apple monthlyized: `19 + 0.83 + 8.25 = $28.08`
- Total estimated monthly costs: `2,385 + 17.5 + 28.08 = $2,430.58`

Estimated monthly contribution (before taxes, chargebacks, support payroll, misc tools):
- `12,737.25 - 2,430.58 = $10,306.67`

Estimated annualized contribution at this level:
- `10,306.67 * 12 = $123,680.04`

## 7) Important Caveats

- This is not full GAAP net profit; it excludes labor, legal counsel, refund/chargeback rates, analytics tooling, and future paid tiers (Supabase/Resend/etc).
- If call forwarding % or total minutes rise materially, Twilio variable costs rise quickly.
- If app growth increases storage/egress significantly, Supabase free tier may stop being enough.
- App Store / payment fees may vary by region/program status.

## 8) Short Action Plan Before Release

1. Lock launch price (`$9.99/mo`, `$99/yr` suggested) and trial policy.
2. Add billing dashboard metrics (MRR, churn, failed renewals, refund rate).
3. Add Twilio usage budget alerts (minutes, recordings, number inventory).
4. Define number-pool expansion trigger (ex: auto-provision when <10 unassigned numbers).
5. Confirm legal/version screens and consent logging remain aligned with latest website terms/privacy dates.
6. Run final notification routing QA matrix (alert type -> route destination) on iOS test build.

## 9) Quick Answer to "Is revenue after costs?"

- **Gross revenue** = subscription money collected before platform/infra costs.
- **Net contribution (this doc’s scenario)** = revenue after app-store fee and current estimated infra/telecom costs.
- At 1,500 paid profiles in the moderate usage model above: **~$10.3k/month contribution**.

