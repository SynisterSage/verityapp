# API Specification

## Base URL

```
Development: http://localhost:5000/api/v1
Production: https://safecall-api.railway.app/api/v1
```

## Authentication

All endpoints (except `/auth/*`) requires:

```
Authorization: Bearer <JWT_TOKEN>
```

JWT issued by Supabase Auth, includes:
- `sub` (user ID)
- `email`
- `user_type` ('caretaker' | 'elder' | 'admin')

## Error Responses

All errors return:

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "status": 400,
  "timestamp": "2026-01-04T12:00:00Z"
}
```

Common error codes:
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (400)
- `RATE_LIMIT` (429)
- `INTERNAL_ERROR` (500)

---

## Authentication Endpoints

### POST /auth/signup

Register new account.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "name": "John Smith",
  "user_type": "caretaker",
  "phone": "+15551234567"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "usr_12345",
    "email": "john@example.com",
    "name": "John Smith",
    "user_type": "caretaker",
    "created_at": "2026-01-04T12:00:00Z"
  },
  "session": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "expires_in": 3600
  }
}
```

**Errors:**
- `EMAIL_ALREADY_EXISTS` (400)
- `INVALID_EMAIL` (400)
- `WEAK_PASSWORD` (400)

---

### POST /auth/login

Authenticate existing account.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "usr_12345",
    "email": "john@example.com",
    "name": "John Smith",
    "user_type": "caretaker"
  },
  "session": {
    "access_token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "expires_in": 3600
  }
}
```

**Errors:**
- `INVALID_CREDENTIALS` (401)
- `ACCOUNT_DISABLED` (403)
- `EMAIL_NOT_VERIFIED` (403)

---

### POST /auth/refresh-token

Refresh expired access token.

**Request:**
```json
{
  "refresh_token": "eyJhbGc..."
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGc...",
  "expires_in": 3600
}
```

---

### POST /auth/logout

Invalidate session.

**Request:**
```
Authorization: Bearer <JWT>
```

**Response (200):**
```json
{
  "message": "Successfully logged out"
}
```

---

### POST /auth/forgot-password

Initiate password reset.

**Request:**
```json
{
  "email": "john@example.com"
}
```

**Response (200):**
```json
{
  "message": "Password reset email sent"
}
```

---

### POST /auth/reset-password

Reset password with token.

**Request:**
```json
{
  "token": "reset_token_from_email",
  "new_password": "NewSecurePassword123!"
}
```

**Response (200):**
```json
{
  "message": "Password reset successful"
}
```

---

## Profile Endpoints

### POST /profiles

Create new elderly profile (caretaker only).

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "first_name": "Margaret",
  "last_name": "Smith",
  "phone_number": "+15551234567",
  "date_of_birth": "1950-01-15",
  "address": "123 Oak Street",
  "city": "Springfield",
  "state": "IL",
  "zip_code": "62701"
}
```

**Response (201):**
```json
{
  "profile": {
    "id": "prof_12345",
    "first_name": "Margaret",
    "last_name": "Smith",
    "phone_number": "+15551234567",
    "twilio_virtual_number": "+15556789012",
    "activation_code": "SETUP-1234-5678",
    "is_activated": false,
    "activation_code_expires_at": "2026-01-05T12:00:00Z",
    "greeting_audio_url": null,
    "alert_threshold_score": 70,
    "created_at": "2026-01-04T12:00:00Z"
  }
}
```

**Errors:**
- `INVALID_PHONE` (400)
- `PROFILE_LIMIT_REACHED` (400)

---

### GET /profiles

List all profiles for current caretaker.

**Request:**
```
Authorization: Bearer <JWT>
```

**Query Parameters:**
- `limit` (int, default 20)
- `offset` (int, default 0)
- `status` ('active' | 'inactive', optional)

