import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import PATHS from '@src/common/constants/PATHS';
import {
  resetPassword,
  checkEmailExists,
  refreshToken,
  login,
  recordLegalAcceptance,
  getLegalVersions,
} from '@src/controllers/AuthController';
import { validateRequest } from '@src/middleware/validateRequest';
import {
  resetPasswordSchema,
  checkEmailSchema,
  legalAcceptanceSchema,
} from '@src/middleware/validationSchemas';

const router = Router();

const checkEmailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check for auth routes
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    routes: [
      'POST /login',
      'POST /refresh-token',
      'POST /reset-password',
      'GET /check-email',
      'GET /legal-versions',
      'POST /legal-acceptance',
    ],
  });
});

router.get('/check-email', checkEmailLimiter, validateRequest(checkEmailSchema), checkEmailExists);
router.get('/legal-versions', getLegalVersions);
router.post('/legal-acceptance', validateRequest(legalAcceptanceSchema), recordLegalAcceptance);
router.post('/login', login);
router.post(PATHS.Auth.ResetPassword, validateRequest(resetPasswordSchema), resetPassword);
router.post('/refresh-token', refreshToken);

export default router;
