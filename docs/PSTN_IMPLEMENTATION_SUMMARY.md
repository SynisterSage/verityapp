# PSTN Multi-Endpoint Routing - Implementation Summary

**Date**: April 3, 2026  
**Status**: 🟢 Core Implementation Complete - Ready for Testing  
**Target Release**: v1.0.4

---

## 📦 What Was Implemented

A complete **ingress-aware PSTN routing system** that allows a single Verity number to intelligently route incoming calls to:
- **Mobile phone** (via call forwarding)
- **Landline** (via call forwarding)  
- **App** (for caregiver monitoring)

Based on where the call originated (ingress-aware routing) with comprehensive loop prevention and fail-safe fallback to legacy routing.

---

## 🗂️ Files Created/Modified

### Database Layer

**NEW**: [`supabase/migrations/20260403120000_add_multi_endpoint_routing.sql`](../../supabase/migrations/20260403120000_add_multi_endpoint_routing.sql)
- `profile_endpoints` table - Store mobile/landline/app endpoints
- `profile_routing_prefs` table - Routing behavior config
- `call_routing_traces` table - Audit trail for debugging
- Migration helper to copy legacy fields to new schema
- RLS policies for security
- **Columns added**: `profiles.multi_endpoint_enabled`

### Backend Services

**NEW**: [`backend/src/services/ingressAwareRouting.ts`](../../backend/src/services/ingressAwareRouting.ts)
- Core ingress detection logic (mobile vs landline)
- Loop guard implementation (prevent infinite loops)
- Endpoint resolution and routing
- Confidence scoring and fail-safe logic
- Key functions:
  - `detectCallIngress()` - Identify call origin
  - `checkLoopGuards()` - Prevent routing loops
  - `resolveIngressAwareEndpoint()` - Get target endpoint
  - `logRoutingTrace()` - Audit trail

**NEW**: [`backend/src/services/multiEndpointRouting.ts`](../../backend/src/services/multiEndpointRouting.ts)
- Feature flag integration (safe rollout)
- Multi-endpoint routing orchestration
- Legacy routing fallback
- TwiML bridge building for ingress-aware routing
- Endpoint config validation
- Key functions:
  - `isMultiEndpointRoutingEnabled()` - Check global flag
  - `selectRoutingPath()` - Choose ingress-aware or legacy
  - `resolveIngressAwareBridgeTarget()` - Main routing decision
  - `validateProfileEndpointConfig()` - Config validation

**NEW**: [`backend/src/controllers/MultiEndpointController.ts`](../../backend/src/controllers/MultiEndpointController.ts)
- REST API for endpoint management
- Routing preference API
- Debug/trace endpoints
- Key endpoints:
  - `GET /profiles/{id}/endpoints` - List endpoints
  - `POST /profiles/{id}/endpoints` - Create endpoint
  - `PUT /profiles/{id}/endpoints/{id}` - Update endpoint
  - `DELETE /profiles/{id}/endpoints/{id}` - Delete endpoint
  - `GET/PUT /profiles/{id}/routing-preferences` - Config
  - `GET /profiles/{id}/routing-traces` - Debug logs

**MODIFIED**: [`backend/config/.env.example`](../../backend/config/.env.example)
- Added `MULTI_ENDPOINT_ROUTING_V1=false` (default off)

**NEW**: [`backend/scripts/test-multi-endpoint-routing.ts`](../../backend/scripts/test-multi-endpoint-routing.ts)
- Manual testing utility
- Phone number normalization tests
- Ingress detection tests
- Loop guard tests
- Runnable via: `npx ts-node scripts/test-multi-endpoint-routing.ts`

### Documentation

**NEW**: [`docs/PSTN_MULTI_ENDPOINT_IMPLEMENTATION.md`](../../docs/PSTN_MULTI_ENDPOINT_IMPLEMENTATION.md)
- Complete implementation guide
- Setup checklist
- Architecture overview
- Test scenarios
- Deployment/rollout strategy
- Monitoring guidelines
- Troubleshooting guide

**NEW**: [`docs/PSTN_LOCAL_TESTING.md`](../../docs/PSTN_LOCAL_TESTING.md)
- Quick reference for local testing
- API testing with curl
- Database inspection queries
- Local Twilio testing with ngrok
- Common issues and solutions

---

## 🎯 Key Features

