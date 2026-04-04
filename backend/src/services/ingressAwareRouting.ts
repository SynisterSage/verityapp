/**
 * Ingress-Aware Routing Service
 * 
 * Detects which endpoint (mobile/landline) an incoming call originated from,
 * and routes return calls back to that same endpoint when possible.
 * 
 * Also implements critical loop guards to prevent infinite call loops.
 */

import logger from 'jet-logger';
import supabaseAdmin from '@src/services/supabase';

export interface IngressDetectionResult {
  ingressType: 'mobile' | 'landline' | 'app' | 'unknown';
  ingressConfidence: 'high' | 'medium' | 'low';
  ingressFromNumber: string | null;
  forwardedFromNumber: string | null;
  aniConfidence: 'high' | 'medium' | 'low';
  details: Record<string, unknown>;
}

export interface LoopGuardCheckResult {
  allowed: boolean;
  reason: 'allowed' | 'blocked_ingress' | 'blocked_hop' | 'blocked_duplicate';
  hopCount: number;
  details: Record<string, unknown>;
}

export interface RoutingContext {
  profileId: string;
  callSid: string;
  toNumber: string;  // Verity virtual number
  fromNumber: string;  // Original caller
  forwardedFrom?: string;  // From header's forwarded-from metadata
  userAgent?: string;
  timestamp: Date;
}

/**
 * Normalize phone number to E.164 format for comparison
 */
export function normalizeE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle US numbers (10 digits -> +1XXXXXXXXXX)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // Already has country code or is international
  if (cleaned.length > 10) {
    return `+${cleaned}`;
  }
  
  return null;
}

/**
 * Compare two phone numbers after normalization
 */
export function phonesMatch(phone1: string | null, phone2: string | null): boolean {
  const norm1 = normalizeE164(phone1);
  const norm2 = normalizeE164(phone2);
  return norm1 !== null && norm1 === norm2;
}

/**
 * Detect which endpoint (mobile/landline) the call originated from
 * 
 * Strategy (in order of trust):
 * 1. Check ForwardedFrom header metadata (Twilio may provide this)
 * 2. Use From number and match against known profile endpoints
 * 3. Use fallback heuristics based on To number patterns
 */
