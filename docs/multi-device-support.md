# Multi-Device Support: Mobile + Landline Protection

**Status:** Planning / Not Implemented  
**Date:** February 7, 2026  
**Feature:** Allow profiles to protect multiple phone numbers (mobile + landline) simultaneously

---

## Problem Statement

Many elderly users have **multiple phone numbers**:
- **Mobile phone** for on-the-go calls
- **Landline** at home or in assisted living facility

Currently, Verity Protect only supports protecting ONE phone number per profile. Users want fraud protection on ALL their devices.

### Use Case Example
> Grandma has a mobile phone (555-1234) she carries around and a landline (555-5678) in her assisted living apartment. Scammers call both numbers. Family wants fraud detection on both.

---

## Current Architecture

### How Call Forwarding Works Today
```
Incoming Call Flow:
1. Scammer calls grandma's mobile: 555-1234
2. Mobile carrier forwards to Twilio virtual number: +1-XXX-XXXX
3. Twilio webhook → Backend fraud analysis
4. If safe, Twilio dials back to 555-1234
5. Grandma's phone rings
```

### Database Schema (Current)
```sql
profiles:
  - phone_number (text) -- ONE number per profile
  - twilio_virtual_number (text) -- ONE Twilio number assigned
```

### Limitations
- Only ONE phone number can be protected per profile
- User must choose mobile OR landline (not both)
- Need separate profiles for separate devices (wasteful)

---

## Solution Options

### Option 1: Always Ring Both Devices (Simplest)

**Approach:** One Twilio number protects both phones, always rings both on incoming calls

#### Setup
```
Mobile (555-1234) → forwards to → Twilio virtual number
Landline (555-5678) → forwards to → same Twilio virtual number
```

#### Call Flow
```
Incoming call to mobile:
Caller → 555-1234 → Twilio → Analyze → Ring BOTH 555-1234 + 555-5678

Incoming call to landline:
Caller → 555-5678 → Twilio → Analyze → Ring BOTH 555-1234 + 555-5678
```

#### TwiML Response
```xml
<Response>
  <Dial>
    <Number>+1555-1234</Number>  <!-- mobile -->
    <Number>+1555-5678</Number>  <!-- landline -->
  </Dial>
</Response>
```

#### Pros
- ✅ Simple implementation
- ✅ Uses only ONE Twilio number per profile
- ✅ User never misses calls (both devices ring)
- ✅ Great for elderly users (can answer whichever phone is nearby)
- ✅ No complex routing logic needed

#### Cons
- ❌ Can't tell which number was originally called
- ❌ Both phones always ring (might be annoying)
- ❌ No per-device notification preferences

#### Database Changes
```sql
ALTER TABLE profiles
ADD COLUMN landline_number text;
```

#### Implementation Complexity
**Low** - ~2 hours
- Add landline_number field
- Update TwiML generation to include both numbers
- Update frontend to accept landline input

---

### Option 2: Ring Only the Called Number (Smart Routing)

**Approach:** Two Twilio numbers, each protects one device, rings only that device

#### Setup
```
Mobile (555-1234) → forwards to → Twilio #1 (+1-AAA-AAAA)
Landline (555-5678) → forwards to → Twilio #2 (+1-BBB-BBBB)
```

#### Call Flow
```
Incoming call to mobile:
Caller → 555-1234 → Twilio #1 → Analyze → Ring 555-1234 only

Incoming call to landline:
Caller → 555-5678 → Twilio #2 → Analyze → Ring 555-5678 only
```

#### Pros
- ✅ Preserves original behavior (mobile rings for mobile calls)
- ✅ Can track which device receives calls
- ✅ Separate fraud analytics per device
- ✅ Caller doesn't know about second device
- ✅ Per-device notification preferences possible

#### Cons
- ❌ Uses TWO Twilio numbers per profile (pool drains faster)
- ❌ More complex implementation
- ❌ User can miss calls if phone is in another room
- ❌ Requires more webhook routing logic

#### Database Changes
```sql
ALTER TABLE profiles
ADD COLUMN landline_number text,
ADD COLUMN twilio_landline_number text;

-- OR create a new table for multiple devices
CREATE TABLE profile_devices (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id),
  device_type text CHECK (device_type IN ('mobile', 'landline')),
  phone_number text NOT NULL,
  twilio_virtual_number text UNIQUE,
  created_at timestamptz DEFAULT now()
);
```

#### Implementation Complexity
**Medium** - ~6 hours
- Database migration for second Twilio number
- Update number pool assignment logic
- Webhook routing based on which Twilio # received call
- Frontend UI for managing multiple devices

---

### Option 3: User-Configurable Forwarding Rules (Most Flexible)

