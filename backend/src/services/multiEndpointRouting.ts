/**
 * Enhanced Twilio Controller for Multi-Endpoint Routing
 * 
 * This module wraps the existing Twilio routing logic with ingress-aware
 * routing capabilities. It integrates with the ingressAwareRouting service
 * to provide intelligent PSTN endpoint routing.
 * 
 * When MULTI_ENDPOINT_ROUTING_V1 is enabled, this becomes the primary routing
 * decision engine. On any error or low-confidence detection, it falls back to
 * the legacy routing path to maintain stability.
 */

import logger from 'jet-logger';
import { Request, Response } from 'express';
import twilio from 'twilio';
import supabaseAdmin from '@src/services/supabase';
import {
  detectCallIngress,
  checkLoopGuards,
  resolveIngressAwareEndpoint,
  logRoutingTrace,
  IngressDetectionResult,
  LoopGuardCheckResult,
  RoutingContext,
  phonesMatch,
  normalizeE164,
} from '@src/services/ingressAwareRouting';
import {
  logIngressDetected,
  logLoopGuardCheck,
  logEndpointResolved,
  logRoutingDecision,
  maskPhone,
  shortId,
} from '@src/utils/secureLogging';

// Re-export for convenience
export { normalizeE164 } from '@src/services/ingressAwareRouting';

/**
 * Feature flags for safe rollout
 */
export function isMultiEndpointRoutingEnabled(): boolean {
  return process.env.MULTI_ENDPOINT_ROUTING_V1 === 'true';
}

export function isProfileOptedInToMultiEndpoint(multiEndpointEnabled?: boolean): boolean {
  return Boolean(multiEndpointEnabled);
}

/**
 * Enhanced bridge target resolution with ingress awareness
 * 
 * This function is called instead of the legacy bridgeToProfile when
 * multi-endpoint routing is enabled.
 */
export async function resolveIngressAwareBridgeTarget(
  profile: {
    id: string;
    phone_number?: string | null;
    fallback_phone_number?: string | null;
    twilio_client_identity?: string | null;
    multi_endpoint_enabled?: boolean;
  },
  routingContext: {
    callSid: string | undefined;
    toNumber: string;
    fromNumber: string;
    forwardedFrom?: string;
  }
): Promise<{
  destination: string | null;
  routingMode: 'ingress_aware' | 'legacy' | 'failed_safe';
  ingressResult: IngressDetectionResult | null;
  loopGuardResult: LoopGuardCheckResult | null;
} | null> {
  try {
    // Check if routing is enabled globally and per-profile
    if (!isMultiEndpointRoutingEnabled() || !isProfileOptedInToMultiEndpoint(profile.multi_endpoint_enabled)) {
      return null;  // Caller should use legacy routing
    }

    const { callSid, toNumber, fromNumber, forwardedFrom } = routingContext;

    const ctx: RoutingContext = {
      profileId: profile.id,
      callSid: callSid || 'unknown',
      toNumber,
      fromNumber,
      forwardedFrom,
      timestamp: new Date(),
    };

    // Step 1: Detect call ingress (mobile/landline/etc)
    const ingressResult = await detectCallIngress(ctx);
    logIngressDetected(
      callSid || 'unknown',
      ingressResult.ingressType,
      ingressResult.ingressConfidence,
      ingressResult.ingressFromNumber,
      ingressResult.details?.method as string || 'unknown'
    );

    // Step 2: Resolve endpoint (do this ONCE and reuse for both loop guard + routing)
    const candidateEndpoint = await resolveIngressAwareEndpoint(profile.id, ingressResult);
    logEndpointResolved(
      callSid || 'unknown',
      ingressResult.ingressType,
      candidateEndpoint,
      Boolean(candidateEndpoint)
    );
    
    // Step 3: Run loop guards with the resolved endpoint
    const loopGuardResult = await checkLoopGuards(ctx, candidateEndpoint, ingressResult);
    logLoopGuardCheck(
      callSid || 'unknown',
      loopGuardResult.allowed,
      loopGuardResult.reason,
      loopGuardResult.hopCount,
      candidateEndpoint
    );

    // If loop guard blocks, fail safe to legacy
    if (!loopGuardResult.allowed) {
      logger.warn(`[multi-endpoint] Loop guard blocked routing, failing safe to legacy`);
      await logRoutingTrace(
        undefined,
        ctx.callSid,
        profile.id,
        ingressResult,
        loopGuardResult,
        'failed_safe',
        null,
        `Loop guard blocked: ${loopGuardResult.reason}`
      );
      return {
        destination: null,
        routingMode: 'failed_safe',
        ingressResult,
        loopGuardResult,
      };
    }

    // Step 4: Use the resolved endpoint (no need to call again)
    if (!candidateEndpoint) {
      logger.info(`[multi-endpoint] No endpoint resolved, failing safe to legacy`);
      await logRoutingTrace(
        undefined,
        ctx.callSid,
        profile.id,
        ingressResult,
        loopGuardResult,
        'failed_safe',
        null,
        'No matching endpoint found'
      );
      return {
        destination: null,
        routingMode: 'failed_safe',
        ingressResult,
        loopGuardResult,
      };
    }

    logRoutingDecision(
      callSid || 'unknown',
      'ingress_aware',
      candidateEndpoint,
      ingressResult.ingressType
    );
    await logRoutingTrace(
      undefined,
      ctx.callSid,
      profile.id,
      ingressResult,
      loopGuardResult,
      'ingress_aware',
      ingressResult.ingressType,
      `Routed to ${ingressResult.ingressType} endpoint`
    );

    return {
      destination: candidateEndpoint,
      routingMode: 'ingress_aware',
      ingressResult,
      loopGuardResult,
    };
  } catch (err) {
    logger.err(`[multi-endpoint] Exception in resolveIngressAwareBridgeTarget: ${(err as Error).message}`);
    // On exception, always fail safe to legacy
    return {
      destination: null,
      routingMode: 'failed_safe',
      ingressResult: null,
      loopGuardResult: null,
    };
  }
}

