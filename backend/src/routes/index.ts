import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import PATHS from '@src/common/constants/PATHS';
import TwilioRoutes from './TwilioRoutes';
import CallsRoutes from './CallsRoutes';
import AlertsRoutes from './AlertsRoutes';
import FraudRoutes from './FraudRoutes';
import ProfilesRoutes from './ProfilesRoutes';
import AuthRoutes from './AuthRoutes';
import SubscriptionsRoutes from './SubscriptionsRoutes';
import SupportRoutes from './SupportRoutes';
import SupportTicketsRoutes from './SupportTicketsRoutes';
import SupportSetupRoutes from './SupportSetupRoutes';
import AppStoreNotificationsRoutes from './AppStoreNotificationsRoutes';
import TwilioNumberPoolController from '@src/controllers/TwilioNumberPoolController';
import { validateRequest } from '@src/middleware/validateRequest';
import { assignNumberSchema } from '@src/middleware/validationSchemas';
import { requireInternalOpsAccess } from '@src/middleware/internalOpsAuth';

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
    // Get client IP (supports IPv4 and IPv6)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    return token || clientIp;
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
apiRouter.use('/webhook' + PATHS.Webhooks.AppleAppStoreNotifications, AppStoreNotificationsRoutes);
apiRouter.use(PATHS.Calls._, CallsRoutes);
apiRouter.use(PATHS.Alerts._, AlertsRoutes);
apiRouter.use(PATHS.Fraud._, FraudRoutes);
apiRouter.use(PATHS.Profiles._, ProfilesRoutes);
apiRouter.use(PATHS.Subscriptions._, SubscriptionsRoutes);
apiRouter.use(`${PATHS.Profiles._}/support`, SupportTicketsRoutes);
apiRouter.use(`${PATHS.Profiles._}${PATHS.Profiles.Support}`, SupportRoutes);
apiRouter.use('/support/setup', SupportSetupRoutes);
apiRouter.use(PATHS.Auth._, AuthRoutes);

// Twilio number pool endpoints
apiRouter.post('/profiles/:profileId/assign-number', assignNumberLimiter, validateRequest(assignNumberSchema), TwilioNumberPoolController.assignNumber);
apiRouter.get('/admin/twilio-numbers/stats', requireInternalOpsAccess, TwilioNumberPoolController.getStats);

/******************************************************************************
                                Export default
******************************************************************************/

export default apiRouter;
