/**
 * Multi-Endpoint Routing API Endpoints
 * 
 * Routes for managing profile endpoints (mobile/landline) and routing preferences.
 * These are wrappers around the ingress-aware routing service for client access.
 * 
 * All endpoints require proper authorization checks to prevent unauthorized access.
 */

import { Request, Response } from 'express';
import supabaseAdmin from '@src/services/supabase';
import logger from 'jet-logger';
import { validateProfileEndpointConfig } from '@src/services/multiEndpointRouting';
import { normalizeE164 } from '@src/services/ingressAwareRouting';
import {
  getAuthenticatedUserId,
  userCanAccessProfile,
  userIsCaretaker,
  logProfileAccessDenied,
} from '@src/common/util/auth';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

/**
 * GET /profiles/:profileId/endpoints
 * Fetch all endpoints for a profile
 */
export async function getProfileEndpoints(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    // Verify user can access this profile
    const canAccess = await userCanAccessProfile(userId, profileId);
    if (!canAccess) {
      logProfileAccessDenied('getProfileEndpoints', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { data: endpoints, error } = await supabaseAdmin
      .from('profile_endpoints')
      .select('id, endpoint_type, phone_number, is_active, created_at, last_dialed_at')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.err(`[endpoints] Failed to fetch endpoints for profile ${profileId}: ${error.message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to fetch endpoints' });
    }

    res.json({ endpoints });
  } catch (err) {
    logger.err(`[endpoints] Exception in getProfileEndpoints: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}

/**
 * POST /profiles/:profileId/endpoints
 * Add a new endpoint (mobile/landline)
 */
export async function addProfileEndpoint(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    // Verify user can access and modify this profile (caretaker only for write)
    const isCaretaker = await userIsCaretaker(userId, profileId);
    if (!isCaretaker) {
      logProfileAccessDenied('addProfileEndpoint', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { endpoint_type, phone_number } = req.body;

    // Validate inputs
    if (!['mobile', 'landline'].includes(endpoint_type)) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid endpoint_type. Must be "mobile" or "landline"' });
    }

    if (!phone_number || typeof phone_number !== 'string') {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'phone_number is required' });
    }

    // Normalize to E.164
    const normalizedPhone = normalizeE164(phone_number);
    if (!normalizedPhone) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid phone number format' });
    }

    // Check that endpoint doesn't already exist
    const { data: existing } = await supabaseAdmin
      .from('profile_endpoints')
      .select('id')
      .eq('profile_id', profileId)
      .eq('endpoint_type', endpoint_type)
      .eq('is_active', true)
      .single();

    if (existing) {
      return res.status(HTTP_STATUS_CODES.Conflict).json({ error: `${endpoint_type} endpoint already exists for this profile` });
    }

    // Check that endpoint doesn't equal the Verity number
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('twilio_virtual_number')
      .eq('id', profileId)
      .single();

    if (profile?.twilio_virtual_number && normalizeE164(profile.twilio_virtual_number) === normalizedPhone) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Endpoint phone number cannot equal the Verity number' });
    }

    // Create endpoint
    const { data: endpoint, error } = await supabaseAdmin
      .from('profile_endpoints')
      .insert({
        profile_id: profileId,
        endpoint_type,
        phone_number: normalizedPhone,
        phone_number_e164: normalizedPhone,
        verified_at: new Date().toISOString(),
        is_active: true,
      })
      .select('id, endpoint_type, phone_number, is_active, created_at')
      .single();

    if (error) {
      logger.err(`[endpoints] Failed to create endpoint for profile ${profileId}: ${error.message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to create endpoint' });
    }

    logger.info(`[endpoints] Created ${endpoint_type} endpoint for profile ${profileId}`);
    res.status(HTTP_STATUS_CODES.Created).json({ endpoint });
  } catch (err) {
    logger.err(`[endpoints] Exception in addProfileEndpoint: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /profiles/:profileId/endpoints/:endpointId
 * Update an endpoint
 */
export async function updateProfileEndpoint(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId, endpointId } = req.params;
    if (!profileId || !endpointId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId or endpointId' });
    }

    // Verify user can modify this profile (caretaker only)
    const isCaretaker = await userIsCaretaker(userId, profileId);
    if (!isCaretaker) {
      logProfileAccessDenied('updateProfileEndpoint', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { phone_number, is_active } = req.body;

    const updates: Record<string, unknown> = {};

    // Update phone number if provided
    if (phone_number) {
      const normalizedPhone = normalizeE164(phone_number);
      if (!normalizedPhone) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid phone number format' });
      }

      // Verify it doesn't match Verity number
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('twilio_virtual_number')
        .eq('id', profileId)
        .single();

      if (profile?.twilio_virtual_number && normalizeE164(profile.twilio_virtual_number) === normalizedPhone) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Endpoint phone number cannot equal the Verity number' });
      }

      updates.phone_number = normalizedPhone;
      updates.phone_number_e164 = normalizedPhone;
    }

    // Update is_active if provided
    if (is_active !== undefined) {
      updates.is_active = Boolean(is_active);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'No fields to update' });
    }

    const { data: endpoint, error } = await supabaseAdmin
      .from('profile_endpoints')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', endpointId)
      .eq('profile_id', profileId)
      .select('id, endpoint_type, phone_number, is_active')
      .single();

    if (error) {
      logger.err(`[endpoints] Failed to update endpoint ${endpointId}: ${error.message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to update endpoint' });
    }

    logger.info(`[endpoints] Updated endpoint ${endpointId} for profile ${profileId}`);
    res.json({ endpoint });
  } catch (err) {
    logger.err(`[endpoints] Exception in updateProfileEndpoint: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /profiles/:profileId/endpoints/:endpointId
 * Delete (deactivate) an endpoint
 */
export async function deleteProfileEndpoint(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId, endpointId } = req.params;
    if (!profileId || !endpointId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId or endpointId' });
    }

    // Verify user can modify this profile (caretaker only)
    const isCaretaker = await userIsCaretaker(userId, profileId);
    if (!isCaretaker) {
      logProfileAccessDenied('deleteProfileEndpoint', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    // Soft delete by deactivating
    const { error } = await supabaseAdmin
      .from('profile_endpoints')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', endpointId)
      .eq('profile_id', profileId);

    if (error) {
      logger.err(`[endpoints] Failed to delete endpoint ${endpointId}: ${error.message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to delete endpoint' });
    }

    logger.info(`[endpoints] Deleted endpoint ${endpointId} for profile ${profileId}`);
    res.status(HTTP_STATUS_CODES.NoContent).send();
  } catch (err) {
    logger.err(`[endpoints] Exception in deleteProfileEndpoint: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}

/**
 * GET /profiles/:profileId/routing-preferences
 * Fetch routing preferences for a profile
 */
export async function getRoutingPreferences(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    // Verify user can access this profile
    const canAccess = await userCanAccessProfile(userId, profileId);
    if (!canAccess) {
      logProfileAccessDenied('getRoutingPreferences', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { data: prefs, error } = await supabaseAdmin
      .from('profile_routing_prefs')
      .select('*')
      .eq('profile_id', profileId)
      .single();

    if (error?.code === 'PGRST116') {
      // Create default prefs if they don't exist
      const { data: defaultPrefs } = await supabaseAdmin
        .from('profile_routing_prefs')
        .insert({ profile_id: profileId })
        .select('*')
        .single();

      return res.json({ preferences: defaultPrefs });
    }

    if (error) {
      logger.err(`[routing-prefs] Failed to fetch preferences for profile ${profileId}: ${error.message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to fetch routing preferences' });
    }

    res.json({ preferences: prefs });
  } catch (err) {
    logger.err(`[routing-prefs] Exception in getRoutingPreferences: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /profiles/:profileId/routing-preferences
 * Update routing preferences
 */
export async function updateRoutingPreferences(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    // Verify user can modify this profile (caretaker only)
    const isCaretaker = await userIsCaretaker(userId, profileId);
    if (!isCaretaker) {
      logProfileAccessDenied('updateRoutingPreferences', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const {
      multi_endpoint_enabled,
      use_ingress_aware_routing,
      default_fallback_type,
      simultaneous_ring_enabled,
      ring_timeout_seconds,
      no_answer_action,
      voicemail_enabled,
    } = req.body;

    const updates: Record<string, unknown> = {};

    if (multi_endpoint_enabled !== undefined) {
      updates.multi_endpoint_enabled = Boolean(multi_endpoint_enabled);
    }
    if (use_ingress_aware_routing !== undefined) {
      updates.use_ingress_aware_routing = Boolean(use_ingress_aware_routing);
    }
    if (default_fallback_type !== undefined) {
      if (!['app', 'voicemail', 'first_available'].includes(default_fallback_type)) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid default_fallback_type' });
      }
      updates.default_fallback_type = default_fallback_type;
    }
    if (simultaneous_ring_enabled !== undefined) {
      updates.simultaneous_ring_enabled = Boolean(simultaneous_ring_enabled);
    }
    if (ring_timeout_seconds !== undefined) {
      if (ring_timeout_seconds <= 0 || ring_timeout_seconds > 300) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'ring_timeout_seconds must be between 1 and 300' });
      }
      updates.ring_timeout_seconds = ring_timeout_seconds;
    }
    if (no_answer_action !== undefined) {
      if (!['voicemail', 'fallback', 'hangup'].includes(no_answer_action)) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid no_answer_action' });
      }
      updates.no_answer_action = no_answer_action;
    }
    if (voicemail_enabled !== undefined) {
      updates.voicemail_enabled = Boolean(voicemail_enabled);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'No fields to update' });
    }

    updates.updated_at = new Date().toISOString();

    const { data: prefs, error } = await supabaseAdmin
      .from('profile_routing_prefs')
      .update(updates)
      .eq('profile_id', profileId)
      .select('*')
      .single();

    if (error) {
      logger.err(`[routing-prefs] Failed to update preferences for profile ${profileId}: ${error.message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to update routing preferences' });
    }

    // If enabling multi-endpoint, validate config
    if (updates.multi_endpoint_enabled === true) {
      const validation = await validateProfileEndpointConfig(profileId);
      if (!validation.valid) {
        logger.warn(`[routing-prefs] Profile ${profileId} enabled multi-endpoint but config issues: ${validation.errors.join(', ')}`);
      }
    }

    logger.info(`[routing-prefs] Updated routing preferences for profile ${profileId}`);
    res.json({ preferences: prefs });
  } catch (err) {
    logger.err(`[routing-prefs] Exception in updateRoutingPreferences: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}

/**
 * GET /profiles/:profileId/routing-traces
 * Fetch routing traces (debug/audit trail) for recent calls
 * 
 * Accessible by caretaker and members (read-only audit data)
 */
export async function getRoutingTraces(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    // Verify user can access this profile
    const canAccess = await userCanAccessProfile(userId, profileId);
    if (!canAccess) {
      logProfileAccessDenied('getRoutingTraces', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { limit = 20, offset = 0 } = req.query;
    const parsedLimit = Math.min(Number(limit) || 20, 100); // Cap at 100 to prevent excessive queries
    const parsedOffset = Math.max(Number(offset) || 0, 0);

    const { data: traces, error } = await supabaseAdmin
      .from('call_routing_traces')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .range(parsedOffset, parsedOffset + parsedLimit - 1);

    if (error) {
      logger.err(`[routing-traces] Failed to fetch traces for profile ${profileId}: ${error.message}`);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to fetch routing traces' });
    }

    res.json({ traces, limit: parsedLimit, offset: parsedOffset });
  } catch (err) {
    logger.err(`[routing-traces] Exception in getRoutingTraces: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/validate-endpoint-config/:profileId
 * Admin endpoint to validate endpoint configuration
 * 
 * ADMIN ONLY - validates multi-endpoint configuration for a profile
 */
export async function validateEndpointConfigAdmin(req: Request, res: Response) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    // ADMIN CHECK: Only caretaker (primary user) can run validation
    // This prevents non-admins from triggering validation on other profiles
    const isCaretaker = await userIsCaretaker(userId, profileId);
    if (!isCaretaker) {
      logProfileAccessDenied('validateEndpointConfigAdmin', userId, profileId);
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const validation = await validateProfileEndpointConfig(profileId);

    res.json({
      valid: validation.valid,
      errors: validation.errors,
    });
  } catch (err) {
    logger.err(`[endpoints-admin] Exception in validateEndpointConfigAdmin: ${(err as Error).message}`);
    res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Internal server error' });
  }
}
