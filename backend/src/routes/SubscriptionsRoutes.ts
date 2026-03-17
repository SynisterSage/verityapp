import { Router } from 'express';

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

router.get(PATHS.Subscriptions.Status, SubscriptionsController.status);
router.post(
  PATHS.Subscriptions.FacilityValidate,
  validateRequest(validateFacilityOfferCodeSchema),
  SubscriptionsController.validateFacilityOffer
);
router.get(
  PATHS.Subscriptions.FacilityResolveToken,
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
