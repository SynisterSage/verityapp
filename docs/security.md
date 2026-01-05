# Security & Privacy

## Overview

SafeCall handles sensitive personal information:
- **Voice recordings** of elderly people
- **Phone numbers** and caller identification
- **Audio transcripts** containing private conversations
- **Health/cognitive information** (dementia, decline)
- **Family relationships** and caretaker roles

This document outlines security measures to protect this data.

---

## Data Classification

### Personally Identifiable Information (PII)

**High Risk:**
- Full names
- Phone numbers
- Social Security numbers (if mentioned in transcripts)
- Financial account numbers
- Home addresses
- Email addresses

**Medium Risk:**
- First names only
- Approximate location
- Age/date of birth
- Caregiver relationship

### Sensitive Data

**Critical:**
- Voice recordings (biometric data)
- Call transcripts (may contain private information)
- Health information (dementia, mental decline)
- Financial discussions

**Handling:**
- Encrypted at rest and in transit
- Minimum required retention
- Audit logging of access
- Regular security reviews

---

## Authentication & Authorization

### User Authentication

**Method:** Supabase Auth (JWT tokens)

**Features:**
- Email + password (no SMS for elderly users - too confusing)
- Email verification required
- Password requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one number
  - At least one special character

**Session Management:**
- Access token: 1 hour expiration
- Refresh token: 30 days expiration
- Refresh tokens invalidated on logout
- Device fingerprinting (optional, future)

### Role-Based Access Control (RBAC)

```
User Types:
- caretaker (primary user, full access)
- elder (limited access, can only view their own profile)
- admin (support staff, limited access)
- viewer (read-only family member)

Profile-level Roles:
- admin (can modify settings, block callers, delete recordings)
- editor (can view/listen, block callers)
- viewer (can view/listen only)
```

**Row-Level Security (RLS) via Supabase:**

```sql
-- Users only see their own profile
CREATE POLICY users_can_see_own ON users
  FOR SELECT USING (id = auth.uid());

-- Caretakers see profiles they manage
CREATE POLICY caretakers_can_see_profiles ON profiles
  FOR SELECT USING (caretaker_id = auth.uid());

-- Family members see profiles they're invited to
CREATE POLICY family_can_see_calls ON calls
  FOR SELECT USING (
    profile_id IN (
      SELECT id FROM profiles WHERE caretaker_id = auth.uid()
      UNION
      SELECT profile_id FROM family_members 
        WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Users can only modify their own data
CREATE POLICY users_can_modify_own ON users
  FOR UPDATE USING (id = auth.uid());
```

---

## Data Encryption

### In Transit (HTTPS/TLS)

**All connections encrypted:**
- Frontend to Backend: TLS 1.3
- Backend to Twilio: TLS 1.3
- Backend to Azure: TLS 1.3
- Backend to Supabase: TLS 1.3

**Certificate pinning (future):**
- Pin backend certificate
- Prevent MITM attacks

### At Rest (Database)

**Supabase encryption:**
- Database encrypted with AES-256
- Automatic key rotation
- Backups encrypted

**Sensitive fields encrypted:**

```sql
-- Voice recordings
ALTER TABLE calls 
  ADD COLUMN recording_url_encrypted VARCHAR(500) GENERATED ALWAYS AS (
    pgp_sym_encrypt(recording_url, 'encryption_key')
  ) STORED;

-- Transcripts (consider encrypting)
ALTER TABLE calls
  ADD COLUMN transcript_encrypted TEXT;
```

**Encryption Key Management:**
- Encryption keys stored in Supabase Vault (encrypted separately)
- Keys rotated annually
- Access logged via audit table

### File Storage (Recordings)

**Supabase Storage:**
- Files encrypted at rest
- Secure signed URLs for access (time-limited)
- Automatic cleanup after retention period
- Version control disabled (no leaks)

**Access Control:**
```sql
-- Only caretaker/family can download recordings
CREATE POLICY download_own_recordings ON storage.objects
  FOR SELECT USING (
    bucket_id = 'call-recordings' AND
    owner_id IN (
      SELECT caretaker_id FROM profiles 
      WHERE id = (split_part(name, '/', 2))::uuid
    )
  );
```

**URL Signing:**
```typescript
// Backend generates time-limited download URL
const { data } = await supabase.storage
  .from('call-recordings')
  .createSignedUrl('call_12345.wav', 3600); // Valid for 1 hour
```

---

## API Security

### Input Validation

**All endpoints validate input:**