**Response (200):**
```json
{
  "profiles": [
    {
      "id": "prof_12345",
      "first_name": "Margaret",
      "last_name": "Smith",
      "phone_number": "+15551234567",
      "twilio_virtual_number": "+15556789012",
      "is_activated": true,
      "greeting_audio_url": "https://supabase.../greeting.mp3",
      "call_count": 42,
      "fraud_call_count": 2,
      "last_call_at": "2026-01-04T10:30:00Z",
      "created_at": "2026-01-04T12:00:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 3
  }
}
```

---

### GET /profiles/:profileId

Get single profile details.

**Request:**
```
Authorization: Bearer <JWT>
```

**Response (200):**
```json
{
  "profile": {
    "id": "prof_12345",
    "first_name": "Margaret",
    "last_name": "Smith",
    "phone_number": "+15551234567",
    "twilio_virtual_number": "+15556789012",
    "is_activated": true,
    "greeting_audio_url": "https://supabase.../greeting.mp3",
    "greeting_duration_seconds": 8,
    "alert_threshold_score": 70,
    "enable_email_alerts": true,
    "enable_sms_alerts": false,
    "enable_push_alerts": true,
    "call_count": 42,
    "fraud_call_count": 2,
    "blocked_numbers_count": 5,
    "last_call_at": "2026-01-04T10:30:00Z"
  }
}
```

---

### PUT /profiles/:profileId

Update profile settings.

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "alert_threshold_score": 60,
  "enable_email_alerts": true,
  "enable_sms_alerts": true,
  "enable_push_alerts": false
}
```

**Response (200):**
```json
{
  "message": "Profile updated successfully",
  "profile": { /* updated profile */ }
}
```

---

### DELETE /profiles/:profileId

Delete profile (admin/primary caretaker only).

**Request:**
```
Authorization: Bearer <JWT>
```

**Response (200):**
```json
{
  "message": "Profile deleted successfully"
}
```

---

### POST /profiles/:profileId/activate

Confirm phone forwarding activation.

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "activation_code": "SETUP-1234-5678"
}
```

**Response (200):**
```json
{
  "message": "Profile activated successfully",
  "is_activated": true
}
```

**Errors:**
- `INVALID_ACTIVATION_CODE` (400)
- `ACTIVATION_CODE_EXPIRED` (400)
- `ALREADY_ACTIVATED` (400)

---

## Call Endpoints

### GET /calls

List all calls for a profile.

**Request:**
```
Authorization: Bearer <JWT>
```

**Query Parameters:**
- `profile_id` (required)
- `limit` (int, default 20)
- `offset` (int, default 0)
- `status` ('new' | 'reviewed' | 'marked_fraud' | etc, optional)
- `is_fraud` (boolean, optional)
- `from_date` (ISO string, optional)
- `to_date` (ISO string, optional)

**Response (200):**
```json
{
  "calls": [
    {
      "id": "call_12345",
      "profile_id": "prof_12345",
      "caller_id": "+15559876543",
      "caller_name": null,
      "call_received_at": "2026-01-04T10:30:00Z",
      "call_duration_seconds": 18,
      "transcript": "Hello, this is your bank calling. We detected suspicious activity...",
      "fraud_score": 92,
      "fraud_keywords_detected": ["bank", "suspicious", "verify"],
      "is_fraud": true,
      "risk_level": "critical",
      "status": "new",
      "recording_url": "https://supabase.../recording_call_12345.wav",
      "reviewed_at": null
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0
  }
}
```

---

### GET /calls/:callId

Get call details with full transcript.

**Request:**
```
Authorization: Bearer <JWT>
```

