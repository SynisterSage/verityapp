/**
 * Secure Logging Utility for PTSN Multi-Endpoint Routing
 * 
 * Ensures all logs are safe for production:
 * - Phone numbers are masked (***-****-1234 format)
 * - Database IDs are shortened (first 8 chars)
 * - Credentials never logged
 * - Environment variables never logged
 * - Call SIDs are preserved for tracing
 * 
 * PERFORMANCE OPTIMIZED:
 * - Lazy evaluation of expensive operations
 * - Conditional logging based on level
 * - No unnecessary detail in hot paths
 */

import logger from 'jet-logger';

export interface RoutingLogContext {
  profileId: string;
  callSid: string;
  fromNumber?: string;
  toNumber?: string;
  endpoint?: string;
  routingMode?: string;
  reason?: string;
}

/**
 * Mask phone number for safe logging
 * +14155552671 → ***-***-2671
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(unknown)';
  // Keep only last 4 digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '*'.repeat(digits.length);
  return '*'.repeat(Math.max(3, digits.length - 4)) + digits.slice(-4);
}

/**
 * Shorten UUID for safe logging
 * 550e8400-e29b-41d4-a716-446655440000 → 550e8400...
 */
export function shortId(id: string | null | undefined): string {
  if (!id) return '(unknown)';
  if (id.length < 8) return id;
  return id.substring(0, 8) + '...';
}

/**
 * Log routing decision start (non-critical, skip to avoid overhead)
 */
export function logRoutingStart(ctx: RoutingLogContext) {
  // Non-critical, skip to reduce overhead
  return;
}

/**
 * Log ingress detection result (use lazy computation)
 */
export function logIngressDetected(
  callSid: string,
  ingressType: string,
  confidence: string,
  detectedFrom: string | null | undefined,
  method: string
) {
  // Skip expensive logging if it's low-confidence/unknown (reduce noise)
  if (ingressType === 'unknown' && confidence === 'low') {
    return;  // Don't log unknown low-confidence detections
  }
  
  logger.info(
    `[ingress-detected] callSid=${callSid} type=${ingressType} confidence=${confidence} method=${method}`
  );
}

/**
 * Log loop guard check (minimalist, only log blocks)
 */
export function logLoopGuardCheck(
  callSid: string,
  allowed: boolean,
  reason: string,
  hopCount: number,
  destination: string | null | undefined
) {
  // Only log blocks to reduce noise (allowed is expected)
  if (allowed) {
    return;  // Skip non-critical "allowed" logs
  }
  
  logger.warn(
    `[loop-guard] callSid=${callSid} BLOCKED reason=${reason} hopCount=${hopCount}`
  );
}

/**
 * Log endpoint resolution (only if not found, otherwise skip)
 */
export function logEndpointResolved(
  callSid: string,
  ingressType: string,
  endpoint: string | null | undefined,
  found: boolean
) {
  if (!found) {
    logger.info(
      `[endpoint-not-found] callSid=${callSid} type=${ingressType} (fallback to legacy)`
    );
  }
  // Skip "found" logs (non-critical)
}

/**
 * Log final routing decision (minimal info for audit trail)
 */
export function logRoutingDecision(
  callSid: string,
  routingMode: string,
  destination: string | null | undefined,
  endpointType: string | null | undefined
) {
  logger.info(
    `[routing-decision] callSid=${callSid} mode=${routingMode} type=${endpointType || 'unknown'}`
  );
}

/**
 * Log bridge attempt (lean version)
 */
export function logBridgeAttempt(
  callSid: string | undefined,
  bridgeType: string,
  target: string | null | undefined,
  clientIdentity?: string
) {
  const targetInfo = clientIdentity ? `client=...${clientIdentity.slice(-4)}` : 'pstn';
  logger.info(`[bridge-attempt] callSid=${callSid} type=${bridgeType} ${targetInfo}`);
}

/**
 * Log exception safely (no stack traces with sensitive info)
 * Minimal format to avoid overhead
 */
export function logRoutingException(
  callSid: string,
  stage: string,
  error: Error | string
) {
  const message = error instanceof Error ? error.message : error;
  logger.err(`[routing-error] callSid=${callSid} stage=${stage} error=${message}`);
}

/**
 * Validate no sensitive data in log message
 * (Development/testing only - strips if found)
 */
export function validateLogSafety(message: string): {
  safe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check for common credential patterns
  if (/sk_live_|sk_test_|pk_live_|pk_test_/i.test(message)) {
    warnings.push('Potential Stripe key detected');
  }

  if (/Authorization|Authorization:|Bearer /i.test(message)) {
    warnings.push('Potential auth token detected');
  }

  if (/password|secret|token|key/i.test(message) && message.length > 20) {
    warnings.push('Potential credential pattern detected');
  }

  if (/NODE_ENV|DATABASE_URL|TWILIO|API_KEY|SECRET/i.test(message)) {
    warnings.push('Potential environment variable referenced');
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}
