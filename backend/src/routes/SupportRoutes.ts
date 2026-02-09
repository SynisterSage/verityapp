import { Router } from 'express';

import SupportController from '@src/controllers/SupportController';
import AssistantStatusController from '@src/controllers/AssistantStatusController';
import { validateRequest } from '@src/middleware/validateRequest';
import { createSupportMessageSchema } from '@src/middleware/validationSchemas';

const supportRouter = Router({ mergeParams: true });

supportRouter.get('/messages', SupportController.listMessages);
supportRouter.get('/messages/unread-count', SupportController.getUnreadCount);
supportRouter.post('/messages', validateRequest(createSupportMessageSchema), SupportController.createMessage);
supportRouter.patch('/messages/mark-read', SupportController.markAgentMessagesRead);
supportRouter.get('/assistant-status', AssistantStatusController.getStatus);
supportRouter.post('/tickets', SupportController.createTicket);
supportRouter.delete('/tickets/:ticketId', SupportController.deleteTicket);

export default supportRouter;
