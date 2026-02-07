# Data Privacy & PII Leak Prevention

## Overview

SafeCall handles extremely sensitive data (elderly users' phone numbers, family relationships, fraud patterns). This document details the **multi-layered approach** to prevent data leaks and class-action lawsuits.

## Threat Model

**What we protect:**
- Full phone numbers (caller ID, dialed numbers)
- Personal names (first/last)
- Email addresses
- Security tokens (PIN hashes, passcodes)
- Call transcripts (may contain SSN, credit card info)
- Profile relationships (who is connected to whom)
- Health/location data (inferred from call patterns)

**How data could leak:**
1. ❌ Accidental exposure in API responses (returning full phone numbers)
2. ❌ RLS policy bypass (malicious admin query)
3. ❌ PII in error messages ("User with email john@example.com not found")
4. ❌ PII in audit logs (logging full transcripts)
5. ❌ SQL injection exposing columns
6. ❌ Verbose error responses in production
7. ❌ Backup/export containing unredacted data
8. ❌ Third-party services (logs, monitoring) with access to raw data

---

## Defense Layers

### Layer 1: Database Row-Level Security (RLS)

**Policy:** Only authorized users can query profiles/calls/alerts

```sql
CREATE POLICY profiles_read ON profiles
  FOR SELECT
  USING (
    caretaker_id = auth.uid()  -- Profile owner
    OR EXISTS (
      SELECT 1 FROM profile_members pm
      WHERE pm.profile_id = profiles.id
        AND pm.user_id = auth.uid()  -- Invited family member
    )
  );
```

**Coverage:**
- ✅ profiles (caretaker + invited members only)
- ✅ calls (only authorized family can see)
- ✅ alerts (only authorized family can see)
- ✅ trusted_contacts (only caretaker can manage)
- ✅ blocked_callers (only caretaker can manage)
- ✅ twilio_number_pool (service role only)

**Strength:** Even if backend is compromised, unauthenticated queries return empty results.

**Verification:**
```bash
# Test RLS is working
supabase login
supabase link --project-ref YOUR_PROJECT
supabase test db
```

---

### Layer 2: API Response Sanitization

**File:** `backend/src/middleware/dataSanitizer.ts`

**What we redact:**
- Phone numbers → Last 4 digits only (e.g., "...1234")
- Names → Shown (necessary for app function)
- Hashes → Strip completely (pin_hash, passcode_hash, password_hash)
- Salts → Strip completely
- Transcripts → Don't return from API

**Example:**

```typescript
// ❌ BEFORE (dangerous)
{
  id: "123",
  first_name: "John",
  last_name: "Smith",
  phone_number: "+1-555-123-4567",  // ❌ EXPOSED
  from_number: "+1-555-987-6543",   // ❌ EXPOSED
  pin_hash: "$2b$12$...",            // ❌ EXPOSED
}

// ✅ AFTER (safe)
{
  id: "123",
  first_name: "John",
  last_name: "Smith",
  phone_number_last_four: "4567",    // ✅ Redacted
  from_number_last_four: "6543",     // ✅ Redacted
  has_passcode: true,                 // ✅ Boolean, no hash
}
```

**Usage in Controllers:**

```typescript
// When returning profiles
const profiles = caretakerProfiles.map(sanitizeProfile);

// When returning calls
const calls = callRows.map(sanitizeCall);

// When returning errors
return res.status(400).json({
  error: sanitizeErrorResponse(error, "updating profile"),
});
```

---

### Layer 3: Input Validation & SQL Injection Prevention

**File:** `backend/src/middleware/validationSchemas.ts`

**Protection:**
- All POST/PUT data validated against Zod schemas
- Rejects unexpected fields (e.g., injected `password_hash`)
- Type checking prevents integer/float injection in WHERE clauses

```typescript
const createProfileSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone_number: z.string().regex(/^[\d+\-().x\s]*$/).optional(),
  // Rejects: phone_number: "'; DROP TABLE profiles; --"
});
```

---

### Layer 4: Audit Logging (Non-PII)

**File:** `backend/src/middleware/dataSanitizer.ts` → `sanitizeAuditLog()`

**What we log:**
- ✅ User ID (UUID, no PII)
- ✅ Profile ID (UUID, no PII)
- ✅ Action type (e.g., "CREATE_PROFILE", "DELETE_CALL")
- ✅ Timestamp
- ✅ Result status (success/failure)

**What we DON'T log:**
- ❌ Full phone numbers
- ❌ Transcripts
- ❌ Email addresses
- ❌ Names
- ❌ Auth tokens

```typescript
// ✅ SAFE audit entry
{
  action: "CREATE_PROFILE",
  user_id: "550e8400-e29b-41d4-a716-446655440000",
  profile_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  timestamp: "2026-02-07T15:30:00Z",
  status: "success"
}

// ❌ NEVER log this
{
  action: "CREATE_PROFILE",
  user_id: "john@example.com",  // ❌ PII
  phone_number: "+1-555-123-4567",  // ❌ PII
  transcript: "Hi, this is John calling...",  // ❌ PII
}
```

---

### Layer 5: Error Message Sanitization

**Function:** `sanitizeErrorResponse(error, context)`

**Protects against:** Information disclosure via error messages

```typescript
// ❌ DANGEROUS
return res.status(400).json({
  error: "User with email alice@example.com not found",  // Leaks email
});

// ✅ SAFE
return res.status(400).json({
  error: "An error occurred during profile lookup. Please try again.",
});
```

**Rules:**
- Generic messages in production
- Detailed logs internally
- Never echo user input in errors
- Never reveal database structure ("Column X not found")

---

### Layer 6: Field-Level Encryption (Future)

**Current:** Hash passwords, salt PINs
**Future:** Encrypt phone numbers at rest

```sql
-- When implemented:
ALTER TABLE profiles 
  ADD COLUMN phone_number_encrypted bytea;
  
UPDATE profiles 
SET phone_number_encrypted = pgcrypto.encrypt(phone_number::bytea, secret, 'aes')
WHERE phone_number IS NOT NULL;
```

---

### Layer 7: Compliance & Legal

**GDPR Compliance:**
- ✅ User can export their data (DSAR)
- ✅ User can delete account + all data
- ✅ Data retention policies (logs deleted after 7 years)

**CCPA Compliance:**
- ✅ Privacy policy published
- ✅ Data collection disclosed
- ✅ User can opt-out

**Avoid Class Actions:**
- ✅ No accidental data exposure
- ✅ Transparent privacy policy
- ✅ Clear consent for processing
- ✅ Quick response to breaches

---

## Testing Data Leak Prevention

### 1. Verify RLS Blocks Unauthorized Access

```bash
# Create a test JWT with wrong user_id
curl -X GET http://localhost:5000/api/v1/profiles \
  -H "Authorization: Bearer WRONG_JWT"

# Should return 403 Forbidden or empty results
```

### 2. Verify API Responses Don't Leak Data

```bash
curl -X GET http://localhost:5000/api/v1/profiles/123 \
  -H "Authorization: Bearer VALID_JWT" | jq .

# Verify output:
# ❌ Should NOT have: phone_number (full)
# ❌ Should NOT have: pin_hash, passcode_hash
# ✅ Should have: phone_number_last_four
# ✅ Should have: has_passcode (boolean)
```

### 3. Verify Audit Logs Are PII-Free

```sql
SELECT * FROM audit_logs 
  WHERE created_at > now() - interval '1 hour'
  ORDER BY created_at DESC;

-- Verify:
-- ❌ No email addresses
-- ❌ No phone numbers
-- ❌ No transcripts
-- ✅ All UUIDs and timestamps
```

### 4. Verify Error Messages Don't Leak Info

```bash
curl -X POST http://localhost:5000/api/v1/profiles \
  -H "Authorization: Bearer VALID_JWT" \
  -d '{"first_name":"", "last_name":""}'

# Should see: "Validation failed" or generic error
# Should NOT see: SQL errors, internal IDs, stack traces
```

---

## Production Checklist

- [ ] RLS policies enabled on all sensitive tables
- [ ] All API responses use sanitization functions
- [ ] Error messages don't leak PII
- [ ] Audit logs don't contain sensitive data
- [ ] Zod validation prevents injection attacks
- [ ] Rate limiting prevents enumeration attacks
- [ ] HTTPS enforced (no HTTP)
- [ ] Security headers set (CSP, X-Frame-Options, etc.)
- [ ] Secrets not in code or logs
- [ ] Backup tested for data exposure
- [ ] Incident response plan documented
- [ ] Privacy policy accurate and published

---

## Incident Response

**If data is exposed:**

1. ✅ **Identify scope:** Which data? Which users?
2. ✅ **Containment:** Disable affected API, revoke auth tokens
3. ✅ **Notification:** Notify users within 72 hours (GDPR)
4. ✅ **Investigation:** Post-mortem, fix root cause
5. ✅ **Prevention:** Update policies, add tests
6. ✅ **Documentation:** Log all steps for legal review

---

## References

- [GDPR Article 33 - Notification](https://gdpr-info.eu/art-33-gdpr/)
- [CCPA Rights](https://oag.ca.gov/privacy/ccpa)
- [OWASP PII Guidelines](https://owasp.org/www-project-pii-data-identification-and-decision-framework/)
- [Supabase RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)

---

## Support

For security concerns: security@safecall.app
For data deletion: contact support with user ID
For audit logs: reserved for authorized compliance team only
