import { Router } from 'express';

import TwilioController from '@src/controllers/TwilioController';

const twilioRouter = Router();

twilioRouter.post('/call-incoming', TwilioController.callIncoming);
// Twilio may send GET callbacks in some console flows; accept both.
twilioRouter.post('/recording-ready', TwilioController.recordingReady);
twilioRouter.get('/recording-ready', TwilioController.recordingReady);

export default twilioRouter;
