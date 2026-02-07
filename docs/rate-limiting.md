# Rate Limiting Configuration

## Overview
Rate limiting has been implemented to protect sensitive API endpoints from abuse and ensure fair resource usage.

## Number Assignment Endpoint Security

**Endpoint:** `POST /profiles/:profileId/assign-number`

### Rate Limit Rules
- **Max Requests:** 3 assignments per hour
- **Window:** 1 hour (60 minutes)
- **Key:** By authenticated user (via JWT token) or IP address if unauthenticated
- **Status Code:** 429 (Too Many Requests)

### Why 3 per hour?
- During normal onboarding: Users only need 1 assignment
- Emergency reassignments: Allows 2-3 total per hour if needed
- Prevents abuse: Stops automated scripts from exhausting the number pool
- Realistic usage: A user won't need more than 3 assignments in an hour

### Error Handling

**Rate Limit Exceeded Response:**
```json
{
  "error": "Too many number assignments. You can assign a maximum of 3 numbers per hour.",
  "retryAfter": <timestamp>
}
```

**Frontend User Message:**
```
"Too many assignment attempts. Please wait an hour before trying again."
```

## Implementation Details

### Backend (Express Rate Limit Middleware)
```typescript
// backend/src/routes/index.ts
const assignNumberLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => {
    // Rate limit by user JWT token
    const token = extractBearerToken(req);
    return token || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many number assignments...',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

apiRouter.post(
  '/profiles/:profileId/assign-number',
  assignNumberLimiter,
  TwilioNumberPoolController.assignNumber
);
```

### Frontend Error Handling
```typescript
// frontend/src/screens/onboarding/CreateProfileScreen.tsx
if (statusCode === 429 || errorMessage.includes('Too many')) {
  setError('Too many assignment attempts. Please wait an hour before trying again.');
}
```

## Monitoring

Rate limit violations are logged via express-rate-limit headers:
- `RateLimit-Limit`: 3
- `RateLimit-Remaining`: Requests remaining
- `RateLimit-Reset`: Unix timestamp when limit resets

Monitor for patterns of rate limit hits to detect abuse attempts.

## Future Enhancements

1. **Database-backed Store:** Replace in-memory store with Redis for multi-server deployments
2. **Graduated Responses:** Start with warnings, then throttle, then block
3. **Admin Bypass:** Allow admins to bypass rate limits for testing
4. **Alerts:** Alert on repeated rate limit violations (possible attack)
5. **Per-Profile Limits:** Could add limits per profile (fewer reassignments allowed)

## Testing

To test rate limiting locally:

```bash
# First request - succeeds
curl -X POST http://localhost:5000/api/v1/profiles/PROFILE_ID/assign-number \
  -H "Authorization: Bearer TOKEN"

# Second request - succeeds
curl -X POST http://localhost:5000/api/v1/profiles/PROFILE_ID/assign-number \
  -H "Authorization: Bearer TOKEN"

# Third request - succeeds
curl -X POST http://localhost:5000/api/v1/profiles/PROFILE_ID/assign-number \
  -H "Authorization: Bearer TOKEN"

# Fourth request - returns 429
curl -X POST http://localhost:5000/api/v1/profiles/PROFILE_ID/assign-number \
  -H "Authorization: Bearer TOKEN"
# Response: {"error": "Too many number assignments..."}
```

## Compliance

- ✅ Prevents abuse of limited resource (Twilio number pool)
- ✅ Fair allocation across users
- ✅ Protects against automated attacks
- ✅ Informative error messages for users
- ✅ Audit-friendly (limited in logs with rate limit violations)
