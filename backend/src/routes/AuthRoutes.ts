import { Router } from 'express';

import PATHS from '@src/common/constants/PATHS';
import { resetPassword } from '@src/controllers/AuthController';

const router = Router();

router.post(PATHS.Auth.ResetPassword, resetPassword);

export default router;
