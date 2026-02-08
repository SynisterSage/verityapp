import { Router } from 'express';

import SupportController from '@src/controllers/SupportController';

const ticketsRouter = Router();

ticketsRouter.get('/tickets', SupportController.listTickets);

export default ticketsRouter;
