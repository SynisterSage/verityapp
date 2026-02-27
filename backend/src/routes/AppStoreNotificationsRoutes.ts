import { Router } from 'express';

import AppStoreNotificationsController from '@src/controllers/AppStoreNotificationsController';
import { validateRequest } from '@src/middleware/validateRequest';
import { appStoreNotificationSchema } from '@src/middleware/validationSchemas';

const router = Router();

router.post('/', validateRequest(appStoreNotificationSchema), AppStoreNotificationsController.receive);

export default router;