```typescript
// Example: Phone number validation
const validatePhoneNumber = (phone: string) => {
  const regex = /^\+?[0-9]{10,15}$/;
  if (!regex.test(phone)) {
    throw new ValidationError('Invalid phone format');
  }
};

// Example: Text validation
const validateTranscript = (text: string) => {
  if (text.length > 10000) {
    throw new ValidationError('Transcript too long');
  }
  // Check for injection attempts
  if (/<script|javascript:|on\w+=/i.test(text)) {
    throw new ValidationError('Invalid characters detected');
  }
};
```

### CORS (Cross-Origin Resource Sharing)

**Allowed origins:**
- `https://safecall.app` (production)
- `https://app.safecall.app` (web app)
- `exp://localhost:*` (Expo development)

**Disallowed:**
- No wildcard (`*`) CORS
- Credentials required for sensitive endpoints

### Rate Limiting

**Per-user limits:**
```
- Authentication: 5 req/min
- API calls: 100 req/min
- File uploads: 10 req/min
- Webhook calls: 1000 req/min (Twilio)
```

**Implementation:**
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: (req) => req.user.id, // Per-user limit
  handler: (req, res) => {
    res.status(429).json({
      error: 'RATE_LIMIT',
      message: 'Too many requests. Try again later.',
      retryAfter: 60
    });
  }
});

app.use('/api/v1/', limiter);
```

### JWT Security

**Token structure:**
```json
{
  "sub": "user_12345",
  "email": "john@example.com",
  "user_type": "caretaker",
  "iat": 1672963200,
  "exp": 1672966800
}
```

**Best practices:**
- Tokens signed with RS256 (asymmetric)
- Supabase handles signing (we don't store secrets client-side)
- Tokens never logged
- Tokens stored in secure HTTP-only cookies (web)
- No token in localStorage (vulnerable to XSS)

### CSRF Protection

**All state-changing endpoints require CSRF tokens:**

```typescript
// Middleware
const csrfProtection = require('csurf');
const sessionParser = require('express-session');

app.use(sessionParser({ secret: process.env.SESSION_SECRET }));
app.use(csrfProtection({ cookie: false }));

// On form render
app.get('/calls/:id/block', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// On form submit
app.post('/calls/:id/block', csrfProtection, (req, res) => {
  // CSRF token validated automatically
});
```

---

## Audit Logging

**All sensitive actions logged:**

```sql
INSERT INTO audit_logs (action, entity_type, entity_id, user_id, details, status) VALUES
('call_listened', 'call', 'call_12345', 'user_12345', '{"duration": "00:18"}', 'success'),
('transcript_downloaded', 'call', 'call_12345', 'user_12345', '{}', 'success'),
('call_deleted', 'call', 'call_12345', 'user_12345', '{}', 'success'),
('user_login', 'user', 'user_12345', 'user_12345', '{"ip": "203.0.113.5"}', 'success'),
('permission_granted', 'family_members', 'fm_12345', 'user_12345', '{"role": "viewer"}', 'success');
```

**Audit logs:**
- Never deleted (7-year retention)
- Never modified
- Encrypted storage
- Regular analysis for suspicious patterns
- Automated alerts on:
  - Mass download attempts
  - Multiple failed logins
  - Permission escalation
  - Off-hours access

---

## Compliance & Legal

### GDPR (General Data Protection Regulation)

**User Rights:**
- Right to access: Users can export their data
- Right to be forgotten: Users can request deletion
- Right to data portability: Users can download data in standard format
- Right to rectification: Users can correct their information

**Implementation:**
```typescript
// Export user data
app.get('/api/v1/data-export', async (req, res) => {
  const userData = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user.id)
    .single();
  
  const callData = await supabase
    .from('calls')
    .select('*')
    .eq('profile_id', req.user.profile_id);
  
  // Return as JSON/CSV
});

