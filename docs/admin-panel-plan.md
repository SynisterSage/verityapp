# Admin Panel Plan

## Purpose

This is a deferred planning note for a future internal admin/dev panel for SafeCall / Verity Protect.

The goal is not to build a full ops platform right now. The goal is to capture:

- why this could be useful later
- what the first version should and should not do
- what security risks matter most
- what architecture would keep it safe

Current recommendation: do not build this during the `1.0.2` rollout or while facility implementation is still settling.

## Why Build It Later

Right now, several internal tasks are handled through shell scripts and direct backend/database operations. That is workable as a solo dev early on, but it gets expensive once there are more users, more facilities, more Twilio numbers, and more support activity.

A small internal panel would eventually reduce friction for:

- checking Twilio number pool state
- looking up support conversations
- checking subscriptions and membership status
- managing facility codes and facility records
- performing a few high-value manual ops tasks without digging through CLI scripts

This becomes worth doing once the app has enough live usage that internal operations start interrupting product work.

## Core Recommendation

If this gets built, it should start as a very small internal web app with:

- read-only views first
- a separate internal auth boundary
- narrowly scoped server-side actions
- audit logging for all writes
- explicit confirmation for risky actions

Do not build it as "a UI that directly runs existing scripts."

## Why This Could Be Risky

The biggest risk is not the UI itself. The risk is creating a new privileged path into production that is less safe than the product APIs.

Failure modes:

- admin actions become accessible to someone other than the owner
- a write path bypasses product business rules
- service-role privileges are exposed too broadly
- dangerous actions become too easy to click
- logs or frontend requests leak secrets
- internal tools drift away from the safety constraints enforced in the app

If done carelessly, the admin panel can become the least safe part of the system.

## Security Risks To Design Around

### 1. Mixed trust models

The current backend already uses a mix of:

- normal authenticated user routes
- internal ops header-based access
- service-role scripts

That is manageable in code, but it is not yet a clean single trust model for a future admin surface.

Risk:

- an admin UI gets layered on top of inconsistent authorization paths
- routes intended for internal use inherit end-user access assumptions

### 2. Service-role overreach

Existing scripts use high-privilege server credentials. That is fine in CLI/server contexts, but dangerous in a generic admin panel.

Risk:

- a browser-triggered action effectively gets service-role power
- a weakly protected endpoint can mutate production data broadly

Rule:

- service-role credentials must remain server-only
- frontend must never call Supabase with service-role capabilities

### 3. Bypassing business rules

A quick admin tool can accidentally skip validations or domain logic that the app normally enforces.

Risk:

- numbers assigned outside the intended pool flow
- facility or subscription state updated without normal checks
- support/admin actions writing malformed or inconsistent records

Rule:

- admin actions should call safe server-side operations, not raw table mutations whenever possible

### 4. Single-user access that is not truly single-user

"Internal only" often starts as a hidden route and ends up reachable by more people than expected.

Risk:

- a deployment or preview environment exposes the panel
- an internal ops key leaks
- app-level admin users gain access when only the owner should

Rule:

- owner-only auth must be explicit and fail-closed

### 5. Accidental damage

Even if no one malicious gets in, internal tools can still cause mistakes.

Risk:

- deactivating the wrong facility code
- changing support data in the wrong thread
- reassigning or releasing numbers incorrectly
- mutating production data without a paper trail

Rule:

- risky actions need confirmations, clear copy, and audit logs

## What A Safe v1 Looks Like

The first useful version should be narrow.

Suggested v1:

- Twilio number pool overview
- support ticket/message lookup
- facility lookup
- facility code lookup
- subscription/user lookup

Write actions should be limited to only a few high-value cases:

- create or deactivate a facility code
- inspect a profile subscription state
- inspect Twilio number assignment state

Better first step:

- read-only across most screens
- only 2-3 write actions total

## What Should Stay Out Of v1

Avoid these early:

