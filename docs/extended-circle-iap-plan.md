# Extended Circle — IAP Feature Plan

## Overview

Extended Circle is a one-time in-app purchase that unlocks higher member limits for power users who need larger protection circles — large families, multi-generational households, or professional caretaker teams.

All subscribers (monthly/annual) receive a base circle. Extended Circle is a pure upsell with no recurring cost.

---

## Circle Limits

| Tier | Caretakers (admins) | Family Members | Total |
|------|--------------------|--------------------|-------|
| Subscriber (all plans) | 2 | 5 | 7 |
| + Extended Circle IAP | 5 | 15 | 20 |

**Why these numbers:**
- 2 caretakers covers the vast majority of use cases (spouse + adult child, or two siblings)
- 5 family is a typical household
- Extended Circle targets multi-generational families, large households, or users with professional care teams
- 20 total is generous enough to feel premium without creating server abuse risk

---

## Pricing Strategy

### Recommended Price: **$14.99 one-time**

| Platform fee | Net to you (per purchase) |
|-------------|--------------------------|
| Apple 30% (standard) | $10.49 |
| Apple 15% (Small Business Program) | $12.74 |

**Why one-time, not subscription:**
- Users resist paying monthly for a "seat count" — it feels like a tax
- One-time purchase increases conversion rate for this type of limit unlock
- Reduces churn risk vs. stacking subscriptions
- Simplifies refund/support surface

**Alternative to consider post-launch: $9.99** — lower barrier, higher attach rate, test with A/B if volume supports it.

---

## Revenue Model

### Unit Economics

Assume you're on Apple Small Business Program (15% fee, requires <$1M/year prior year revenue).

| Metric | Value |
|--------|-------|
| IAP price | $14.99 |
| Apple fee (15%) | $2.25 |
| Net per purchase | **$12.74** |
| Cost to serve extended user (infra delta) | ~$0.50/month additional (more Twilio events, more DB rows) |
| Payback period at $12.74 net | ~1 month of delta infra cost |

### Revenue Scenarios

| Extended Circle attach rate | Monthly subscribers needed | Monthly IAP gross | Monthly IAP net (15% fee) |
|---------------------------|---------------------------|------------------|--------------------------|
| 5% of 500 subs | 25 purchases | $374.75 | $318.50 |
| 10% of 500 subs | 50 purchases | $749.50 | $637.00 |
| 10% of 2,000 subs | 200 purchases | $2,998 | $2,548.30 |
| 15% of 5,000 subs | 750 purchases | $11,242.50 | $9,556 |

> Note: One-time purchases taper off as your subscriber base stabilizes. Peak revenue is during growth phases. Budget conservatively at 5–8% attach.

### Blended Revenue (Subscription + IAP) at 1,000 subscribers

Assuming $9.99/month subscription, 7% Extended Circle attach rate (70 IAP purchases during growth month):

| Revenue stream | Gross | Net (after Apple 15%) |
|---------------|-------|----------------------|
| Subscriptions (1,000 × $9.99) | $9,990 | $8,491.50 |
| Extended Circle IAP (70 × $14.99) | $1,049.30 | $891.91 |
| **Total** | **$11,039.30** | **$9,383.41** |
| Estimated infra/telecom (1,000 profiles) | — | ~$1,617 |
| **Estimated net contribution** | — | **~$7,766/month** |

---

## Implementation Plan

### Phase 1 — Hard Limits (pre-launch, ~1 day)

Enforce base limits server-side only. No IAP yet — just return a clear error when limits are hit.

**Backend:**
- Add `enforceCircleLimits(userId, profileId, role)` helper in `ProfileMembersController`
- On `inviteMember` / `acceptInvite` / `addMember`, check current count vs limit
- Return `{ error: 'circle_limit_reached', limitType: 'caretaker' | 'family', current: N, max: N }` with HTTP 403
- Read limits from a constants file so they're easy to change

**Frontend:**
- When API returns `circle_limit_reached`, show a simple `Alert.alert` for now: "Circle full — upgrade coming soon"
- Show `X / 5` count near the invite button on MembersScreen

**Estimated effort:** 4–6 hours

