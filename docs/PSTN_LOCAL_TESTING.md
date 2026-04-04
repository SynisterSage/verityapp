# Multi-Endpoint PSTN Local Testing Guide

Quick reference for testing PSTN multi-endpoint routing locally.

## Prerequisites

- Local backend running: `cd backend && npm run dev`
- ngrok tunnel for Twilio webhooks (optional, for real Twilio testing)
- Test profile with endpoints set up in database
- Supabase local instance or staging database connection

## Quick Test: Phone Normalization & Matching

```bash
# Test utility script
cd backend
npx ts-node scripts/test-multi-endpoint-routing.ts
```

Output will show:
- Phone number normalization examples
- Phone number matching tests
- Ingress detection results
- Loop guard behavior

## API Testing with curl

### 1. Create Test Endpoints

```bash
# Create mobile endpoint
curl -X POST http://localhost:4000/api/v1/profiles/{profileId}/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint_type": "mobile",
    "phone_number": "+15551234567"
  }'

# Create landline endpoint
curl -X POST http://localhost:4000/api/v1/profiles/{profileId}/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint_type": "landline",
    "phone_number": "+15559876543"
  }'
```

### 2. List Endpoints

```bash
curl http://localhost:4000/api/v1/profiles/{profileId}/endpoints
```

Expected response:
```json
{
  "endpoints": [
    {
      "id": "xxx",
      "endpoint_type": "mobile",
      "phone_number": "+15551234567",
      "is_active": true,
      "created_at": "2026-04-03T...",
      "last_dialed_at": null
    },
    {
      "id": "yyy",
      "endpoint_type": "landline",
      "phone_number": "+15559876543",
      "is_active": true,
      "created_at": "2026-04-03T...",
      "last_dialed_at": null
    }
  ]
}
```

### 3. Enable Multi-Endpoint Routing

```bash
# Get current preferences
curl http://localhost:4000/api/v1/profiles/{profileId}/routing-preferences

# Enable feature
curl -X PUT http://localhost:4000/api/v1/profiles/{profileId}/routing-preferences \
  -H "Content-Type: application/json" \
  -d '{
    "multi_endpoint_enabled": true,
    "use_ingress_aware_routing": true,
    "ring_timeout_seconds": 30,
    "no_answer_action": "voicemail"
  }'
```

### 4. Validate Configuration

```bash
# Admin endpoint to validate setup
curl http://localhost:4000/api/v1/admin/validate-endpoint-config/{profileId}

# Response if valid:
{
  "valid": true,
  "errors": []
}

# Response if invalid:
{
  "valid": false,
  "errors": [
    "Endpoint (mobile) cannot equal Verity number (+15559999999)"
  ]
}
```

### 5. View Routing Traces (Debug)

```bash
# Get recent routing decisions
curl "http://localhost:4000/api/v1/profiles/{profileId}/routing-traces?limit=10"

# Response shows call flow:
{
  "traces": [
    {
      "call_id": "uuid",
      "profile_id": "uuid",
      "ingress_detected": "mobile",
      "ingress_confidence": "high",
      "forwarded_from_number": "+15551234567",
      "routing_mode": "ingress_aware",
      "target_endpoint_type": "mobile",
      "loop_guard_result": "allowed",
      "hop_count": 1,
      "created_at": "2026-04-03T..."
    }
  ]
}
```

## Database Inspection

### Check Endpoints

```sql
SELECT * FROM profile_endpoints 
WHERE profile_id = '{profileId}';
```

### Check Routing Preferences

```sql
SELECT * FROM profile_routing_prefs 
WHERE profile_id = '{profileId}';
```

### View Routing Traces

```sql
SELECT 
  call_id,
  ingress_detected,
  ingress_confidence,
  routing_mode,
  loop_guard_result,
  created_at
FROM call_routing_traces
WHERE profile_id = '{profileId}'
ORDER BY created_at DESC
LIMIT 20;
```

## Local Twilio Testing (Advanced)

To test with actual Twilio calls locally:

### 1. Setup ngrok tunnel

```bash
# In separate terminal
ngrok http 4000

# Note the forwarding URL: https://xxxx-xx-xxx-xxx-xx.ngrok.io
```

### 2. Update Twilio webhook URL

In Twilio console:
- Set Voice webhook to: `https://xxxx-xx-xxx-xxx-xx.ngrok.io/api/v1/webhook/twilio/call-incoming`

### 3. Configure environment

Set in `.env.development`:
```bash
PUBLIC_API_URL=https://xxxx-xx-xxx-xxx-xx.ngrok.io
MULTI_ENDPOINT_ROUTING_V1=false  # Start with off to test legacy
```

### 4. Monitor logs

```bash
# Watch backend logs in real-time
tail -f jet-logger.log | grep -E '\[ingress\]|\[loop-guard\]|\[endpoint\]'
```

### 5. Test call flow

```
1. Call your Twilio number from external phone
2. Watch logs for ingress detection:
   [ingress] Ingress detected: type=mobile confidence=high
3. Verify loop guards:
   [loop-guard] ALLOWED: Call passed all loop guards
4. Check routing decision:
   [endpoint-resolve] Resolved mobile endpoint: +15551234567
5. Call should ring the endpoint
```

## Testing Scenarios

### Scenario: Mobile Ingress

Web UI flow:
1. Create test profile
2. Add endpoints:
   - mobile: `+15551234567`
   - landline: `+15559876543`
3. Enable multi-endpoint routing
4. From another phone, call Twilio number (simulating mobile forward)
5. Check logs: should detect mobile ingress and route back

### Scenario: Landline Ingress

Same as above, but call from landline number instead.

### Scenario: Low Confidence Ingress

1. Delete mobile endpoint
2. Call from mobile number
3. System can't determine endpoint → logs "Unknown ingress type"
4. Call falls back to legacy routing (voicemail)

### Scenario: Loop Prevention

1. Attempt to set mobile = Verity number (API validation should reject)
2. Or manually in DB, create this invalid state
3. Dial from that number
4. Log will show: `[loop-guard] BLOCKED: destination matches Verity number`

## Common Issues

### Logs show "Profile not found"
- Check that profileId is correct
- Verify database connection is working

### "No active endpoints configured"
- Create endpoints via API or SQL
- Check `is_active = true` in database

### "Low confidence ingress"
- Twilio may not be sending ForwardedFrom metadata
- System falls back to From number matching
- If From doesn't match any endpoint → unknown ingress

### "Call routing to wrong endpoint"
- Check `ingress_detected` in routing_traces
- Inspect `forwarded_from_number` field
- May need to improve carrier detection logic

## Next Steps

✅ Test locally with above commands  
✅ Deploy migration to staging database  
✅ Run manual end-to-end call tests  
✅ Monitor `call_routing_traces` for real calls  
✅ Verify loop guards work as expected  
✅ Check no-answer timeout behavior  

Good luck! 🚀
