# Sentry Integration & Error Tracking Setup

## Overview

Sentry will be integrated to:
- **Capture all errors** in production (Render)
- **Track performance** metrics (API response times, fraud scoring latency)
- **Alert on critical failures** (Twilio, Azure, database issues)
- **Provide error history** and trends
- **Enable debugging** with stack traces, breadcrumbs, and context

This is a **private dashboard** (only visible to you/admin team) for monitoring system health.

---

## Prerequisites

### What You Need
- [ ] Sentry account (free tier: 5,000 errors/month - plenty for beta)
- [ ] Sentry organization created
- [ ] Sentry project created for "SafeCall Backend"
- [ ] Render dashboard access (to add env var)

### Sign Up
1. Go to https://sentry.io
2. Create account with your email
3. Create organization: "SafeCall"
4. Create project: "Backend" (Node.js)
5. Copy DSN (Data Source Name) - looks like: `https://xxx@yyy.ingest.sentry.io/123456`

---

## Step-by-Step Implementation

### Step 1: Install Sentry Package

**File: `package.json`**

```bash
cd /Users/lex/Desktop/safecall/backend
npm install @sentry/node @sentry/tracing
```

**Expected output:**
```
added @sentry/node@7.x.x
added @sentry/tracing@7.x.x
added X packages
```

---

### Step 2: Create Sentry Configuration File

**File: `backend/src/config/sentry.ts`**

```typescript
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

export function initSentry(app: Express) {
  // Initialize Sentry
  Sentry.init({
    // DSN from Sentry dashboard
    dsn: process.env.SENTRY_DSN,
    
    // Environment
    environment: process.env.NODE_ENV || "development",
    
    // Release version (for tracking deploys)
    release: process.env.APP_VERSION || "1.0.0-beta",
    
    // Integrations
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ request: true, serverName: false }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
      nodeProfilingIntegration() // Performance profiling
    ],
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // 10% of errors in prod, 100% in dev
    
    // Profiling
    profilesSampleRate: 0.1,
    
    // Ignore noisy errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      // Random plugins/extensions
      "Can't find variable: ZiteReader",
      "jigsaw is not defined",
      "ComboSearch is not defined",
      // Network errors we don't control
      "NetworkError",
      "timeout of",
      "ECONNREFUSED"
    ],
    
    // Before sending error to Sentry (filter sensitive data)
    beforeSend(event, hint) {
      // Don't send development errors
      if (process.env.NODE_ENV === "development") {
        console.log("Sentry Event:", event);
        return null; // Don't actually send to Sentry in dev
      }
      
      // Strip sensitive data from request
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers["authorization"];
        delete event.request.headers["x-api-key"];
      }
      
      // Don't send if no error
      if (!event.exception && !event.message) {
        return null;
      }
      
      return event;
    }
  });
  
  // Attach Sentry to Express
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.errorHandler());
  
  console.log("✓ Sentry initialized");
}

export { Sentry };
```

---

### Step 3: Update Main App File

**File: `backend/src/app.ts`** (or `backend/src/index.ts`)

```typescript
import express from "express";
import { initSentry } from "@src/config/sentry";

const app = express();

// Initialize Sentry FIRST, before other middleware
initSentry(app);

// ... rest of middleware ...
app.use(express.json());
app.use(cors());

// ... routes ...
app.use("/api", apiRoutes);
app.use("/twilio", twilioRoutes);
app.use("/health", healthRoutes);

// Error handling middleware (after all routes)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Capture with Sentry
  Sentry.captureException(err, {
    tags: {
      endpoint: req.path,
      method: req.method
    },
    contexts: {
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers
      }
    }
  });
  
  // Return error response
  res.status(500).json({
    error: "Internal server error",
    requestId: res.getHeader("x-request-id")
  });
});

export default app;
```

---

### Step 4: Add Sentry DSN to Render Environment Variables

**In Render Dashboard:**

1. Go to https://dashboard.render.com
2. Select your SafeCall backend service
3. Go to **Environment** tab
4. Add new environment variable:
   - **Key:** `SENTRY_DSN`
   - **Value:** `https://xxx@yyy.ingest.sentry.io/123456` (from Sentry dashboard)
5. Click "Save"

**Verify:**
```bash
# In Render logs, you should see:
✓ Sentry initialized
```

---

### Step 5: Add Error Logging to Critical Functions

**File: `backend/src/controllers/TwilioController.ts`**