### 1. Ingress-Aware Routing
```
Incoming Call → Detect Origin (mobile/landline) → Route Back to Same Endpoint
```

**Confidence Levels**:
- **High**: ForwardedFrom header matches endpoint
- **Medium**: From number matches known endpoint
- **Low**: Heuristic fallback (uses legacy fields)

### 2. Loop Prevention (Multi-Level)
```
Guard 1: Never dial back to ingress number
Guard 2: Never dial Verity virtual number  
Guard 3: Block if hop count exceeds threshold
Guard 4: Block repeated call signatures in 5-minute window
```

All guards must pass before routing. On any block → fail safe to legacy.

### 3. Backward Compatibility
- Legacy `phone_number` and `fallback_phone_number` fields untouched
- Automatic migration of existing profiles to new schema
- Zero breaking changes for non-opt-in profiles
- Feature entirely behind opt-in flag

### 4. Fail-Safe Design
- **Any exception** → legacy routing
- **Low confidence** → legacy routing
- **Loop guard block** → legacy routing
- **Feature disabled** → legacy routing
- **Per-profile disable** → legacy routing

System **never fails open** - call always reaches user via some path.

### 5. Comprehensive Audit Trail
```
call_routing_traces table tracks:
- Ingress detection type and confidence
- Forwarding metadata analysis
- Routing decision and mode
- Loop guard results
- All exceptions and fallbacks
```

Perfect for debugging issues with specific calls.

---

## 🚀 Deployment Philosophy

### Three-Phase Rollout (Safe & Gradual)

**Phase 1: Migration & Validation**
- Deploy migration to production DB
- Verify schema created correctly
- No behavior change (feature flag off)
- ~1 week

**Phase 2: Staging Testing**
- Staging DB already has migration
- Create test profiles with endpoints
- Run manual test scenarios
- Verify routing logic works
- ~1 week

**Phase 3: Pilot Enablement**
- Set `MULTI_ENDPOINT_ROUTING_V1=true` on staging
- Enable for single internal test profile
- Monitor for 3-5 days
- Check logs: no loops, correct routing, no cost spikes
- If stable → facility pilot
- If issues → rollback (just disable flag)

**Phase 4: Facility Rollout**
- Select facilities with stable usage
- Enable for 1-2 facilities at a time
- Daily monitoring for first week
- Expand as confidence increases

### Immediate Rollback (< 1 minute)
```
P0/P1 issue detected:
  1. Set MULTI_ENDPOINT_ROUTING_V1=false
  2. Restart backend
  3. All traffic reverts to legacy immediately
  
No data loss, no cleanup, no code deployment needed.
```

---

## 📊 Routing Decision Tree

```
Incoming Call on Verity Number
    ↓
[Is MULTI_ENDPOINT_ROUTING_V1 = true?]
    ├─ NO → Use legacy routing
    ↓ YES
[Is profile.multi_endpoint_enabled = true?]
    ├─ NO → Use legacy routing
    ↓ YES
[Detect ingress source (mobile/landline/unknown)]
    ↓
[Run loop guards]
    ├─ BLOCKED → Use legacy routing
    ↓ ALLOWED
[Resolve matching endpoint]
    ├─ NOT FOUND → Use legacy routing
    ├─ LOW CONFIDENCE → Use legacy routing
    ↓ FOUND + HIGH/MED CONFIDENCE
[Dial ingress-matching endpoint]
    ├─ ANSWERED → Call connected
    ├─ NO-ANSWER → Apply no-answer policy
    ├─ ERROR → Fallback to legacy
    ↓
[Log routing trace for audit]
```

---

## 🧪 Test Matrix (All Should Pass)

```
Test 1: Mobile Ingress → Routes to Mobile Endpoint ✓
Test 2: Landline Ingress → Routes to Landline Endpoint ✓
Test 3: Call from Endpoint Number → Loop Guard Blocks ✓
Test 4: Call from Verity Number → Loop Guard Blocks ✓
Test 5: Low Confidence Ingress → Fails Safe to Legacy ✓
Test 6: Feature Flag Off → Always Legacyrouting ✓
Test 7: Profile Opt-Out → Always Legacy Routing ✓
Test 8: No Endpoints Configured → Fails Safe to Legacy ✓
Test 9: Forced Exception → Fails Safe to Legacy ✓
Test 10: Audit Trail Complete → Traces Logged ✓
```

