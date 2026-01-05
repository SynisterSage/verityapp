import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import UserRoutes from './UserRoutes';
import TwilioRoutes from './TwilioRoutes';

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

/******************************************************************************
                                Export default
******************************************************************************/

export default apiRouter;