// Delete user data
app.delete('/api/v1/delete-account', async (req, res) => {
  // Anonymize recordings
  // Delete transcripts
  // Delete personal info
  // Keep audit logs
});
```

### HIPAA (Health Insurance Portability & Accountability)

**If handling health information:**
- Business Associate Agreement (BAA) required
- Encryption mandatory
- Access controls strict
- Audit logging mandatory
- Breach notification within 60 days
- **Current status:** Not HIPAA-compliant (future version)

### CCPA (California Consumer Privacy Act)

**User requests:**
- Know what data is collected
- Delete personal information
- Opt-out of data sales
- Non-discrimination for exercising rights

**Implementation:**
- Privacy policy clearly states data use
- Users can request deletion
- Users notified of data breaches
- Regular privacy audits

### State Privacy Laws

**Compliance checklist:**
- [ ] GDPR (EU)
- [ ] CCPA (California)
- [ ] Virginia VCDPA
- [ ] Colorado CPA
- [ ] Utah UCPA
- [ ] Montana MCDPA
- [ ] Delaware DPDPA

---

## Vulnerability Management

### Security Testing

**Regular audits:**
- Monthly penetration testing
- Quarterly code reviews
- Bi-annual security assessments
- Dependency scanning (daily)

**Tools:**
```bash
# Dependency scanning
npm audit
npx snyk test

# SAST (Static Analysis Security Testing)
npm install -D eslint-plugin-security
npx eslint --ext .js,.ts src/

# DAST (Dynamic Analysis Security Testing)
# Run ZAP or Burp Suite against staging
```

### Reporting

**Vulnerability disclosure:**
- Security email: security@safecall.app
- HackerOne program (future)
- 90-day responsible disclosure
- CVE assignment if critical

### Dependencies

**Package management:**
- Lock file committed (package-lock.json)
- Regular dependency updates
- Automated vulnerability alerts
- Deprecated package removal

---

## Third-Party Security

### Twilio

**Security practices:**
- PCI DSS compliant
- SOC 2 certified
- TLS 1.3 encryption
- Regular security audits

**Risks:**
- Twilio stores recordings temporarily
- Ensure data deletion requests honored
- Use Twilio Regions for data residency

### Azure Speech-to-Text

**Security practices:**
- HIPAA eligible (if configured)
- SOC 2 certified
- Data encrypted in transit/rest
- No default model training on customer data

**Configuration:**
```typescript
// Disable learning models
const speechConfig = new SpeechConfig(
  subscriptionKey,
  region
);
speechConfig.enableTelemetry = false; // Don't send usage to Microsoft
```

### Supabase

**Security practices:**
- SOC 2 Type II certified
- GDPR compliant
- DPA available
- Regular penetration testing

**Trust us:**
- Security audit reports available
- Transparency reports published
- Bug bounty program active

---

## Incident Response

### Security Incident Plan

**Discovery:**
1. Identify incident (automated alert or report)
2. Isolate affected systems
3. Gather evidence (logs, snapshots)
4. Notify incident response team

**Containment:**
1. Stop ongoing breach
2. Revoke compromised credentials
3. Patch vulnerability
4. Monitor for further attempts

**Communication:**
1. Notify affected users within 72 hours
2. Provide credit monitoring (if needed)
3. Publish incident report
4. Regulatory notifications (if required)

**Recovery:**
1. Patch & verify fix
2. Restore from backups
3. Monitor for re-infection
4. Conduct post-mortem

### Breach Notification

**Required notifications:**
- State Attorney General (if >250 people in state)
- Credit bureaus (if SSN exposed)
- Users (if personal data exposed)
- Regulatory bodies (if HIPAA/PCI violation)

**Timeline:**
- Immediately: Isolate, contain
- 24-48 hours: Initial notification
- 72 hours: Full details to users
- 30 days: Incident report to regulators

---

## Security Checklist

Before launch, verify:

- [ ] HTTPS/TLS 1.3 on all endpoints
- [ ] JWT tokens properly validated
- [ ] RLS policies enabled in Supabase
- [ ] Input validation on all endpoints
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Audit logging functional
- [ ] Encryption keys secured
- [ ] Sensitive data masked in logs
- [ ] CSRF protection enabled
- [ ] Dependencies scanned for vulnerabilities
- [ ] Security headers present (CSP, HSTS, etc)
- [ ] Error messages don't leak info
- [ ] Secrets not in code repo
- [ ] Backup & recovery tested
- [ ] Incident response plan documented
- [ ] Privacy policy accurate
- [ ] Terms of Service reviewed
- [ ] Compliance requirements met
- [ ] Penetration test completed

---

## Ongoing Security

**Monthly:**
- [ ] Review audit logs
- [ ] Check for failed logins/access attempts
- [ ] Review new CVEs
- [ ] Update dependencies

**Quarterly:**
- [ ] Security training for team
- [ ] Penetration test
- [ ] Backup restoration test
- [ ] Access control review

**Annually:**
- [ ] Full security audit
- [ ] Compliance certification renewal
- [ ] Third-party security review
- [ ] Privacy impact assessment