```typescript
import { Sentry } from "@src/config/sentry";

export async function recordingReady(req: Request, res: Response) {
  const startTime = Date.now();
  
  try {
    const callSid = req.body.CallSid;
    const recordingUrl = req.body.RecordingUrl;
    
    // Add breadcrumb (for debugging)
    Sentry.captureMessage("Recording received", "info", {
      contexts: {
        call: {
          callSid,
          from: req.body.From,
          to: req.body.To,
          duration: req.body.CallDuration
        }
      }
    });
    
    // Download recording
    const audioBuffer = await downloadRecording(recordingUrl);
    
    // Transcribe
    const transcript = await transcribeAudio(audioBuffer);
    
    // Detect voice
    const voiceAnalysis = await detectSyntheticVoice(audioBuffer);
    
    // Analyze fraud
    const fraudAnalysis = analyzeTranscript(transcript, {
      callerCountry: getCountryFromPhone(req.body.From),
      callDurationSeconds: parseInt(req.body.CallDuration),
      voiceAnalysis
    });
    
    // Log successful analysis
    const duration = Date.now() - startTime;
    Sentry.captureMessage("Call analyzed successfully", "info", {
      level: "info",
      extra: {
        callSid,
        fraudScore: fraudAnalysis.score,
        riskLevel: fraudAnalysis.riskLevel,
        processingTime: duration,
        transcriptionLength: transcript.length
      }
    });
    
    // Store in database
    const call = await db.calls.create({
      twilio_call_sid: callSid,
      transcript,
      fraud_score: fraudAnalysis.score,
      fraud_risk_level: fraudAnalysis.riskLevel,
      matched_keywords: fraudAnalysis.matchedKeywords,
      voice_synthetic_score: voiceAnalysis.chunkMedianFake
    });
    
    res.status(200).json({ success: true, callId: call.id });
    
  } catch (error: any) {
    // Capture error with full context
    Sentry.captureException(error, {
      level: "error",
      tags: {
        endpoint: "/twilio/recording-ready",
        component: "call_processing"
      },
      contexts: {
        call: {
          callSid: req.body?.CallSid,
          from: req.body?.From,
          to: req.body?.To
        }
      },
      extra: {
        requestBody: JSON.stringify(req.body),
        errorTime: new Date().toISOString()
      }
    });
    
    res.status(500).json({ error: "Failed to process recording" });
  }
}
```

---

### Step 6: Add Performance Monitoring

**File: `backend/src/services/fraud.ts`**

```typescript
import { Sentry } from "@src/config/sentry";

export function analyzeTranscript(transcript: string, metadata: FraudMetadata) {
  // Create performance span
  const transaction = Sentry.startTransaction({
    op: "fraud_analysis",
    name: "analyzeTranscript",
    description: "Analyze transcript for fraud indicators"
  });
  
  try {
    // Keyword matching span
    const matchSpan = transaction.startChild({
      op: "fraud.keyword_matching",
      description: "Match fraud keywords"
    });
    const { matches, negated } = findMatches(transcript, DEFAULT_KEYWORDS);
    matchSpan.finish();
    
    // Scoring span
    const scoreSpan = transaction.startChild({
      op: "fraud.score_calculation",
      description: "Calculate fraud score"
    });
    const score = calculateScore(matches, metadata);
    scoreSpan.finish();
    
    // Finish transaction (will include all spans)
    transaction.finish();
    
    // Log analysis
    Sentry.captureMessage("Fraud analysis complete", "info", {
      extra: {
        score,
        matchCount: matches.length,
        processingTime: transaction.endTimestamp - transaction.startTimestamp
      }
    });
    
    return { score, riskLevel: scoreToRiskLevel(score), matchedKeywords: matches.map(m => m.phrase) };
    
  } catch (error) {
    Sentry.captureException(error);
    transaction.finish();
    throw error;
  }
}
```

---

### Step 7: Add Database Error Tracking

**File: `backend/src/config/database.ts`**

```typescript
import { Sentry } from "@src/config/sentry";

// Wrap database calls
export async function executeQuery(query: string, params: any[] = []) {
  const span = Sentry.getCurrentHub().getActiveTransaction()?.startChild({
    op: "db.query",
    description: query.substring(0, 100)
  });
  
  try {
    const result = await db.raw(query, params);
    span?.finish();
    return result;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "database" },
      extra: { query: query.substring(0, 200) }
    });
    span?.finish();
    throw error;
  }
}
```