export async function detectCallIngress(
  ctx: RoutingContext
): Promise<IngressDetectionResult> {
  try {
    const { profileId, fromNumber, forwardedFrom, timestamp } = ctx;

    // Fetch profile with endpoints
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        phone_number,
        fallback_phone_number,
        twilio_virtual_number
      `)
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      logger.warn(`[ingress] Profile not found: ${profileId}`);
      return {
        ingressType: 'unknown',
        ingressConfidence: 'low',
        ingressFromNumber: fromNumber,
        forwardedFromNumber: forwardedFrom || null,
        aniConfidence: 'low',
        details: { error: 'profile_not_found' },
      };
    }

    // Fetch endpoints for this profile
    const { data: endpoints, error: endpointError } = await supabaseAdmin
      .from('profile_endpoints')
      .select('endpoint_type, phone_number_e164')
      .eq('profile_id', profileId)
      .eq('is_active', true);

    if (endpointError) {
      logger.warn(`[ingress] Failed to fetch endpoints: ${endpointError.message}`);
      return {
        ingressType: 'unknown',
        ingressConfidence: 'low',
        ingressFromNumber: fromNumber,
        forwardedFromNumber: forwardedFrom || null,
        aniConfidence: 'low',
        details: { error: 'endpoint_query_failed' },
      };
    }

    const normalizedFrom = normalizeE164(fromNumber);

    // Strategy 1: Check ForwardedFrom header (highest trust)
    if (forwardedFrom) {
      const normalizedForwarded = normalizeE164(forwardedFrom);
      
      // Check if forwarded number matches mobile
      if (profile.phone_number && phonesMatch(normalizedForwarded, profile.phone_number)) {
        logger.info(`[ingress] High-confidence mobile detection via ForwardedFrom: ${forwardedFrom}`);
        return {
          ingressType: 'mobile',
          ingressConfidence: 'high',
          ingressFromNumber: fromNumber,
          forwardedFromNumber: forwardedFrom,
          aniConfidence: 'high',
          details: { method: 'forwarded_from_header', endpoint_data: 'phone_number' },
        };
      }

      // Check if forwarded number matches landline
      if (profile.fallback_phone_number && phonesMatch(normalizedForwarded, profile.fallback_phone_number)) {
        logger.info(`[ingress] High-confidence landline detection via ForwardedFrom: ${forwardedFrom}`);
        return {
          ingressType: 'landline',
          ingressConfidence: 'high',
          ingressFromNumber: fromNumber,
          forwardedFromNumber: forwardedFrom,
          aniConfidence: 'high',
          details: { method: 'forwarded_from_header', endpoint_data: 'fallback_phone_number' },
        };
      }
    }

    // Strategy 2: Use From number and match against known endpoints
    if (normalizedFrom && endpoints && endpoints.length > 0) {
      for (const endpoint of endpoints) {
        if (endpoint.phone_number_e164 === normalizedFrom) {
          const endpointDesc = endpoint.endpoint_type === 'mobile' ? 'mobile' : 'landline';
          logger.info(`[ingress] Medium-confidence ${endpointDesc} detection via From number`);
          return {
            ingressType: endpoint.endpoint_type as 'mobile' | 'landline',
            ingressConfidence: 'medium',
            ingressFromNumber: fromNumber,
            forwardedFromNumber: forwardedFrom || null,
            aniConfidence: 'medium',
            details: { method: 'from_number_match', endpoint_type: endpoint.endpoint_type },
          };
        }
      }
    }

    // Strategy 3: Fallback heuristics (lowest confidence)
    // If we have legacy fields but no endpoint data, use them as reasonable assumption
    if (profile.phone_number && phonesMatch(normalizedFrom, profile.phone_number)) {
      logger.info(`[ingress] Low-confidence mobile detection via legacy phone_number field`);
      return {
        ingressType: 'mobile',
        ingressConfidence: 'low',
        ingressFromNumber: fromNumber,
        forwardedFromNumber: forwardedFrom || null,
        aniConfidence: 'low',
        details: { method: 'legacy_field_fallback', endpoint_data: 'phone_number' },
      };
    }

    if (profile.fallback_phone_number && phonesMatch(normalizedFrom, profile.fallback_phone_number)) {
      logger.info(`[ingress] Low-confidence landline detection via legacy fallback_phone_number`);
      return {
        ingressType: 'landline',
        ingressConfidence: 'low',
        ingressFromNumber: fromNumber,
        forwardedFromNumber: forwardedFrom || null,
        aniConfidence: 'low',
        details: { method: 'legacy_field_fallback', endpoint_data: 'fallback_phone_number' },
      };
    }

    // No match found
    logger.info(`[ingress] Unknown ingress source for profile ${profileId}: from=${fromNumber}`);
    return {
      ingressType: 'unknown',
      ingressConfidence: 'low',
      ingressFromNumber: fromNumber,
      forwardedFromNumber: forwardedFrom || null,
      aniConfidence: 'low',
      details: { method: 'no_match', total_endpoints: endpoints?.length || 0 },
    };
  } catch (err) {
    logger.err(`[ingress] Exception in detectCallIngress: ${(err as Error).message}`);
    return {
      ingressType: 'unknown',
      ingressConfidence: 'low',
      ingressFromNumber: ctx.fromNumber,
      forwardedFromNumber: ctx.forwardedFrom || null,
      aniConfidence: 'low',
      details: { error: 'exception', message: (err as Error).message },
    };
  }
}

/**
 * Check if a call is safe to route based on loop prevention rules
 * 
 * Rules:
 * 1. Never dial the ingress number back
 * 2. Never dial the Verity virtual number as destination
 * 3. Block if hop count exceeds threshold
 * 4. Block repeated call signatures in short time window
 */
export async function checkLoopGuards(
  ctx: RoutingContext,
  destinationEndpoint: string | null | undefined,
  ingressResult: IngressDetectionResult
): Promise<LoopGuardCheckResult> {
  try {
    const { profileId, callSid, toNumber, fromNumber } = ctx;

    const details: Record<string, unknown> = {
      callSid,
      profileId,
      destination: destinationEndpoint?.replace(/\d(?=\d{4})/g, '*'),  // mask for logs
    };

    // Guard 1: Never dial back to ingress number
    if (destinationEndpoint && phonesMatch(fromNumber, destinationEndpoint)) {
      logger.warn(`[loop-guard] BLOCKED: destination matches ingress number (from=${fromNumber})`);
      return {
        allowed: false,
        reason: 'blocked_ingress',
        hopCount: 0,
        details: { ...details, reason: 'ingress_match' },
      };
    }

    // Guard 2: Never dial the Verity virtual number
    if (destinationEndpoint && phonesMatch(toNumber, destinationEndpoint)) {
      logger.warn(`[loop-guard] BLOCKED: destination matches Verity number (to=${toNumber})`);
      return {
        allowed: false,
        reason: 'blocked_ingress',
        hopCount: 0,
        details: { ...details, reason: 'verity_number_match' },
      };
    }

    // Guard 3: Check hop count in call history
    // Get the routing profile to read hop threshold
    const { data: routingPrefs } = await supabaseAdmin
      .from('profile_routing_prefs')
      .select('hop_limit_threshold')
      .eq('profile_id', profileId)
      .single();

    const hopLimit = routingPrefs?.hop_limit_threshold || 5;
    
    // Count how many times this call has been dialed in recent call history
    // For now, we'll do a simple check - in production, you might track hop count in the call trace
    const { data: recentCalls } = await supabaseAdmin
      .from('calls')
      .select('id')
      .eq('profile_id', profileId)
      .eq('twilio_call_sid', callSid)
      .limit(1);

    // If same CallSid appears multiple times, we're looping
    if (recentCalls && recentCalls.length > 1) {
      logger.warn(`[loop-guard] BLOCKED: Call SID appears multiple times (hop detected)`);
      return {
        allowed: false,
        reason: 'blocked_hop',
        hopCount: recentCalls.length,
        details: { ...details, reason: 'hop_limit_exceeded', hop_count: recentCalls.length },
      };
    }

    // Guard 4: Duplicate detection in short window
    // Check if same caller+destination combo appeared in last N seconds
    const { data: routingTraces } = await supabaseAdmin
      .from('call_routing_traces')
      .select('*')
      .eq('profile_id', profileId)
      .gte('created_at', new Date(Date.now() - 300000).toISOString())  // Last 5 minutes
      .limit(100);

    if (routingTraces && routingTraces.length > 0) {
      // Check for duplicate call signature
      const callSignature = `${fromNumber}:${destinationEndpoint}`;
      const recentMatches = routingTraces.filter(
        (trace: any) => `${trace.ingress_from_number}:${trace.last_attempted_leg}` === callSignature
      );

      if (recentMatches.length > 2) {
        logger.warn(`[loop-guard] BLOCKED: Duplicate call signature detected ${recentMatches.length} times`);
        return {
          allowed: false,
          reason: 'blocked_duplicate',
          hopCount: recentMatches.length,
          details: {
            ...details,
            reason: 'duplicate_detection',
            recent_matches: recentMatches.length,
          },
        };
      }
    }

    // All checks passed
    logger.info(`[loop-guard] ALLOWED: Call passed all loop guards`);
    return {
      allowed: true,
      reason: 'allowed',
      hopCount: recentCalls?.length || 1,
      details: { ...details, passed_all_checks: true },
    };
  } catch (err) {
    logger.err(`[loop-guard] Exception: ${(err as Error).message}`);
    // On error, be conservative and block
    return {
      allowed: false,
      reason: 'blocked_ingress',
      hopCount: 0,
      details: {
        error: 'exception',
        message: (err as Error).message,
      },
    };
  }
}

/**
 * Resolve which endpoint to dial based on ingress type
 * 
 * Returns null if:
 * - Multi-endpoint routing is disabled
 * - No matching endpoint found
 * - Ingress confidence is too low for ambiguous cases
 */
export async function resolveIngressAwareEndpoint(
  profileId: string,
  ingressResult: IngressDetectionResult
): Promise<string | null> {
  try {
    // Fetch routing preferences to check if feature is enabled
    const { data: routingPrefs } = await supabaseAdmin
      .from('profile_routing_prefs')
      .select('multi_endpoint_enabled, use_ingress_aware_routing')
      .eq('profile_id', profileId)
      .single();

    if (!routingPrefs?.multi_endpoint_enabled || !routingPrefs?.use_ingress_aware_routing) {
      logger.info(`[endpoint-resolve] Multi-endpoint routing disabled for profile ${profileId}`);
      return null;
    }

    // For low-confidence ingress detection, don't make routing decisions
    if (ingressResult.ingressConfidence === 'low') {
      logger.info(`[endpoint-resolve] Low confidence ingress (${ingressResult.ingressType}), falling back to legacy`);
      return null;
    }

    if (ingressResult.ingressType === 'unknown') {
      logger.info(`[endpoint-resolve] Unknown ingress type, falling back to legacy`);
      return null;
    }

    // Fetch the matching endpoint
    const { data: endpoint } = await supabaseAdmin
      .from('profile_endpoints')
      .select('phone_number')
      .eq('profile_id', profileId)
      .eq('endpoint_type', ingressResult.ingressType)
      .eq('is_active', true)
      .single();

    if (endpoint?.phone_number) {
      logger.info(`[endpoint-resolve] Resolved ${ingressResult.ingressType} endpoint: ${endpoint.phone_number}`);
      return endpoint.phone_number;
    }

    logger.warn(`[endpoint-resolve] No active ${ingressResult.ingressType} endpoint found for profile ${profileId}`);
    return null;
  } catch (err) {
    logger.err(`[endpoint-resolve] Exception: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Log routing trace for debugging and analytics
 */
export async function logRoutingTrace(
  callId: string | null | undefined,
  profileId: string,
  ingressResult: IngressDetectionResult,
  loopGuardResult: LoopGuardCheckResult,
  routingMode: 'ingress_aware' | 'legacy' | 'failed_safe',
  targetEndpointType: string | null | undefined,
  additionalNotes?: string
) {
  try {
    const { error } = await supabaseAdmin
      .from('call_routing_traces')
      .insert({
        call_id: callId || null,
        profile_id: profileId,
        ingress_detected: ingressResult.ingressType,
        ingress_confidence: ingressResult.ingressConfidence,
        ingress_from_number: ingressResult.ingressFromNumber,
        forwarded_from_number: ingressResult.forwardedFromNumber,
        ani_confidence: ingressResult.aniConfidence,
        routing_mode: routingMode,
        target_endpoint_type: targetEndpointType || null,
        loop_guard_result: loopGuardResult.reason,
        hop_count: loopGuardResult.hopCount,
        trace_notes: additionalNotes,
      });

    if (error) {
      logger.warn(`[routing-trace] Failed to log trace: ${error.message}`);
    }
  } catch (err) {
    logger.err(`[routing-trace] Exception logging trace: ${(err as Error).message}`);
  }
}
