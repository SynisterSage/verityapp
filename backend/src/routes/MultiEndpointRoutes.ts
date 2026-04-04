import { Router } from 'express';
import {
  getProfileEndpoints,
  addProfileEndpoint,
  updateProfileEndpoint,
  deleteProfileEndpoint,
  getRoutingPreferences,
  updateRoutingPreferences,
  getRoutingTraces,
  validateEndpointConfigAdmin,
} from '@src/controllers/MultiEndpointController';
import { validateRequest } from '@src/middleware/validateRequest';
import {
  addProfileEndpointSchema,
  updateProfileEndpointSchema,
  updateRoutingPreferencesSchema,
} from '@src/middleware/validationSchemas';

const router = Router();

/**
 * Profile Endpoints Routes
 * ========================
 * Manage mobile/landline endpoints for multi-endpoint routing
 */

// GET /profiles/:profileId/endpoints
router.get('/:profileId/endpoints', getProfileEndpoints);

// POST /profiles/:profileId/endpoints
router.post(
  '/:profileId/endpoints',
  validateRequest(addProfileEndpointSchema),
  addProfileEndpoint
);

// PUT /profiles/:profileId/endpoints/:endpointId
router.put('/:profileId/endpoints/:endpointId', validateRequest(updateProfileEndpointSchema), updateProfileEndpoint);

// DELETE /profiles/:profileId/endpoints/:endpointId
router.delete('/:profileId/endpoints/:endpointId', deleteProfileEndpoint);

/**
 * Routing Preferences Routes
 * ==========================
 * Configure call routing behavior
 */

// GET /profiles/:profileId/routing-preferences
router.get('/:profileId/routing-preferences', getRoutingPreferences);

// PUT /profiles/:profileId/routing-preferences
router.put('/:profileId/routing-preferences', validateRequest(updateRoutingPreferencesSchema), updateRoutingPreferences);

/**
 * Routing Traces/Debug Routes
 * ============================
 * View audit trail of routing decisions
 */

// GET /profiles/:profileId/routing-traces
router.get('/:profileId/routing-traces', getRoutingTraces);

/**
 * Admin Routes
 * ============
 */

// POST /admin/validate-endpoint-config/:profileId
router.post('/admin/validate-endpoint-config/:profileId', validateEndpointConfigAdmin);

export default router;
