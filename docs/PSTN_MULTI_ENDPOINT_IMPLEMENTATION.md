## PSTN Multi-Endpoint Routing Implementation Guide

**Last Updated**: April 3, 2026  
**Status**: Initial Implementation - Ready for Staging Testing  
**Target Release**: v1.0.4

---

## 🎯 Overview

This guide covers the complete implementation of **PSTN multi-endpoint routing** for SafeCall/Verity Protect. It enables a single Verity virtual number to intelligently route incoming calls back to either:
- The residential mobile phone
- The residential landline
- The app (for monitoring/caregiver workflows)

Based on which endpoint the call **originated from** (ingress-aware routing).

---

## ✨ What's New

### Backend Services
- **`ingressAwareRouting.ts`** - Core ingress detection and loop guard logic
- **`multiEndpointRouting.ts`** - Integration layer and feature flags
- **`MultiEndpointController.ts`** - REST API for managing endpoints

### Database
- **`profile_endpoints`** table - Stores mobile/landline endpoints
- **`profile_routing_prefs`** table - Routing behavior configuration
- **`call_routing_traces`** table - Audit trail for debugging
- **`profiles.multi_endpoint_enabled`** column - Per-profile opt-in flag

### Environment Flags
- `MULTI_ENDPOINT_ROUTING_V1=false` (default) - Global feature flag

---

## 🏗️ Architecture

### Call Flow with Multi-Endpoint Routing

```
Incoming Call (Grandma's Landline)
        ↓
   Twilio virtual number
        ↓
   [Detect Ingress]
   - Check ForwardedFrom header
   - Match From number against endpoints
   - Use legacy fields as fallback
        ↓
   [Run Loop Guards]
   - Check source ≠ destination
   - Check destination ≠ Verity number
   - Check hop count
   - Check for duplicates in 5min window
        ↓
   [Resolve Endpoint]
   - If landline ingress → dial landline
   - If mobile ingress → dial mobile
   - If unknown/low-confidence → legacy routing
        ↓
   [Dial Endpoint or Fallback]
   - Verity plays greeting
   - If answered → call connects
   - If no-answer → voicemail/fallback policy
        ↓
   [Log Trace]
   - Record routing decision
   - Store for debugging/analytics
```

### Backward Compatibility

The implementation **maintains full backward compatibility**:
- Legacy `phone_number` and `fallback_phone_number` fields remain unchanged
- If no endpoints exist, system falls back to legacy routing automatically
- Migration runs on migration apply to copy legacy fields to new schema

---

## 📋 Setup Checklist

### 1. Database Migration
```bash
cd /Users/lex/Desktop/safecall
npx supabase migration up
```

This creates:
- `profile_endpoints` table
- `profile_routing_prefs` table  
- `call_routing_traces` table
- Adds `multi_endpoint_enabled` column to profiles
- Migrates existing profiles' phone numbers to new schema

**Verify migration:**
```bash
psql <database_url> -c "SELECT * FROM profile_endpoints LIMIT 1;"
```

### 2. Backend Configuration

Add to backend `.env`:
```bash
# Feature flag (off by default)
MULTI_ENDPOINT_ROUTING_V1=false
```

### 3. Test Endpoints Creation

Create endpoints for a test profile via SQL (for testing):
```sql
INSERT INTO profile_endpoints (profile_id, endpoint_type, phone_number, phone_number_e164, verified_at, is_active)
VALUES 
  ('profile-uuid-here', 'mobile', '+1-555-123-4567', '+15551234567', NOW(), true),
  ('profile-uuid-here', 'landline', '+1-555-987-6543', '+15559876543', NOW(), true);

-- Enable multi-endpoint routing for this profile
UPDATE profile_routing_prefs 
SET multi_endpoint_enabled = true,
    use_ingress_aware_routing = true
WHERE profile_id = 'profile-uuid-here';
```

Or use the REST API:
```bash
curl -X POST http://localhost:4000/api/v1/profiles/{profileId}/endpoints \
  -H "Content-Type: application/json" \
  -d '{"endpoint_type": "mobile", "phone_number": "+15551234567"}'
```

---

## 🧪 Local Testing Setup

### Prerequisites
- Twilio sandbox or paid account with voice capabilities
- Ngrok or local public URL tunnel for webhooks
- Two actual phone numbers: one for mobile, one for landline

### Test Scenarios