---

## 📝 Environment Configuration

### Required (Add to `.env` when enabling)

```bash
# Global feature flag (OFF by default for safety)
MULTI_ENDPOINT_ROUTING_V1=false

# When ready to test, set to:
MULTI_ENDPOINT_ROUTING_V1=true
```

### Per-Profile Enable

Database field to enable feature per-profile:
```sql
UPDATE profile_routing_prefs
SET multi_endpoint_enabled = true,
    use_ingress_aware_routing = true
WHERE profile_id = '{uuid}';
```

Or via REST API:
```bash
PUT /api/v1/profiles/{id}/routing-preferences
{ "multi_endpoint_enabled": true }
```

---

## 💾 Database Schema Summary

### `profile_endpoints`
```
id (UUID)
profile_id (UUID) - FK profiles
endpoint_type (mobile|landline|app)
phone_number (E.164 normalized)
phone_number_e164 (E.164 for matching)
is_active (boolean)
verified_at (timestamp)
last_dialed_at (timestamp)
created_at, updated_at
```

### `profile_routing_prefs`
```
id (UUID)
profile_id (UUID) - FK profiles, unique
multi_endpoint_enabled (boolean, default false)
use_ingress_aware_routing (boolean, default true)
default_fallback_type (app|voicemail|first_available)
simultaneous_ring_enabled (boolean, default false)
ring_timeout_seconds (int, default 30)
hop_limit_threshold (int, default 5)
duplicate_detection_window_seconds (int, default 300)
no_answer_action (voicemail|fallback|hangup)
voicemail_enabled (boolean, default true)
created_at, updated_at
```

### `call_routing_traces`
```
id (UUID)
call_id (UUID) - FK calls
profile_id (UUID) - FK profiles
ingress_detected (mobile|landline|app|unknown)
ingress_confidence (high|medium|low)
ingress_from_number (varchar)
forwarded_from_number (varchar)
ani_confidence (high|medium|low)
routing_mode (ingress_aware|legacy|failed_safe)
target_endpoint_type (varchar)
loop_guard_result (allowed|blocked_ingress|blocked_hop|blocked_duplicate)
hop_count (int)
routing_attempts (int)
last_attempted_leg (varchar, masked)
trace_notes (text)
created_at (timestamp)
```

---

## 🔍 Monitoring & Alerting

### Key Metrics

```sql
-- Successful ingress-aware routing
SELECT COUNT(*) as successful_routes
FROM call_routing_traces
WHERE routing_mode = 'ingress_aware' 
  AND loop_guard_result = 'allowed';

-- Fallback to legacy
SELECT COUNT(*) as legacy_fallbacks
FROM call_routing_traces
WHERE routing_mode IN ('legacy', 'failed_safe');

-- Loop guard blocks
SELECT loop_guard_result, COUNT(*)
FROM call_routing_traces
WHERE loop_guard_result != 'allowed'
GROUP BY loop_guard_result;

-- Confidence levels
SELECT ingress_confidence, COUNT(*)
FROM call_routing_traces
GROUP BY ingress_confidence;
```

### Alert Thresholds

🔴 **CRITICAL** (Disable Feature Immediately):
- Loop guard blocks > 5% of calls
- Call leg count increases > 20%
- Wrong endpoint routing confirmed

🟡 **WARNING** (Investigate):
- High confidence detection < 50%
- Fallback rate > 30%
- Ingress_confidence = 'low' > 30%

---

## 🎓 Understanding the Code

### Core Flow Example

```typescript
// In TwilioController.callIncoming():
const routingPath = await selectRoutingPath(profile);

if (routingPath === 'ingress_aware') {
  const resolution = await resolveIngressAwareBridgeTarget(
    profile, 
    { callSid, toNumber, fromNumber, forwardedFrom }
  );
  
  if (resolution?.destination) {
    // Dial resolved endpoint
    appendIngressAwareBridgeTwiml(twimlResponse, dialUrl, callerId, resolution.destination);
  } else {
    // Fall back to legacy
    appendLegacyBridge(twimlResponse, profile);
  }
} else {
  // Use legacy routing
  appendLegacyBridge(twimlResponse, profile);
}
```

### Phone Normalization

