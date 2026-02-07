import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import PATHS from '@src/common/constants/PATHS';
import TwilioRoutes from './TwilioRoutes';
import CallsRoutes from './CallsRoutes';
import AlertsRoutes from './AlertsRoutes';
import FraudRoutes from './FraudRoutes';
import ProfilesRoutes from './ProfilesRoutes';
import AuthRoutes from './AuthRoutes';
import TwilioNumberPoolController from '@src/controllers/TwilioNumberPoolController';
import { validateRequest } from '@src/middleware/validateRequest';
import { assignNumberSchema } from '@src/middleware/validationSchemas';

/******************************************************************************
                                Setup
******************************************************************************/

const apiRouter = Router();

// Rate limiter for number assignment (stricter limit for sensitive operation)
// Max 3 assignments per user per hour to prevent abuse
const assignNumberLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  keyGenerator: (req) => {
    // Rate limit by user ID from auth token, fallback to IP
    const authHeader = req.header('authorization') ?? '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('bearer '.length)
      : '';
    return token || req.ip || 'unknown';
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many number assignments. You can assign a maximum of 3 numbers per hour.',
      retryAfter: (req as any).rateLimit?.resetTime,
    });
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

apiRouter.use('/webhook/twilio', TwilioRoutes);
apiRouter.use(PATHS.Calls._, CallsRoutes);
apiRouter.use(PATHS.Alerts._, AlertsRoutes);
apiRouter.use(PATHS.Fraud._, FraudRoutes);
apiRouter.use(PATHS.Profiles._, ProfilesRoutes);
apiRouter.use(PATHS.Auth._, AuthRoutes);

// Twilio number pool endpoints
apiRouter.post('/profiles/:profileId/assign-number', assignNumberLimiter, validateRequest(assignNumberSchema), TwilioNumberPoolController.assignNumber);
apiRouter.get('/admin/twilio-numbers/stats', TwilioNumberPoolController.getStats);

/******************************************************************************
                                Export default
******************************************************************************/

export default apiRouter;
