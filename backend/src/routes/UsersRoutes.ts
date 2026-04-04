import { Router } from 'express';
import UsersController from '@src/controllers/UsersController';

const router = Router();

// POST /users/:userId/avatar - Upload avatar
router.post('/:userId/avatar', UsersController.uploadAvatar);

// DELETE /users/:userId/avatar - Delete avatar
router.delete('/:userId/avatar', UsersController.deleteAvatar);

export default router;
