import { Router } from 'express';

import FraudSettingsController from '@src/controllers/FraudSettingsController';

const fraudRouter = Router();

fraudRouter.get('/safe-phrases', FraudSettingsController.listSafePhrases);
fraudRouter.post('/safe-phrases', FraudSettingsController.addSafePhrase);
fraudRouter.delete('/safe-phrases/:phraseId', FraudSettingsController.deleteSafePhrase);

fraudRouter.get('/blocked-callers', FraudSettingsController.listBlockedCallers);
fraudRouter.post('/blocked-callers', FraudSettingsController.addBlockedCaller);
fraudRouter.delete('/blocked-callers/:blockId', FraudSettingsController.deleteBlockedCaller);

export default fraudRouter;
