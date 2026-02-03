import { Router } from "express";
import * as Sentry from "@sentry/node";

const router = Router();

/**
 * Test error capture
 * GET /sentry-test/test-error
 */
router.get("/test-error", async (req, res) => {
  console.log("🧪 Test error endpoint hit");
  
  try {
    throw new Error("🧪 Test error from SafeCall - this is intentional!");
  } catch (error) {
    console.log("🧪 Capturing exception to Sentry...");
    const eventId = Sentry.captureException(error, {
      tags: { 
        test: true,
        endpoint: "test-error" 
      },
      extra: { 
        timestamp: new Date().toISOString(),
        testType: "error_capture"
      }
    });
    
    console.log("🧪 Sentry event ID:", eventId);
    
    // IMPORTANT: Flush Sentry to ensure event is sent before response
    await Sentry.flush(2000); // Wait up to 2 seconds for Sentry to send
    console.log("🧪 Sentry flushed");
    
    res.json({ 
      success: true,
      message: "Error captured! Check your Sentry dashboard in ~10 seconds",
      instructions: "Go to Sentry Issues page to see this error",
      eventId
    });
  }
});

/**
 * Test performance tracking
 * GET /sentry-test/test-performance
 */
router.get("/test-performance", async (req, res) => {
  // Use Sentry.startSpan for v8+
  return Sentry.startSpan(
    {
      op: "http.test",
      name: "test_performance_endpoint"
    },
    async (span: any) => {
      const startTime = Date.now();
      
      // Simulate database query
      await Sentry.startSpan(
        { op: "db.query", name: "Simulating database query" },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      );
      
      // Simulate external API call
      await Sentry.startSpan(
        { op: "http.external", name: "Simulating external API call" },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      );
      
      // Simulate fraud analysis
      await Sentry.startSpan(
        { op: "fraud.analysis", name: "Simulating fraud detection" },
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      );
      
      const duration = Date.now() - startTime;
      
      res.json({ 
        success: true,
        message: "Performance data sent! Check Sentry Performance tab",
        duration: `${duration}ms`,
        spans: 3,
        instructions: "Go to Sentry Performance page to see transaction breakdown"
      });
    }
  );
});

/**
 * Test info message/breadcrumb
 * GET /sentry-test/test-message
 */
router.get("/test-message", async (req, res) => {
  console.log("🧪 Test message endpoint hit");
  
  const eventId = Sentry.captureMessage("🧪 Test message from SafeCall", {
    level: "info",
    tags: { 
      test: true,
      endpoint: "test-message"
    },
    extra: { 
      timestamp: new Date().toISOString(),
      testType: "info_message",
      userAgent: req.headers["user-agent"]
    }
  });
  
  console.log("🧪 Sentry message event ID:", eventId);
  
  // Flush to ensure event is sent
  await Sentry.flush(2000);
  console.log("🧪 Sentry flushed");
  
  res.json({ 
    success: true,
    message: "Message captured! Check Sentry Issues tab",
    instructions: "Go to Sentry to see this info message",
    eventId
  });
});

/**
 * Test unhandled error (will be caught by Sentry error handler)
 * GET /sentry-test/test-unhandled
 */
router.get("/test-unhandled", (req, res, next) => {
  // Simulate an unhandled error
  const error: any = new Error("🧪 Unhandled error test");
  error.statusCode = 500;
  error.context = {
    test: true,
    endpoint: "test-unhandled"
  };
  
  // Pass to error handler
  next(error);
});

/**
 * Test async error
 * GET /sentry-test/test-async-error
 */
router.get("/test-async-error", async (req, res, next) => {
  try {
    // Simulate async operation that fails
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error("🧪 Async error test"));
      }, 100);
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { 
        test: true,
        errorType: "async"
      }
    });
    
    res.json({
      success: true,
      message: "Async error captured! Check Sentry dashboard"
    });
  }
});

/**
 * Test with custom context
 * GET /sentry-test/test-context
 */
router.get("/test-context", async (req, res) => {
  Sentry.captureMessage("🧪 Test with custom context", {
    level: "warning",
    tags: {
      test: true,
      feature: "fraud_detection"
    },
    contexts: {
      call: {
        callSid: "CA1234567890test",
        from: "+12065551234",
        to: "+15551234567",
        fraudScore: 85
      },
      user: {
        id: "test-user-123",
        role: "elder"
      }
    },
    extra: {
      matchedKeywords: ["test", "fraud", "keywords"],
      processingTime: 1234,
      voiceSynthetic: 0.92
    }
  });
  
  // Flush to ensure event is sent
  await Sentry.flush(2000);
  
  res.json({
    success: true,
    message: "Context test captured! Check Sentry to see custom context data",
    instructions: "This simulates how we'll track fraud detection events"
  });
});

/**
 * Health check for test routes
 * GET /sentry-test/health
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    sentryEnabled: !!process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    availableTests: [
      "/sentry-test/test-error",
      "/sentry-test/test-performance",
      "/sentry-test/test-message",
      "/sentry-test/test-unhandled",
      "/sentry-test/test-async-error",
      "/sentry-test/test-context"
    ]
  });
});

export default router;
