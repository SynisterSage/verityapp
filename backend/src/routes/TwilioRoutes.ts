import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import TwilioController from '@src/controllers/TwilioController';
import validateTwilioSignature from '@src/middleware/twilioSignature';

const twilioRouter = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

twilioRouter.use(webhookLimiter);
twilioRouter.use(validateTwilioSignature);

twilioRouter.post('/call-incoming', TwilioController.callIncoming);
twilioRouter.post('/verify-pin', TwilioController.verifyPin);
twilioRouter.post('/dial-status', TwilioController.dialStatus);
// Twilio may send GET callbacks in some console flows; accept both.
twilioRouter.post('/recording-ready', TwilioController.recordingReady);
twilioRouter.get('/recording-ready', TwilioController.recordingReady);

export default twilioRouter;