---

### Step 8: Setup Alerts in Sentry

**In Sentry Dashboard:**

1. Go to **Alerts** → **Create Alert Rule**

2. **Critical Alert: Fraud Detection Failure**
   - **Condition:** `error.type:Exception` + `tags.component:fraud_analysis`
   - **Action:** Send to Slack / Email
   - **Description:** "Fraud analysis failed"

3. **Warning Alert: High Error Rate**
   - **Condition:** Error count > 10 in 5 minutes
   - **Action:** Send notification
   - **Description:** "Error spike detected"

4. **Performance Alert: Slow Processing**
   - **Condition:** `fraud_analysis` transaction duration > 5 seconds
   - **Action:** Send notification
   - **Description:** "Fraud scoring taking too long"

---

### Step 9: Test Sentry Integration

**Test Endpoint: `backend/src/routes/test.ts`**

```typescript
import { Router } from "express";
import { Sentry } from "@src/config/sentry";

const router = Router();

// Test error capture
router.get("/test-error", (req, res) => {
  try {
    throw new Error("Test error from SafeCall");
  } catch (error) {
    Sentry.captureException(error);
    res.json({ message: "Error captured, check Sentry dashboard" });
  }
});

// Test performance tracking
router.get("/test-performance", async (req, res) => {
  const transaction = Sentry.startTransaction({
    op: "http.request",
    name: "test_performance"
  });
  
  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  transaction.finish();
  res.json({ message: "Performance tracked" });
});

// Test breadcrumb
router.get("/test-breadcrumb", (req, res) => {
  Sentry.captureMessage("Test breadcrumb", "info");
  res.json({ message: "Breadcrumb captured" });
});

export default router;
```

**Run tests:**
```bash
curl http://localhost:3000/test-error
curl http://localhost:3000/test-performance
curl http://localhost:3000/test-breadcrumb

# Check Sentry dashboard - should see 3 new events
```

---

## What Gets Tracked

### Automatically
- ✅ All unhandled exceptions
- ✅ All Promise rejections
- ✅ HTTP request/response (method, URL, status code)
- ✅ Performance metrics (request duration)
- ✅ Memory usage, CPU

### Manually (you add)
- 📊 Fraud analysis metrics (score, keywords matched)
- 📊 Twilio webhook processing (success/failure)
- 📊 Azure transcription latency
- 📊 Voice synthesis detection latency
- 📊 Database query performance
- 📊 User actions (block, mark safe, report)

---

## Sentry Dashboard Features

### **Issues Page**
- Lists all errors grouped by type
- Shows frequency, when it started, last seen
- Click to see full stack trace

### **Performance Page**
- Shows slowest endpoints
- Response time trends
- Transaction breakdowns

### **Releases Page**
- Track which release introduced an error
- Compare error rates between versions

### **Alerts Page**
- Configure notifications for critical errors
- Send to Slack, email, PagerDuty

---

## Free vs Paid

**Free Tier (5,000 errors/month):**
- Perfect for beta
- Includes: error tracking, performance monitoring
- Limited alert rules

**Paid (as you scale):**
- Unlimited errors
- Session replay
- Advanced alert routing

---

## Next Steps (After Sentry is Live)

1. Monitor errors for 24 hours
2. Adjust `ignoreErrors` if too much noise
3. Add Slack integration for critical alerts
4. Create dashboard for your team (optional)

---

## Rollback Plan

If Sentry causes issues:
```bash
# Remove from Render env vars
# Remove SENTRY_DSN variable

# Remove from code (or comment out):
# initSentry(app);

# Redeploy
```

---

## File Checklist

- [ ] `backend/src/config/sentry.ts` - Created
- [ ] `backend/src/app.ts` - Updated to call `initSentry()`
- [ ] `backend/src/controllers/TwilioController.ts` - Added Sentry logging
- [ ] `backend/src/services/fraud.ts` - Added performance spans
- [ ] `backend/package.json` - Updated with sentry packages
- [ ] Render env vars - `SENTRY_DSN` added
- [ ] `backend/src/routes/test.ts` - Created for testing

---

## Estimated Time

- Install packages: 2 min
- Create config file: 5 min
- Update app.ts: 3 min
- Add to Render env: 2 min
- Add logging to controllers: 10 min
- Test: 5 min
- **Total: ~30 minutes**
