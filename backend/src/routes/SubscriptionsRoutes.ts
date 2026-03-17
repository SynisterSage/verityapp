import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import PATHS from '@src/common/constants/PATHS';
import SubscriptionsController from '@src/controllers/SubscriptionsController';
import { validateRequest } from '@src/middleware/validateRequest';
import {
  resolveFacilityOfferTokenSchema,
  validateFacilityOfferCodeSchema,
  syncSubscriptionEntitlementSchema,
  verifySubscriptionReceiptSchema,
} from '@src/middleware/validationSchemas';

const router = Router();

const facilityOfferResolveLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many facility link checks. Please wait a minute and try again.',
  },
});

const facilityOfferValidateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authHeader = req.header('authorization') ?? '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('bearer '.length).trim()
      : '';
    const clientIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    return bearerToken || clientIp;
  },
  message: {
    error: 'Too many facility code attempts. Please wait a minute and try again.',
  },
});

router.get(PATHS.Subscriptions.Status, SubscriptionsController.status);
router.post(
  PATHS.Subscriptions.FacilityValidate,
  facilityOfferValidateLimiter,
  validateRequest(validateFacilityOfferCodeSchema),
  SubscriptionsController.validateFacilityOffer
);
router.get(
  PATHS.Subscriptions.FacilityResolveToken,
  facilityOfferResolveLimiter,
  validateRequest(resolveFacilityOfferTokenSchema),
  SubscriptionsController.resolveFacilityOfferToken
);
router.post(
  PATHS.Subscriptions.Verify,
  validateRequest(verifySubscriptionReceiptSchema),
  SubscriptionsController.verify
);
router.post(
  PATHS.Subscriptions.SyncEntitlement,
  validateRequest(syncSubscriptionEntitlementSchema),
  SubscriptionsController.syncEntitlement
);

export default router;