- bulk actions
- direct SQL-like editing tools
- generic script runners
- anything that changes multiple systems at once
- destructive Twilio actions without a strong operational need
- "super admin" tooling that bypasses normal checks everywhere

If a task is rare and risky, it can stay CLI-only longer.

## Suggested Architecture

Best likely shape:

- a tiny internal web app
- separate from the React Native app
- backed by dedicated internal API routes
- server-side wrappers around existing business logic

Possible placement:

- separate small Next.js app
- or a protected admin route in an existing web property

Preferred model:

1. Browser authenticates to a dedicated internal admin surface.
2. Admin UI calls internal backend endpoints only.
3. Internal backend endpoints perform:
   - owner auth check
   - request validation
   - authorization for the specific action
   - audit logging
   - execution of a narrow server-side operation

Do not:

- expose shell execution from the browser
- expose raw scripts directly
- expose service-role credentials to the client

## Auth And Access Model

This matters more than UI.

Minimum standard:

- separate admin auth from normal app auth
- owner-only allowlist
- fail closed in every deployed environment
- short sessions
- secure cookies or equivalent server-side session handling
- strong secret management

Good options later:

- a dedicated admin user allowlisted by email/user ID
- admin auth behind existing auth plus a second internal check
- optional second factor for internal access

The important part is not sophistication. It is certainty that only one person can use it.

## Authorization Model

Do not assume "signed in" means "allowed."

Each admin action should be classified:

- read-only
- safe write
- dangerous write

Examples:

- read-only: view Twilio pool, inspect support thread, lookup subscription
- safe write: create facility code, mark ticket state
- dangerous write: reassign number, deactivate active code, alter subscription-related records

Dangerous writes should require:

- explicit confirmation
- strong audit logging
- optional typed confirmation for destructive actions

## Audit Logging Requirements

Every internal write should record:

- who performed it
- when it happened
- what action was requested
- what record(s) were affected
- before/after summary if feasible
- request identifier for tracing

This is useful for:

- debugging
- rollback analysis
- security review
- preventing silent mistakes

## Reusing Existing Scripts

Existing scripts are still valuable, but they should be treated as implementation references, not directly exposed panel actions.

Safe reuse pattern:

- extract shared logic into typed server-side services
- have both CLI scripts and admin routes call the same service layer

Unsafe pattern:

- panel button triggers a shell command
- panel endpoint acts as a generic script runner

The more generic the tool, the higher the risk.

## Current Repo Notes

Based on the current backend shape:

- validation middleware exists and is a good foundation
- Twilio webhook signature validation exists and is good
- there are already internal ops concepts in the backend
- support, profile, and subscription logic already exist in structured controllers/services

But:

- current internal access is not yet a complete owner-only admin model
- current scripts rely on broad service-role power
- some existing flows should be tightened before they are reused for admin tooling

Conclusion:

- the repo is capable of supporting a secure internal panel later
- it should not be built by simply wrapping the current scripts with forms/buttons

## Recommended Rollout Sequence

When this becomes worth doing, the safest order is:

1. Define the exact v1 scope.
2. Create a dedicated internal auth model.
3. Create internal read-only routes first.
4. Add audit logging.
5. Add only a few write actions.
6. Keep rare/risky operations CLI-only until clearly needed.

## Not Worth Doing Yet If

You should probably keep using scripts for now if:

- live ops load is still low
- support volume is manageable
- Twilio number management is infrequent
- facility operations are still changing quickly
- product work is more important than ops convenience

That appears to be the current state during the `1.0.2` rollout and facility implementation phase.

## Trigger To Revisit This

Revisit this plan when one or more of these become true:

- internal ops tasks happen multiple times per day
- support/facility actions are slowing down product work
- manual CLI work starts causing mistakes or delays
- more than a handful of recurring admin tasks are clearly stable

## Short Version

Yes, a secure admin panel is realistic.

No, it should not be built right now.

When it is built, it should be:

- small
- owner-only
- read-heavy at first
- server-driven
- audited
- isolated from raw scripts and service-role exposure
