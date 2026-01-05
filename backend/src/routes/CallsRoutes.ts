import { Router } from 'express';

import CallsController from '@src/controllers/CallsController';

const callsRouter = Router();

callsRouter.get('/:callId/recording-url', CallsController.getRecordingUrl);
callsRouter.patch('/:callId/feedback', CallsController.submitFeedback);

export default callsRouter;
