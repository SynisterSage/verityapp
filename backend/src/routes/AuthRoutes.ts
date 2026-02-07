import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import { resetPassword, checkEmailExists } from '@src/controllers/AuthController';
import { validateRequest } from '@src/middleware/validateRequest';
import { resetPasswordSchema, checkEmailSchema } from '@src/middleware/validationSchemas';

const router = Router();

// Health check for auth routes
router.get('/health', (req, res) => {
  res.json({ status: 'ok', routes: ['POST /reset-password', 'GET /check-email'] });
});

router.get('/check-email', validateRequest(checkEmailSchema), checkEmailExists);
router.post(PATHS.Auth.ResetPassword, validateRequest(resetPasswordSchema), resetPassword);

export default router;