#### Scenario A: Call from Mobile Number
```
1. Set up test profile with:
   - Mobile: +1-555-123-4567
   - Landline: +1-555-987-6543
   - Verity number: +1-555-VERITY-1

2. Forward mobile to Verity number
3. Dial Verity from external caller
4. Check logs for: "Ingress detected: type=mobile confidence=high"
5. Verify call routes back to mobile endpoint
6. Check call_routing_traces table for trace record
```

#### Scenario B: Call from Landline Number
```
Similar to Scenario A, but call from landline should route back to landline.
```

#### Scenario C: Unknown Ingress (Safety Test)
```
1. Disable endpoint for mobile
2. Dial Verity from mobile
3. Check logs for: "Unknown ingress type, falling back to legacy"
4. Verify call routes to legacy fallback_phone_number
5. Confirm ingress_confidence=low in traces
```

#### Scenario D: Loop Prevention
```
1. Set both endpoints to same number (shouldn't be allowed at API level)
2. Manually update DB to create invalid state
3. Dial Verity from that number
4. Check logs for: "BLOCKED: destination matches ingress number"
5. Verify call is rejected by loop guard
```

### Logging Inspection

Enable detailed logging:
```bash
# In .env
JET_LOGGER_MODE=CONSOLE
JET_LOGGER_FORMAT=LINE
```

Watch logs for:
```
[ingress] Ingress detected: ...
[loop-guard] ALLOWED/BLOCKED: ...
[endpoint-resolve] Resolved ... endpoint ...
[routing-trace] Failed to log trace ...
[multi-endpoint] Routing to endpoint ...
```

---

## 🚀 Deployment & Rollout

### Phase 1: Staging Validation (Your Horizon)
```
Objective: Verify routing logic works without production impact

Steps:
1. Deploy migration to staging DB
2. Create test profiles with endpoints
3. Run manual test scenarios
4. Verify traces are logged correctly
5. Monitor for any database constraint violations
```

### Phase 2: Pilot Enablement (Next Phase)
```
Objective: Real-world testing with single profile

Steps:
1. Select internal test profile (facility or trusted contact)
2. Set MULTI_ENDPOINT_ROUTING_V1=true on backend
3. Enable multi_endpoint_enabled for that profile only
4. Run several days of production-like traffic
5. Monitor logs for: loop escapes, wrong endpoint routing, no-answer issues
6. Check costs haven't increased due to retries/looping
7. Document any issues in GitHub issues for tracking
```

### Phase 3: Facility Pilot
```
Objective: Real facility deployment with monitoring

Steps:
1. Select 1-2 facility profiles with stable usage patterns
2. Ensure both have mobile AND landline configured
3. Enable feature
4. Daily monitoring for first week
5. Check user feedback via support channel
6. If issues: immediate flag disable (no code changes needed)
7. If stable: expand to more facilities
```

### Rollback Procedure (Immediate)
```
If P0/P1 issue appears:

1. Set MULTI_ENDPOINT_ROUTING_V1=false in environment
2. Restart backend service
3. All traffic immediately reverts to legacy routing
4. Verify in logs: "Ingress aware routing disabled"
5. No data migration or cleanup needed
6. Investigate in staging before re-enabling
```

---

## 🔍 Monitoring & Alerts

### Key Metrics to Watch

```
1. Successful endpoint routing rate
   Query: SELECT COUNT(*) FROM call_routing_traces 
          WHERE routing_mode='ingress_aware' AND loop_guard_result='allowed'

2. Fallback to legacy rate
   Query: SELECT COUNT(*) FROM call_routing_traces 
          WHERE routing_mode IN ('failed_safe', 'legacy')

3. Loop guard blocks
   Query: SELECT loop_guard_result, COUNT(*) 
          FROM call_routing_traces 
          WHERE loop_guard_result != 'allowed'
          GROUP BY loop_guard_result

4. Call leg count (detect looping by cost)
   Compare average call legs before/after feature enable

5. No-answer policy violations
   Monitor for voicemail race conditions or double-ring
```

### Alert Thresholds

```
RED ALERT: Disable feature immediately if:
- Loop guards blocking > 5% of calls
- Call leg count increases > 20%
- Same CallSid appears 3+ times in traces
- Endpoint routing sends to wrong endpoint (manual verification)

YELLOW ALERT: Investigate if:
- Ingress confidence drops below 50% high-confidence
- Fallback rate > 30%
- No-answer behavior inconsistent between endpoints
```

---

## 🧠 Key Implementation Details

### Ingress Detection Trust Levels

