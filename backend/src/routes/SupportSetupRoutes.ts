import { Router } from 'express';

import SupportController from '@src/controllers/SupportController';
import { validateRequest } from '@src/middleware/validateRequest';
import { createSupportMessageSchema } from '@src/middleware/validationSchemas';

const supportSetupRouter = Router();

supportSetupRouter.get('/tickets', SupportController.listSetupTickets);
supportSetupRouter.get('/messages', SupportController.listSetupMessages);
supportSetupRouter.post('/messages', validateRequest(createSupportMessageSchema), SupportController.createSetupMessage);
supportSetupRouter.patch('/messages/mark-read', SupportController.markSetupMessagesRead);

export default supportSetupRouter;
