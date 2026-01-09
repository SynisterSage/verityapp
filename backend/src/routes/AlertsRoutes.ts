import { Router } from 'express';

import AlertsController from '@src/controllers/AlertsController';

const alertsRouter = Router();

alertsRouter.get('/', AlertsController.listAlerts);
alertsRouter.patch('/:alertId', AlertsController.updateAlertStatus);
alertsRouter.delete('/:alertId', AlertsController.deleteAlert);

export default alertsRouter;