**Approach:** Let user configure forwarding behavior per number

#### Settings UI
```
When my mobile receives a call:
  [✓] Ring mobile
  [ ] Ring landline
  [ ] Ring both

When my landline receives a call:
  [ ] Ring mobile
  [✓] Ring landline
  [✓] Ring both
```

#### Pros
- ✅ Maximum flexibility
- ✅ User controls behavior per device
- ✅ Can adapt to different scenarios (home vs away)

#### Cons
- ❌ Complex UI (confusing for elderly users)
- ❌ Still needs 2 Twilio numbers to detect which was called
- ❌ High implementation complexity
- ❌ More edge cases to handle

#### Database Changes
```sql
CREATE TABLE forwarding_rules (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id),
  source_device text, -- 'mobile' or 'landline'
  forward_to_mobile boolean DEFAULT true,
  forward_to_landline boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

#### Implementation Complexity
**High** - ~12 hours
- Database schema for rules
- Complex webhook routing logic
- Settings UI with toggles
- Testing all rule combinations

---

### Option 4: VoIP "Virtual Landline" (Hybrid)

**Approach:** Mobile uses traditional forwarding, "landline" is VoIP extension in app

#### Setup
```
Mobile (555-1234) → forwards to → Twilio virtual number
"Landline" → VoIP app extension using Twilio Client
```

#### Call Flow
```
Incoming call:
Caller → 555-1234 → Twilio → Analyze → Ring mobile + push notification to app

App VoIP extension:
Uses Twilio Client SDK to receive calls via push notifications
```

#### Pros
- ✅ Only uses ONE Twilio number
- ✅ Can distinguish devices (physical vs app)
- ✅ Rich app notifications possible

#### Cons
- ❌ Not a real landline (requires app installation)
- ❌ Doesn't help if user has actual landline device
- ❌ Complex VoIP implementation
- ❌ Requires push notifications + background processing

#### Implementation Complexity
**Very High** - ~20 hours
- VoIP push notifications (already partially implemented)
- Twilio Client calling integration
- Background call handling
- iOS/Android platform-specific code

---

## Recommendation

### **Choose Option 1: Always Ring Both Devices**

**Why:**
1. **Simplest implementation** - Can be done in ~2 hours
2. **Best for target audience** - Elderly users benefit from both phones ringing
3. **Most reliable** - User never misses important calls
4. **One Twilio number** - Doesn't drain number pool
5. **No complex UI** - Just add "Landline Number" field

**Trade-off:** Can't tell which number was originally called, but this doesn't matter in practice since both ring anyway.

### Fallback to Option 2 if needed
If users report that "always ring both" is annoying, we can migrate to Option 2 (two Twilio numbers) later. The database migration is backwards compatible.

---

## Implementation Plan (Option 1)

### Phase 1: Database Migration
```sql
-- Migration: 20260208XXXXXX_add_landline_support.sql

ALTER TABLE profiles
ADD COLUMN landline_number text;

COMMENT ON COLUMN profiles.landline_number IS 
  'Optional secondary phone number (landline) to ring alongside mobile';
```

### Phase 2: Backend Changes

#### TwilioController Updates
**File:** `backend/src/controllers/TwilioController.ts`

Update `handleIncomingCall()` to generate TwiML with multiple numbers:

```typescript
// Before
const twiml = `
  <Response>
    <Dial>${profile.phone_number}</Dial>
  </Response>
`;

// After
const numbers = [profile.phone_number];
if (profile.landline_number) {
  numbers.push(profile.landline_number);
}

const numberTags = numbers.map(n => `<Number>${n}</Number>`).join('\n    ');
const twiml = `
  <Response>
    <Dial>
      ${numberTags}
    </Dial>
  </Response>
`;
```

#### ProfilesController Updates
**File:** `backend/src/controllers/ProfilesController.ts`

Add landline_number to:
- `createProfile()` - Accept landline_number in request body
- `updateProfile()` - Allow updating landline_number
- SELECT statements - Include landline_number in profile responses

#### Validation Schema
**File:** `backend/src/middleware/validationSchemas.ts`

```typescript
export const createProfileSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone_number: z.string().regex(/^\+1\d{10}$/).optional(),
  landline_number: z.string().regex(/^\+1\d{10}$/).optional(), // NEW
});

export const updateProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone_number: z.string().regex(/^\+1\d{10}$/).optional(),
  landline_number: z.string().regex(/^\+1\d{10}$/).optional(), // NEW
});
```

### Phase 3: Frontend Changes

#### Context Type Update
**File:** `frontend/src/context/ProfileContext.tsx`

```typescript
export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  landline_number: string | null; // NEW
  twilio_virtual_number: string | null;
  // ... other fields
};
```

#### Account Screen Updates
**File:** `frontend/src/screens/settings/AccountScreen.tsx`

Add landline input field below phone number:
```tsx
<View style={styles.section}>
  <Text style={styles.sectionLabel}>Mobile Phone</Text>
  <TextInput
    value={formattedPhone}
    onChangeText={handlePhoneChange}
    // ... existing mobile field
  />