**High Confidence** (use ingress-aware routing)
- ForwardedFrom header matches endpoint → `high`
- Explicitly forwarded metadata available

**Medium Confidence** (use ingress-aware routing with caution)
- From number matches known endpoint → `medium`
- No explicit forwarding metadata but number lookup succeeds

**Low Confidence** (fail safe to legacy)
- From number doesn't match any endpoint
- Carrier stripped forwarding metadata
- Ambiguous indicators

Use this formula:
```
if (ingressConfidence === 'low' || ingressType === 'unknown') {
  // Fail safe to legacy routing
}
```

### Loop Guard Algorithm

```
1. Never dial back to ingress number (origin check)
2. Never dial Verity virtual number (self-loop check)
3. Block if hop count exceeds threshold (via call trace)
4. Block duplicate call sig in 5-minute window (replay check)
```

All guards must pass before routing. On any block → fail safe to legacy.

### Fail-Safe Behavior

The system **never fails open**:
- Exception in ingress detection → legacy routing
- Exception in loop guards → legacy routing  
- Exception in endpoint resolution → legacy routing
- Low confidence ingress → legacy routing

This ensures users **always** receive a call via some path.

---

## 📝 API Reference

### Endpoint Management

**GET** `/api/v1/profiles/{profileId}/endpoints`
- Fetch all endpoints for a profile

**POST** `/api/v1/profiles/{profileId}/endpoints`
- Create new endpoint
- Body: `{ endpoint_type: "mobile|landline", phone_number: "+1..." }`

**PUT** `/api/v1/profiles/{profileId}/endpoints/{endpointId}`
- Update endpoint phone number or status
- Body: `{ phone_number?: "+1...", is_active?: boolean }`

**DELETE** `/api/v1/profiles/{profileId}/endpoints/{endpointId}`
- Deactivate endpoint

### Routing Preferences

**GET** `/api/v1/profiles/{profileId}/routing-preferences`
- Fetch routing configuration

**PUT** `/api/v1/profiles/{profileId}/routing-preferences`
- Update routing configuration
- Body: ` { multi_endpoint_enabled?: boolean, ring_timeout_seconds?: number, ... }`

### Debugging

**GET** `/api/v1/profiles/{profileId}/routing-traces?limit=20&offset=0`
- Fetch audit trail of routing decisions
- Useful for understanding call flow issues

---

## 🐛 Troubleshooting

### "Call routing to wrong endpoint"
1. Check ingress_confidence in traces
2. If low: carrier likely stripped metadata
3. Solution: Enable high-confidence detection only, or improve From number matching

### "Calls loop infinitely"
1. Check loop_guard_result in traces
2. If ALLOWED: guard condition needs tightening
3. File GitHub issue with trace details
4. Disable feature immediately

### "No-answer voicemail race condition"
1. Check ring_timeout_seconds in routing_prefs
2. Default 30s should work, tuning may be needed per carrier
3. Monitor voicemail answer timing

### "Ingress detection too conservative"
1. Check `ingressConfidence` values in traces
2. If stuck at 'low': Twilio header metadata might not be available
3. Improve From number matching in ingress logic
4. Consider adding carrier-specific detection rules

---

## 📚 Reference Files

- [`/Users/lex/Desktop/safecall/supabase/migrations/20260403120000_add_multi_endpoint_routing.sql`](insert link) - Full migration
- [`/Users/lex/Desktop/safecall/backend/src/services/ingressAwareRouting.ts`](insert link) - Core logic
- [`/Users/lex/Desktop/safecall/backend/src/services/multiEndpointRouting.ts`](insert link) - Feature integration
- [`/Users/lex/Desktop/safecall/backend/src/controllers/MultiEndpointController.ts`](insert link) - REST API
- [`/Users/lex/Desktop/safecall/frontend/docs/multi-endpoint-routing/`](insert link) - Design documentation

---

## ✅ Next Steps

1. **Review** all code changes and migrations
2. **Test** locally with staging database
3. **Run** manual test scenarios from "Test Scenarios" section
4. **Monitor** logs for errors or edge cases
5. **Deploy** to staging environment
6. **Run** one week of staging validation
7. **Enable** feature flag for internal pilot
8. **Document** results and issues
9. **Plan** facility pilot rollout

---

## 🤝 Questions?

- Check `call_routing_traces` table for latest ingress detection logs
- Review test failures in GitHub issues
- Refer to multi-endpoint routing design docs for architectural decisions

Good luck! 🚀
