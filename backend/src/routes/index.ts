import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import TwilioRoutes from './TwilioRoutes';
import CallsRoutes from './CallsRoutes';
import AlertsRoutes from './AlertsRoutes';
import FraudRoutes from './FraudRoutes';
import ProfilesRoutes from './ProfilesRoutes';
import AuthRoutes from './AuthRoutes';
import TwilioNumberPoolController from '@src/controllers/TwilioNumberPoolController';

/******************************************************************************
                                Setup
******************************************************************************/

const apiRouter = Router();


apiRouter.use('/webhook/twilio', TwilioRoutes);
apiRouter.use(PATHS.Calls._, CallsRoutes);
apiRouter.use(PATHS.Alerts._, AlertsRoutes);
apiRouter.use(PATHS.Fraud._, FraudRoutes);
apiRouter.use(PATHS.Profiles._, ProfilesRoutes);
apiRouter.use(PATHS.Auth._, AuthRoutes);

// Twilio number pool endpoints
apiRouter.post('/profiles/:profileId/assign-number', TwilioNumberPoolController.assignNumber);
apiRouter.get('/admin/twilio-numbers/stats', TwilioNumberPoolController.getStats);

/******************************************************************************
                                Export default
******************************************************************************/

export default apiRouter;
