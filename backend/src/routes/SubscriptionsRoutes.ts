import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import SubscriptionsController from '@src/controllers/SubscriptionsController';
import { validateRequest } from '@src/middleware/validateRequest';
import { verifySubscriptionReceiptSchema } from '@src/middleware/validationSchemas';

const router = Router();

router.get(PATHS.Subscriptions.Status, SubscriptionsController.status);
router.post(
  PATHS.Subscriptions.Verify,
  validateRequest(verifySubscriptionReceiptSchema),
  SubscriptionsController.verify
);

export default router;
