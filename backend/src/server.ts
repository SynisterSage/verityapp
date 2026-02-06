// Initialize Sentry BEFORE any other imports
// This MUST be first to properly instrument express
import { initSentryEarly, setupSentryMiddleware, sentryErrorHandler } from '@src/config/sentry';
initSentryEarly();

import morgan from 'morgan';
import path from 'path';
import helmet from 'helmet';
import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors, { CorsOptions } from 'cors';
import logger from 'jet-logger';

import BaseRouter from '@src/routes';
import sentryTestRoutes from '@src/routes/sentry-test';

import Paths from '@src/common/constants/PATHS';
import ENV from '@src/common/constants/ENV';
import HTTP_STATUS_CODES, {
  HttpStatusCodes,
} from '@src/common/constants/HTTP_STATUS_CODES';
import { RouteError } from '@src/common/util/route-errors';
import { NODE_ENVS } from '@src/common/constants';


/******************************************************************************
                                Setup
******************************************************************************/

const app = express();

// Setup Sentry Express middleware
setupSentryMiddleware(app);

// Allow express-rate-limit to respect X-Forwarded-For behind proxies (ngrok, prod LB).
app.set('trust proxy', 1);


// **** Middleware **** //

const corsOrigin = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions: CorsOptions = {
  origin: (requestOrigin, cb) => {
    if (!requestOrigin || corsOrigin.length === 0 || corsOrigin.includes(requestOrigin)) {
      cb(null, true);
      return;
    }
    cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
};

// Basic middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/webhook/twilio'),
});

// Show routes called in console during development
if (ENV.NodeEnv === NODE_ENVS.Dev) {
  app.use(morgan('dev'));
}

const disableHelmet = process.env.DISABLE_HELMET === 'true';
if (disableHelmet) {
  throw new Error('DISABLE_HELMET is not supported; helmet middleware must stay enabled.');
}
app.use(helmet());

// Add APIs, must be after middleware
app.use(Paths._, apiLimiter, BaseRouter);

// Add Sentry test routes
app.use('/sentry-test', sentryTestRoutes);

// Add Sentry error handler (must be before other error handlers)
app.use(sentryErrorHandler());

// Add error handler
app.use((err: Error, _: Request, res: Response, next: NextFunction) => {
  if (ENV.NodeEnv !== NODE_ENVS.Test.valueOf()) {
    logger.err(err, true);
  }
  let status: HttpStatusCodes = HTTP_STATUS_CODES.BadRequest;
  if (err instanceof RouteError) {
    status = err.status;
    res.status(status).json({ error: err.message });
  }
  return next(err);
});


// **** FrontEnd Content **** //

// Set views directory (html)
const viewsDir = path.join(__dirname, 'views');
app.set('views', viewsDir);

// Set static directory (js and css).
const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir));

// Nav to users pg by default
app.get('/', (_: Request, res: Response) => {
  return res.redirect('/users');
});

// Redirect to login if not logged in.
app.get('/users', (_: Request, res: Response) => {
  return res.sendFile('users.html', { root: viewsDir });
});


/******************************************************************************
                                Export default
******************************************************************************/

export default app;