---

### Phase 2 — Extended Circle IAP (v1.1, ~3–4 days)

**App Store Connect:**
- Create non-consumable IAP product: `verityprotect_extended_circle`
- Price tier: $14.99
- Localized display name: "Extended Circle"
- Description: "Expand your protection circle to 5 caretakers and 15 family members."

**Backend:**
- New table `user_addons` or extend `user_subscriptions` with an `addon_type` column
- `POST /subscriptions/addon/verify` — receives StoreKit transaction, verifies with App Store Server API, stores entitlement
- `getLimits(userId)` helper returns `{ caretakerMax, familyMax }` based on subscription + addons
- Update `enforceCircleLimits` to call `getLimits`

**Frontend:**
- Replace the `Alert.alert` from Phase 1 with a proper upgrade modal:
  - Icon (shield/people)
  - "Your circle is full" heading
  - Current vs max counts shown visually
  - Feature bullet list: "5 caretakers · 15 family members · One-time purchase · Never expires"
  - CTA: "Expand your circle — $14.99" → triggers StoreKit purchase
  - "Not now" dismiss
- On purchase success: re-fetch limits, re-try the blocked action automatically
- Add restore purchases support for Extended Circle

**MembersScreen UI:**
- Add subtle member count chip near invite button: `3 / 5 members`
- When at limit, chip turns amber: `5 / 5 members`

**Estimated effort:** 3–4 days

---

## Frontend/Marketing Strategy

### In-App Placement

1. **Hard gate modal** — shown when user hits the limit. This is the highest-intent moment — conversion here will be strong because they *want* to add someone right now.

2. **MembersScreen passive prompt** — when a user has 4/5 family members, show a subtle banner: *"Room for 1 more. Need a bigger circle? Expand →"*

3. **Settings > Membership & Billing** — list Extended Circle as an available add-on even before they hit the limit. Let them browse and purchase proactively.

### Messaging / Sell Points

**Primary hook:** *"Your family is bigger than 5."*

**Feature bullets for modal/store listing:**
- ✅ Up to 5 trusted caretakers with full access
- ✅ Up to 15 family members protected
- ✅ One-time purchase — no recurring fees
- ✅ Works with any Verity Protect plan
- ✅ Restore anytime on any device

**Emotional angle:**
> "Large families don't fit into small circles. Extended Circle is for households where protection means everyone."

**Target users:**
- Adult children managing aging parents + siblings all in one circle
- Users with professional care teams (home health aides, nurses)
- Multi-generational households
- Power users who recommended the app to their whole family

### App Store Product Page Copy (for the IAP)

**Display name:** Extended Circle  
**Description:**  
> Expand your Verity Protect circle beyond the standard limits. With Extended Circle, you can add up to 5 caretakers and 15 family members — perfect for large families, multi-generational households, or users with professional care teams.
>
> • 5 caretaker slots (up from 2)  
> • 15 family member slots (up from 5)  
> • One-time purchase, never expires  
> • Applies instantly across all your devices

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Users annoyed by limits at launch | Keep base limits generous (7 total) — most users will never hit them |
| Low IAP attach rate | Gate at a natural friction point (the add action), not behind a settings menu |
| Abuse of extended limits (spam invites) | Server-side enforcement; invites still require acceptance |
| Apple rejects IAP description | Keep copy factual, avoid "unlock" language — use "expand" or "increase" |
| Refund requests when user deletes account | Standard Apple refund policy applies; no special handling needed |

---

## Success Metrics

| Metric | Target (6 months post-launch) |
|--------|-------------------------------|
| Extended Circle attach rate | ≥ 7% of active subscribers |
| Upgrade modal conversion rate | ≥ 15% of users who see it |
| Support tickets re: limits | < 2% of affected users |
| Average revenue per user (ARPU) uplift | +$0.75–1.05/user/month blended |

---

## Open Decisions

- [ ] Final price point: $14.99 vs $9.99 — recommend A/B test after v1.1 launch
- [ ] Whether to offer a "family bundle" that includes Extended Circle + subscription at a discount
- [ ] Whether Extended Circle should count per-profile or per-account (currently planned: per-account)
