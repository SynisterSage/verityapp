import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import UserRoutes from './UserRoutes';
import TwilioRoutes from './TwilioRoutes';
import CallsRoutes from './CallsRoutes';
import AlertsRoutes from './AlertsRoutes';
import FraudRoutes from './FraudRoutes';

/******************************************************************************
                                Setup
******************************************************************************/

const apiRouter = Router();


// ** Add UserRouter ** //

// Init router
const userRouter = Router();

// Get all users
userRouter.get(PATHS.Users.Get, UserRoutes.getAll);
userRouter.post(PATHS.Users.Add, UserRoutes.add);
userRouter.put(PATHS.Users.Update, UserRoutes.update);
userRouter.delete(PATHS.Users.Delete, UserRoutes.delete);

// Add UserRouter
apiRouter.use(PATHS.Users._, userRouter);
apiRouter.use('/webhook/twilio', TwilioRoutes);
apiRouter.use(PATHS.Calls._, CallsRoutes);
apiRouter.use(PATHS.Alerts._, AlertsRoutes);
apiRouter.use(PATHS.Fraud._, FraudRoutes);

/******************************************************************************
                                Export default
******************************************************************************/

export default apiRouter;