**Response (200):**
```json
{
  "call": {
    "id": "call_12345",
    "profile_id": "prof_12345",
    "caller_id": "+15559876543",
    "caller_name": "Unknown",
    "call_received_at": "2026-01-04T10:30:00Z",
    "call_duration_seconds": 18,
    "transcript": "Hello, this is your bank calling. We detected suspicious activity on your account. Please confirm your social security number to verify your identity.",
    "transcript_confidence": 0.95,
    "transcribed_at": "2026-01-04T10:30:25Z",
    "fraud_score": 92,
    "fraud_keywords_detected": ["bank", "verify", "social security", "account"],
    "is_fraud": true,
    "fraud_analysis_details": {
      "keyword_matches": 4,
      "total_words": 32,
      "match_percentage": 12.5,
      "severity_sum": 58
    },
    "risk_level": "critical",
    "status": "new",
    "recording_url": "https://supabase.../recording_call_12345.wav",
    "recording_duration_seconds": 18,
    "alerts": [
      {
        "id": "alert_12345",
        "alert_type": "email",
        "status": "sent",
        "sent_at": "2026-01-04T10:30:28Z"
      }
    ],
    "reviewed_by_user_id": null,
    "reviewed_at": null,
    "caretaker_notes": null
  }
}
```

---

### PUT /calls/:callId/mark-fraud

Mark call as confirmed fraud.

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "notes": "User confirmed they were called but didn't give info"
}
```

**Response (200):**
```json
{
  "message": "Call marked as fraud",
  "status": "marked_fraud"
}
```

---

### PUT /calls/:callId/mark-safe

Mark call as false alarm/legitimate.

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "notes": "This was from her doctor's office"
}
```

**Response (200):**
```json
{
  "message": "Call marked as safe",
  "status": "marked_safe"
}
```

---

### DELETE /calls/:callId

Delete call recording and transcript.

**Request:**
```
Authorization: Bearer <JWT>
```

**Response (200):**
```json
{
  "message": "Call deleted successfully"
}
```

---

### POST /calls/:callId/block-caller

Block caller and add to blocked list.

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "block_reason": "fraud"
}
```

**Response (200):**
```json
{
  "message": "Caller blocked",
  "blocked_number_id": "bn_12345"
}
```

---

## Twilio Webhooks

### POST /webhook/twilio/call-incoming

**Called by:** Twilio when incoming call received

**Request (Twilio sends):**
```
POST /webhook/twilio/call-incoming
From=+15559876543
To=+15556789012
CallSid=CA1234567890abcdef1234567890abcdef
AccountSid=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Response (TwiML):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>https://supabase-url.../greeting-audio-prof_12345.mp3</Play>
  <Record 
    action="/webhook/twilio/recording-ready" 
    method="POST"
    timeout="10"
    maxLength="300"
  />
</Response>
```

**Backend Processing:**
1. Create `call` record (status: "incoming")
2. Fetch greeting audio URL from database
3. Return TwiML to play greeting
4. Twilio records message

---

### POST /webhook/twilio/recording-ready

**Called by:** Twilio after voicemail recorded

**Request (Twilio sends):**
```
POST /webhook/twilio/recording-ready
CallSid=CA1234567890abcdef1234567890abcdef
RecordingSid=RE1234567890abcdef1234567890abcdef
RecordingUrl=https://api.twilio.com/2010-04-01/Accounts/AC.../Recordings/RE...
RecordingDuration=18
```

**Backend Processing:**
1. Download recording from Twilio
2. Upload to Supabase Storage
3. Send to Azure Speech-to-Text API
4. Wait for transcription (~3-5 seconds)
5. Analyze for fraud keywords
6. Create alert if fraud detected
7. Broadcast via Supabase Realtime
8. Send email notification

**Response (202):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

---

## Alert Endpoints

### GET /alerts

List alerts for current user.

**Request:**
```
Authorization: Bearer <JWT>
```

**Query Parameters:**
- `limit` (int, default 20)
- `offset` (int, default 0)
- `status` ('pending' | 'sent' | 'read', optional)
- `unread_only` (boolean, default false)

**Response (200):**
```json
{
  "alerts": [
    {
      "id": "alert_12345",
      "call_id": "call_12345",
      "profile_id": "prof_12345",
      "alert_type": "email",
      "alert_title": "⚠️ FRAUD ALERT - Suspicious call to Margaret Smith",
      "alert_body": "A suspicious call was received...",
      "status": "sent",
      "sent_at": "2026-01-04T10:30:28Z",
      "read_at": null,
      "call": {
        "caller_id": "+15559876543",
        "transcript": "Hello, this is your bank calling...",
        "fraud_score": 92,
        "risk_level": "critical"
      }
    }
  ],
  "pagination": {
    "total": 5,
    "unread_count": 3
  }
}
```

---

### PUT /alerts/:alertId/read

Mark alert as read.

**Request:**
```
Authorization: Bearer <JWT>
```

**Response (200):**
```json
{
  "message": "Alert marked as read",
  "read_at": "2026-01-04T12:00:00Z"
}
```

---

## Settings Endpoints

### GET /settings

Get user settings.

**Request:**
```
Authorization: Bearer <JWT>
```

**Response (200):**
```json
{
  "settings": {
    "email_notifications_enabled": true,
    "sms_notifications_enabled": false,
    "push_notifications_enabled": true,
    "email_frequency": "immediate",
    "timezone": "America/Chicago",
    "language": "en",
    "dark_mode": false
  }
}
```

---

### PUT /settings

Update user settings.

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "email_notifications_enabled": true,
  "sms_notifications_enabled": true,
  "email_frequency": "daily_digest",
  "timezone": "America/Chicago"
}
```

