/**
 * Data Privacy & Leak Prevention Layer
 * Ensures sensitive PII is never exposed in API responses
 * 
 * Handles:
 * - Phone numbers (redact to last 4 digits)
 * - Names (redact in certain contexts)
 * - Password hashes & salts (always strip)
 * - Email addresses (redact)
 * - Security tokens (always strip)
 * - PIN/passcode data (always strip)
 */

export interface SanitizedProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  twilio_virtual_number?: string | null;
  phone_number_last_four?: string | null;
  has_passcode?: boolean;
  alert_threshold_score?: number;
  enable_email_alerts?: boolean;
  enable_sms_alerts?: boolean;
  enable_push_alerts?: boolean;
  created_at?: string;
  [key: string]: any;
}

export interface SanitizedCall {
  id: string;
  profile_id: string;
  from_number_last_four?: string | null;
  to_number_last_four?: string | null;
  duration_seconds?: number;
  answered?: boolean;
  fraud_score?: number;
  created_at?: string;
  [key: string]: any;
}

/**
 * Strip sensitive fields from profile responses
 * Never expose: pin_hash, pin_salt, passcode_hash, full phone numbers (raw)
 */
export function sanitizeProfile(profile: any): SanitizedProfile | null {
  if (!profile) return null;

  return {
    id: profile.id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    twilio_virtual_number: profile.twilio_virtual_number,
    phone_number_last_four: profile.phone_number
      ? profile.phone_number.slice(-4)
      : null,
    has_passcode: Boolean(profile.pin_hash ?? profile.passcode_hash),
    alert_threshold_score: profile.alert_threshold_score,
    enable_email_alerts: profile.enable_email_alerts,
    enable_sms_alerts: profile.enable_sms_alerts,
    enable_push_alerts: profile.enable_push_alerts,
    auto_mark_enabled: profile.auto_mark_enabled,
    auto_mark_fraud_threshold: profile.auto_mark_fraud_threshold,
    auto_mark_safe_threshold: profile.auto_mark_safe_threshold,
    auto_trust_on_safe: profile.auto_trust_on_safe,
    auto_block_on_fraud: profile.auto_block_on_fraud,
    created_at: profile.created_at,
    // ❌ Never include: pin_hash, pin_salt, passcode_hash, pin_pepper_version, pin_locked_until
    // ❌ Never include: full phone_number (only show last 4)
    // ❌ Never include: caretaker_id (internal ref)
  };
}

/**
 * Strip sensitive fields from call responses
 * Never expose: full phone numbers, raw transcripts (may contain PII)
 */
export function sanitizeCall(call: any): SanitizedCall | null {
  if (!call) return null;

  return {
    id: call.id,
    profile_id: call.profile_id,
    from_number_last_four: call.from_number
      ? call.from_number.slice(-4)
      : null,
    to_number_last_four: call.to_number
      ? call.to_number.slice(-4)
      : null,
    duration_seconds: call.duration_seconds,
    answered: call.answered,
    direction: call.direction,
    call_status: call.call_status,
    fraud_score: call.fraud_score,
    fraud_category: call.fraud_category,
    fraud_confidence: call.fraud_confidence,
    is_trusted: call.is_trusted,
    is_blocked: call.is_blocked,
    created_at: call.created_at,
    // ❌ Never include: from_number (raw), to_number (raw), transcript (PII), caller_name
    // ⚠️  transcript_summary OK (summarized, less PII risk)
  };
}

/**
 * Strip sensitive fields from call list responses (batch operation)
 */
export function sanitizeCalls(calls: any[]): SanitizedCall[] {
  return calls.map(sanitizeCall).filter(Boolean) as SanitizedCall[];
}

/**
 * Strip sensitive fields from profile list responses (batch operation)
 */
export function sanitizeProfiles(profiles: any[]): SanitizedProfile[] {
  return profiles.map(sanitizeProfile).filter(Boolean) as SanitizedProfile[];
}

/**
 * Audit log sanitizer - redact sensitive data from logs
 * Prevents logs from containing PII that could be accessed via log aggregation
 */
export function sanitizeAuditLog(action: string, details: any): Record<string, any> {
  return {
    action,
    timestamp: new Date().toISOString(),
    // Only log non-PII details
    profile_id: details?.profile_id,
    user_id: details?.user_id,
    entity_type: details?.entity_type,
    // ❌ Never: phone_number, first_name, last_name, transcript, email
    // ✅ Safe: IDs, timestamps, counts, enum values
  };
}

/**
 * Error response sanitizer - prevent PII in error messages
 * Never leak data in error responses (e.g., "user with email X not found")
 */
