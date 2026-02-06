import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import { resetPassword } from '@src/controllers/AuthController';

const router = Router();

// Health check for auth routes
router.get('/health', (req, res) => {
  res.json({ status: 'ok', routes: ['POST /reset-password'] });
});

router.post(PATHS.Auth.ResetPassword, resetPassword);

export default router;
