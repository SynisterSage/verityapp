import { Router } from 'express';

import FraudSettingsController from '@src/controllers/FraudSettingsController';

const fraudRouter = Router();

fraudRouter.get('/safe-phrases', FraudSettingsController.listSafePhrases);
fraudRouter.post('/safe-phrases', FraudSettingsController.addSafePhrase);
fraudRouter.delete('/safe-phrases/:phraseId', FraudSettingsController.deleteSafePhrase);

fraudRouter.get('/blocked-callers', FraudSettingsController.listBlockedCallers);
fraudRouter.post('/blocked-callers', FraudSettingsController.addBlockedCaller);
fraudRouter.delete('/blocked-callers/:blockId', FraudSettingsController.deleteBlockedCaller);

fraudRouter.get('/trusted-contacts', FraudSettingsController.listTrustedContacts);
fraudRouter.post('/trusted-contacts', FraudSettingsController.addTrustedContacts);
fraudRouter.delete('/trusted-contacts/:trustedId', FraudSettingsController.deleteTrustedContact);

export default fraudRouter;