export function sanitizeErrorResponse(error: any, context?: string): string {
  const errorMessage = error?.message || String(error);

  // List of patterns that might leak PII
  const piiPatterns = [
    /@[\w.-]+\.(com|org|net|io)/, // Email addresses
    /\d{10,}/, // Phone numbers (10+ digits)
    /\b[A-Z]{2}\d{5}(-\d{4})?\b/, // ZIP codes
    /user.*id|email.*user|found.*user/, // Info leakage patterns
  ];

  // Check if error contains PII
  for (const pattern of piiPatterns) {
    if (pattern.test(errorMessage)) {
      // Log the actual error internally, return generic message to client
      console.error(`[Security] Potential PII in error: ${errorMessage}`);
      return context ? `An error occurred during ${context}. Please try again.` : 'An error occurred. Please try again.';
    }
  }

  // Safe errors to pass through
  const safeErrors = [
    'Unauthorized',
    'Forbidden',
    'Not found',
    'Invalid request',
    'Validation failed',
    'Too many requests',
  ];

  if (safeErrors.some((safe) => errorMessage.includes(safe))) {
    return errorMessage;
  }

  // Default: generic message
  return context ? `An error occurred during ${context}. Please try again.` : 'An error occurred. Please try again.';
}

/**
 * Alert response sanitizer - redact PII from alerts but preserve safe data
 * Used by AlertsController to sanitize enriched alerts before returning to clients
 */
export function sanitizeAlert(alert: any): Record<string, any> {
  if (!alert) return {};

  // Redact PII from payload if present
  let sanitizedPayload = alert.payload;
  if (sanitizedPayload && typeof sanitizedPayload === 'object') {
    sanitizedPayload = { ...sanitizedPayload };
    // Redact caller numbers to last 4 digits only
    if (sanitizedPayload.caller_number) {
      sanitizedPayload.caller_number = sanitizedPayload.caller_number.slice(-4);
    }
    if (sanitizedPayload.callerNumber) {
      sanitizedPayload.callerNumber = sanitizedPayload.callerNumber.slice(-4);
    }
    // Remove full transcripts - they can contain PII
    delete sanitizedPayload.transcript;
    delete sanitizedPayload.full_transcript;
  }

  // Return all alert fields but with redacted payload
  return {
    ...alert,
    payload: sanitizedPayload,
    // Explicitly redact any direct phone number fields if present
    ...(alert.from_number && { from_number: alert.from_number.slice(-4) }),
    ...(alert.to_number && { to_number: alert.to_number.slice(-4) }),
  };
}

/**
 * Batch sanitize alerts
 */
export function sanitizeAlerts(alerts: any[]): Record<string, any>[] {
  return alerts.map(sanitizeAlert).filter(Boolean);
}

/**
 * Check if a field contains potentially sensitive data
 */
export function isSensitiveField(fieldName: string): boolean {
  const sensitiveFields = [
    'pin_hash',
    'pin_salt',
    'pin_pepper_version',
    'passcode_hash',
    'phone_number', // Raw phone numbers
    'from_number', // Raw caller number
    'to_number', // Raw dialed number
    'email', // Email addresses
    'transcript', // Full transcripts (may contain PII)
    'password_hash',
    'auth_token',
    'api_key',
    'secret_key',
    'ssn', // Social security number
    'credit_card', // Payment info
    'banking_info', // Banking details
    'caller_name', // Caller identity
  ];

  return sensitiveFields.some(
    (sensitive) =>
      fieldName.toLowerCase().includes(sensitive.toLowerCase())
  );
}

/**
 * Filter response object to remove sensitive fields
 * Used as a safety net before sending any response
 */
export function filterSensitiveFields(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(filterSensitiveFields);
  }

  if (typeof obj === 'object') {
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!isSensitiveField(key)) {
        filtered[key] = filterSensitiveFields(value);
      }
    }
    return filtered;
  }

  return obj;
}

/**
 * Database query helper - ensure queries only fetch safe fields
 * Prevents accidental leakage if RLS fails
 */
export function safeProfileFields(): string {
  return `
    id,
    first_name,
    last_name,
    twilio_virtual_number,
    phone_number,
    alert_threshold_score,
    enable_email_alerts,
    enable_sms_alerts,
    enable_push_alerts,
    auto_mark_enabled,
    auto_mark_fraud_threshold,
    auto_mark_safe_threshold,
    auto_trust_on_safe,
    auto_block_on_fraud,
    created_at
  `;
  // Note: Never SELECT pin_hash, pin_salt, passcode_hash, pin_pepper_version
}

/**
 * Database query helper - safe call fields
 */
export function safeCallFields(): string {
  return `
    id,
    profile_id,
    from_number,
    to_number,
    duration_seconds,
    answered,
    direction,
    call_status,
    fraud_score,
    fraud_category,
    fraud_confidence,
    is_trusted,
    is_blocked,
    created_at
  `;
  // Note: Never SELECT full transcripts, caller_name from raw queries
}