/**
 * Determine if we should use ingress-aware routing or legacy routing
 * 
 * This is called for each incoming call to decide the path.
 */
export async function selectRoutingPath(
  profile: {
    id: string;
    phone_number?: string | null;
    fallback_phone_number?: string | null;
    twilio_client_identity?: string | null;
    multi_endpoint_enabled?: boolean;
  }
): Promise<'ingress_aware' | 'legacy'> {
  try {
    if (!isMultiEndpointRoutingEnabled()) {
      return 'legacy';
    }

    if (!isProfileOptedInToMultiEndpoint(profile.multi_endpoint_enabled)) {
      return 'legacy';
    }

    // Check if profile has valid endpoint data
    const { data: endpoints } = await supabaseAdmin
      .from('profile_endpoints')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('is_active', true)
      .limit(1);

    if (!endpoints || endpoints.length === 0) {
      logger.info(`[routing-path] No active endpoints for profile, using legacy`);
      return 'legacy';
    }

    return 'ingress_aware';
  } catch (err) {
    logger.err(`[routing-path] Exception in selectRoutingPath: ${(err as Error).message}`);
    return 'legacy';
  }
}

/**
 * Build TwiML for ingress-aware endpoint routing
 * 
 * Patches the legacy appendNumberBridge logic to add ingress awareness
 */
export function appendIngressAwareBridgeTwiml(
  twimlResponse: twilio.twiml.VoiceResponse,
  dialStatusUrl: string,
  callerId: string,
  destinationNumber: string | null,
  fallbackNumber: string | null,
  ingressType?: string,
  actionUrl?: string
) {
  if (!destinationNumber) {
    // If no destination, use fallback or hang up
    if (fallbackNumber) {
      twimlResponse.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.');
      const dial = twimlResponse.dial({
        callerId,
        timeout: 20,
        answerOnBridge: true,
      });
      dial.number(
        {
          statusCallback: dialStatusUrl,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallbackMethod: 'POST',
        },
        fallbackNumber
      );
    }
    return;
  }

  // Log which endpoint we're dialing
  logger.info(
    `[twiml-bridge] Dialing ${ingressType || 'primary'} endpoint at ${destinationNumber.slice(-4).padStart(10, '*')}`
  );

  // Create dial with ingress-aware routing tag for logging
  twimlResponse.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.');
  const dial = twimlResponse.dial({
    callerId,
    timeout: 20,
    answerOnBridge: true,
    action: actionUrl,
    method: actionUrl ? 'POST' : undefined,
  });

  // Add number with enhanced logging
  dial.number(
    {
      statusCallback: dialStatusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    },
    destinationNumber
  );
}

/**
 * Helper function for legacy number bridging (unchanged)
 */
function appendNumberBridge(
  twimlResponse: twilio.twiml.VoiceResponse,
  dialStatusUrl: string,
  callerId: string,
  phoneNumber: string
) {
  twimlResponse.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.');
  const dial = twimlResponse.dial({
    callerId,
    timeout: 20,
    answerOnBridge: true,
  });
  dial.number(
    {
      statusCallback: dialStatusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    },
    phoneNumber
  );
}

/**
 * Configuration for endpoint display in logs
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '(unknown)';
  return phone.slice(-4).padStart(phone.length, '*');
}

/**
 * Helper to validate that endpoint configuration is consistent
 */
export async function validateProfileEndpointConfig(profileId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, phone_number, fallback_phone_number, twilio_virtual_number')
      .eq('id', profileId)
      .single();

    if (!profile) {
      errors.push('Profile not found');
      return { valid: false, errors };
    }

    const { data: endpoints } = await supabaseAdmin
      .from('profile_endpoints')
      .select('endpoint_type, phone_number')
      .eq('profile_id', profileId)
      .eq('is_active', true);

    // Validate endpoints don't equal Verity number
    if (endpoints) {
      for (const endpoint of endpoints) {
        if (phonesMatch(endpoint.phone_number, profile.twilio_virtual_number)) {
          errors.push(
            `Endpoint (${endpoint.endpoint_type}) cannot equal Verity number (${profile.twilio_virtual_number})`
          );
        }
      }
    }

    // Warn if no endpoints but feature is enabled
    const { data: prefs } = await supabaseAdmin
      .from('profile_routing_prefs')
      .select('multi_endpoint_enabled')
      .eq('profile_id', profileId)
      .single();

    if (prefs?.multi_endpoint_enabled && (!endpoints || endpoints.length === 0)) {
      errors.push('Multi-endpoint enabled but no endpoints configured');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (err) {
    errors.push(`Validation error: ${(err as Error).message}`);
    return { valid: false, errors };
  }
}