</View>

<View style={styles.section}>
  <Text style={styles.sectionLabel}>Landline (Optional)</Text>
  <TextInput
    value={formattedLandline}
    onChangeText={handleLandlineChange}
    placeholder="(555) 555-5555"
    keyboardType="phone-pad"
    // ... similar to mobile field
  />
  <Text style={styles.hint}>
    Both phones will ring for incoming calls
  </Text>
</View>
```

#### Onboarding Updates
**File:** `frontend/src/screens/onboarding/CreateProfileScreen.tsx`

Add optional landline step or combine with phone number step:
```tsx
<Text style={styles.subtitle}>
  Add your phone numbers (at least one required)
</Text>

<TextInput label="Mobile Phone" />
<TextInput label="Landline (Optional)" />
```

### Phase 4: Testing

#### Test Cases
1. ✅ Profile with only mobile number → rings mobile only
2. ✅ Profile with mobile + landline → rings both
3. ✅ Profile with only landline → rings landline only
4. ✅ Call recording captures correct number dialed
5. ✅ Fraud alerts show which device was called
6. ✅ Update landline number in settings → saves correctly
7. ✅ Remove landline number → reverts to single device

#### Manual Testing
- Set up test profile with two phones
- Forward both to staging Twilio number
- Make test calls to each number
- Verify both ring simultaneously
- Answer on different devices to test race condition

---

## Future Enhancements

### If users request "smart routing" later
- Migrate to Option 2 (two Twilio numbers)
- Add migration script to assign second Twilio number from pool
- Update webhook routing logic
- No frontend changes needed (backwards compatible)

### Possible features
- Per-device call history filtering
- "Prefer mobile" or "prefer landline" priorities
- Time-based routing (ring landline during day, mobile at night)
- Different alert notification preferences per device

---

## Cost Analysis

### Option 1 (Recommended)
- **Twilio Numbers:** 1 per profile ($1.15/month each)
- **Complexity:** Low
- **Development Time:** ~2 hours
- **Scalability:** No impact on number pool

### Option 2 (Smart Routing)
- **Twilio Numbers:** 2 per profile ($2.30/month each)
- **Complexity:** Medium
- **Development Time:** ~6 hours
- **Scalability:** Drains number pool 2x faster

### Example: 1000 users with landlines
- **Option 1:** 1000 numbers needed ($1,150/month)
- **Option 2:** 2000 numbers needed ($2,300/month)

---

## Security Considerations

### Validation
- Ensure landline_number follows E.164 format (+1XXXXXXXXXX)
- Prevent setting duplicate numbers across profiles
- Validate number is not already a Twilio virtual number

### Privacy
- Landline number is PII - included in data exports
- RLS policies apply same as phone_number
- Audit log changes to landline_number

### Edge Cases
- What if both numbers forward to DIFFERENT Twilio numbers?
  - Won't work - need single Twilio # per profile
- What if user removes landline mid-call?
  - Existing calls continue, new calls ring mobile only
- What if landline_number == phone_number?
  - Validate and reject duplicate

---

## Questions to Answer

1. **Should landline be required or optional?**
   - Recommendation: Optional (most users only have mobile)

2. **Should we charge more for multi-device profiles?**
   - Recommendation: No, same pricing (only uses 1 Twilio number)

3. **Should we show which device was called in call history?**
   - Recommendation: No for Option 1 (we can't tell), Yes for Option 2

4. **Should we allow MORE than 2 devices?**
   - Recommendation: Start with 2, expand later if needed

5. **Should family members see both numbers?**
   - Recommendation: Yes, visible in profile settings (with proper permissions)

---

## Success Metrics

Post-launch tracking:
- % of profiles using landline feature
- Call completion rate (both vs single device)
- User feedback on "both ringing" behavior
- Support tickets related to multi-device setup

---

## Rollout Plan

1. **Week 1:** Database migration + backend implementation
2. **Week 2:** Frontend implementation + internal testing
3. **Week 3:** Beta release to 10-20 test users
4. **Week 4:** Gather feedback, iterate
5. **Week 5:** Full production rollout
6. **Week 6:** Monitor metrics, support issues

---

## Decision

**Approved:** [ ]  
**By:** [ ]  
**Date:** [ ]

**Implementation:** Option 1 (Always Ring Both)  
**Start Date:** [ ]  
**Target Completion:** [ ]