**Response (200):**
```json
{
  "message": "Settings updated",
  "settings": { /* updated settings */ }
}
```

---

### PUT /profiles/:profileId/fraud-keywords

Update fraud detection keywords for profile.

**Request:**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "keywords": [
    {
      "keyword": "wire money",
      "severity_weight": 20,
      "is_active": true
    },
    {
      "keyword": "verify account",
      "severity_weight": 16,
      "is_active": true
    },
    {
      "keyword": "my custom keyword",
      "severity_weight": 15,
      "is_active": true
    }
  ]
}
```

**Response (200):**
```json
{
  "message": "Fraud keywords updated",
  "keywords": [ /* updated keywords */ ]
}
```

---

## Real-time Subscriptions (Supabase Realtime)

### Subscribe to Calls

```typescript
// Frontend code
const subscription = supabase
  .from(`calls:profile_id=eq.prof_12345`)
  .on('INSERT', payload => {
    // New call arrived
    console.log('New call:', payload.new);
    // Update UI instantly
  })
  .on('UPDATE', payload => {
    // Call status changed (e.g., marked_fraud)
    console.log('Call updated:', payload.new);
  })
  .subscribe();

// Cleanup
subscription.unsubscribe();
```

### Subscribe to Alerts

```typescript
const subscription = supabase
  .from(`alerts:caretaker_id=eq.user_12345`)
  .on('INSERT', payload => {
    // New alert (fraud detected)
    console.log('New alert:', payload.new);
    // Show notification
  })
  .subscribe();
```

---

## Rate Limiting

All endpoints rate limited per user:

```
- Auth endpoints: 5 requests per minute
- Read endpoints: 100 requests per minute
- Write endpoints: 30 requests per minute
- Webhook endpoints: 1000 requests per minute
```

**Rate limit headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1672963200
```

---

## Pagination

All list endpoints support pagination:

```
Query parameters:
- limit: 1-100 (default 20)
- offset: 0+ (default 0)

Response includes:
{
  "data": [ ... ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150,
    "page": 1,
    "pages": 8
  }
}
```

---

## Sorting

Common sorting patterns:

```
GET /calls?profile_id=prof_123&sort=-created_at
GET /calls?profile_id=prof_123&sort=fraud_score

Prefix with - for descending order
```

---

## Filtering

```
GET /calls?profile_id=prof_123&is_fraud=true&from_date=2026-01-01
GET /calls?profile_id=prof_123&risk_level=critical
GET /calls?profile_id=prof_123&status=new
```
