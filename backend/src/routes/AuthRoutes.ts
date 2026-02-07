import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import { resetPassword, checkEmailExists, refreshToken, login } from '@src/controllers/AuthController';
import { validateRequest } from '@src/middleware/validateRequest';
import { resetPasswordSchema, checkEmailSchema } from '@src/middleware/validationSchemas';

const router = Router();

// Health check for auth routes
router.get('/health', (req, res) => {
  res.json({ status: 'ok', routes: ['POST /login', 'POST /refresh-token', 'POST /reset-password', 'GET /check-email'] });
});

router.get('/check-email', validateRequest(checkEmailSchema), checkEmailExists);
router.post('/login', login);
router.post(PATHS.Auth.ResetPassword, validateRequest(resetPasswordSchema), resetPassword);
router.post('/refresh-token', refreshToken);

export default router;
