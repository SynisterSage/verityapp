import * as Sentry from "@sentry/node";
import type { Express } from "express";

// Initialize Sentry BEFORE any other imports
// This must be called before express is imported
export function initSentryEarly() {
  // Only initialize if DSN is provided
  if (!process.env.SENTRY_DSN) {
    console.log("⚠️  Sentry DSN not found - skipping initialization");
    return;
  }

  // Initialize Sentry
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    
    // Environment
    environment: process.env.NODE_ENV || "development",
    
    // Release version
    release: process.env.APP_VERSION || "1.0.0-beta",
    
    // Integrations (v8+ uses direct imports)
    // Removed nodeProfilingIntegration due to Node.js version compatibility
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration()
    ],
    
    // Performance monitoring
    // Sample 10% of transactions in production, 100% in dev
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    
    // Ignore noisy errors that don't need tracking
    ignoreErrors: [
      "NetworkError",
      "timeout of",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT"
    ],
    
    // Filter sensitive data before sending to Sentry
    beforeSend(event, hint) {
      // Don't send in development (just log locally)
      if (process.env.NODE_ENV === "development") {
        console.log("🐛 Sentry Event (dev mode - not sent):", event);
        return null;
      }
      
      // Strip sensitive data from requests
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers?.["authorization"];
        delete event.request.headers?.["x-api-key"];
      }
      
      return event;
    }
  });
  
  console.log("✅ Sentry initialized (early)");
}

// Setup Express-specific Sentry handlers after app is created
export function setupSentryMiddleware(app: Express) {
  if (!process.env.SENTRY_DSN) {
    return;
  }
  
  // Setup Express error handler for Sentry (v8+)
  Sentry.setupExpressErrorHandler(app);
  
  console.log("✅ Sentry Express middleware attached");
}

// Error handler middleware (attach after all routes)
export function sentryErrorHandler() {
  return (err: any, req: any, res: any, next: any) => {
    // Capture exception in Sentry
    Sentry.captureException(err);
    
    // Pass to next error handler
    next(err);
  };
}

// Export Sentry for use in other files
export { Sentry };