```typescript
// +1-555-123-4567 → +15551234567
// 555-123-4567 → +15551234567
// (555) 123-4567 → +15551234567
const normalized = normalizeE164(phone);

// Compare two phones after normalization
const match = phonesMatch('+15551234567', '555 123 4567');  // true
```

### Ingress Detection Priority

1. **ForwardedFrom header** → highest trust
2. **From number lookup** → medium trust
3. **Legacy field fallback** → lowest trust
4. **No match** → unknown, fail safe

---

## 📞 Testing with Real Twilio (Advanced)

See [`docs/PSTN_LOCAL_TESTING.md`](PSTN_LOCAL_TESTING.md) for:
- ngrok setup for local webhooks
- Twilio configuration
- Real call scenarios
- Log monitoring

Example test:
```bash
# 1. Setup endpoints
curl -X POST http://localhost:4000/api/v1/profiles/{id}/endpoints \
  -d '{"endpoint_type":"mobile","phone_number":"+15551234567"}'

# 2. Enable feature
curl -X PUT http://localhost:4000/api/v1/profiles/{id}/routing-preferences \
  -d '{"multi_endpoint_enabled":true}'

# 3. Call and observe logs in real-time
# 4. Check routing traces
curl http://localhost:4000/api/v1/profiles/{id}/routing-traces
```

---

## ✅ Next Steps

### Immediate (This Week)
1. ✅ Review implementation code
2. ✅ Verify database migration syntax
3. ✅ Test locally with test-multi-endpoint-routing.ts
4. ⏭️ Deploy migration to staging database
5. ⏭️ Create test profiles with endpoints
6. ⏭️ Run manual test scenarios

### Short Term (Next 1-2 Weeks)
7. ⏭️ Deploy code to staging with flag OFF
8. ⏭️ Verify no behavior change (regression testing)
9. ⏭️ Set flag to ON for internal profile
10. ⏭️ Monitor logs for 3-5 days
11. ⏭️ Document findings and issues

### Medium Term (2-4 Weeks)
12. ⏭️ Fix any issues discovered
13. ⏭️ Deploy to production with flag OFF
14. ⏭️ Enable for pilot facilities one at a time
15. ⏭️ Gather feedback and iterate

---

## 🤝 Key Decision Points

**Q: What if ingress detection fails?**  
A: Falls back to legacy routing. Call still reaches user.

**Q: What if endpoints aren't configured?**  
A: System detects and uses legacy routing automatically.

**Q: Can this cause loops?**  
A: Multiple guard layers prevent this:
   - Never dial ingress number
   - Never dial Verity number
   - Hop count limits
   - Duplicate detection

**Q: What if a call fails on endpoint?**  
A: Follows no-answer policy (voicemail, fallback, or hangup).

**Q: How do I rollback if issues appear?**  
A: Set `MULTI_ENDPOINT_ROUTING_V1=false` and restart. Instant rollback.

---

## 📚 Related Documentation

- [`docs/PSTN_MULTI_ENDPOINT_IMPLEMENTATION.md`](PSTN_MULTI_ENDPOINT_IMPLEMENTATION.md) - Full implementation guide
- [`docs/PSTN_LOCAL_TESTING.md`](PSTN_LOCAL_TESTING.md) - Testing reference
- [`frontend/docs/multi-endpoint-routing/`](../frontend/docs/multi-endpoint-routing/) - Original design docs
- [`backend/src/services/ingressAwareRouting.ts`](../../backend/src/services/ingressAwareRouting.ts) - Core logic
- [`backend/src/services/multiEndpointRouting.ts`](../../backend/src/services/multiEndpointRouting.ts) - Integration

---

## 🚀 Summary

**What you have**:
- ✅ Complete database schema for multi-endpoint routing
- ✅ Ingress detection with confidence scoring
- ✅ Multi-layer loop prevention
- ✅ REST API for endpoint management
- ✅ Comprehensive audit trails
- ✅ Fail-safe fallback design
- ✅ Feature flags for safe rollout
- ✅ Test utilities and documentation

**What you can do now**:
- Test locally with the provided utilities
- Deploy safely with feature flag OFF
- Enable for internal test profile when ready
- Monitor with detailed audit trails
- Rollback instantly if needed

**Risk Level**: 🟢 LOW
- Multiple fallback layers
- Instant rollback available
- No breaking changes
- Extensive testing possible pre-deployment

Good luck! 🎉

