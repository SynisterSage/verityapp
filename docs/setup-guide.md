# Project Structure & Setup Guide

## Directory Structure

```
safecall/
├── frontend/                           # React Native + Expo app
│   ├── app.json                        # Expo configuration
│   ├── package.json                    # Dependencies
│   ├── tsconfig.json                   # TypeScript config
│   ├── .env.example                    # Environment variables template
│   ├── src/
│   │   ├── screens/                    # Screen components
│   │   │   ├── auth/
│   │   │   │   ├── LoginScreen.tsx
│   │   │   │   ├── SignupScreen.tsx
│   │   │   │   └── ForgotPasswordScreen.tsx
│   │   │   ├── onboarding/
│   │   │   │   ├── ProfileSetupScreen.tsx
│   │   │   │   ├── GreetingRecordingScreen.tsx
│   │   │   │   ├── KeywordSetupScreen.tsx
│   │   │   │   └── ActivationCodeScreen.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── HomeScreen.tsx
│   │   │   │   ├── CallHistoryScreen.tsx
│   │   │   │   ├── CallDetailScreen.tsx
│   │   │   │   └── StatsScreen.tsx
│   │   │   └── settings/
│   │   │       ├── SettingsScreen.tsx
│   │   │       ├── AlertPreferencesScreen.tsx
│   │   │       └── BlockedNumbersScreen.tsx
│   │   ├── components/                 # Reusable components
│   │   │   ├── CallCard.tsx
│   │   │   ├── RecordingButton.tsx
│   │   │   ├── AlertBanner.tsx
│   │   │   ├── TranscriptViewer.tsx
│   │   │   ├── RiskBadge.tsx
│   │   │   └── Layout.tsx
│   │   ├── hooks/                      # Custom hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useCallsSubscription.ts
│   │   │   ├── useRecording.ts
│   │   │   └── useFraudDetection.ts
│   │   ├── services/                   # Business logic
│   │   │   ├── api.ts                  # REST client (axios)
│   │   │   ├── supabase.ts             # Supabase client
│   │   │   ├── audio.ts                # Audio recording/playback
│   │   │   └── notifications.ts        # Local notifications
│   │   ├── types/                      # TypeScript interfaces
│   │   │   ├── user.ts
│   │   │   ├── call.ts
│   │   │   ├── alert.ts
│   │   │   └── index.ts
│   │   ├── context/                    # React Context
│   │   │   ├── AuthContext.tsx
│   │   │   └── CallsContext.tsx
│   │   ├── utils/                      # Utilities
│   │   │   ├── format.ts               # Formatting helpers
│   │   │   ├── validation.ts           # Input validation
│   │   │   └── constants.ts
│   │   └── App.tsx                     # Root component
│   └── assets/
│       ├── images/
│       └── icons/
│
├── backend/                            # Node.js + Express API
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── .env.production
│   ├── src/
│   │   ├── routes/                     # API routes
│   │   │   ├── auth.ts
│   │   │   ├── profiles.ts
│   │   │   ├── calls.ts
│   │   │   ├── alerts.ts
│   │   │   ├── settings.ts
│   │   │   └── webhooks/
│   │   │       └── twilio.ts
│   │   ├── controllers/                # Route handlers
│   │   │   ├── authController.ts
│   │   │   ├── profileController.ts
│   │   │   ├── callController.ts
│   │   │   ├── alertController.ts
│   │   │   └── settingsController.ts
│   │   ├── services/                   # Business logic
│   │   │   ├── twilio.ts               # Twilio integration
│   │   │   ├── azure.ts                # Speech-to-Text
│   │   │   ├── supabase.ts             # Database
│   │   │   ├── sendgrid.ts             # Email service
│   │   │   ├── fraud.ts                # Fraud detection
│   │   │   └── recording.ts            # Audio handling
│   │   ├── middleware/                 # Express middleware
│   │   │   ├── auth.ts                 # JWT verification
│   │   │   ├── validation.ts           # Input validation
│   │   │   ├── errorHandler.ts         # Error handling
│   │   │   └── logging.ts              # Logging
│   │   ├── jobs/                       # Background jobs
│   │   │   ├── transcriptionJob.ts
│   │   │   ├── fraudAnalysisJob.ts
│   │   │   └── alertJob.ts
│   │   ├── types/                      # TypeScript types
│   │   │   ├── index.ts
│   │   │   ├── database.ts
│   │   │   └── api.ts
│   │   ├── config/                     # Configuration
│   │   │   ├── constants.ts
│   │   │   ├── env.ts                  # Environment variables
│   │   │   └── twilio.ts               # Twilio setup
│   │   ├── utils/                      # Utilities
│   │   │   ├── logger.ts
│   │   │   ├── errors.ts
│   │   │   └── validators.ts
│   │   └── app.ts                      # Express app setup
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   └── scripts/
│       ├── seed.ts                     # Database seeding
│       └── migrate.ts                  # Database migrations
│
├── docs/                               # Documentation
│   ├── app-overview.md
│   ├── technical-architecture.md
│   ├── database-schema.md
│   ├── api-specification.md
│   ├── security.md
│   ├── setup-guide.md
│   ├── development.md
│   ├── deployment.md
│   └── troubleshooting.md
│
├── .github/
│   ├── workflows/
│   │   ├── test.yml                    # Run tests on PR
│   │   ├── deploy-staging.yml          # Deploy to staging
│   │   └── deploy-production.yml       # Deploy to production
│   └── CONTRIBUTING.md
│
├── .gitignore
├── README.md
└── LICENSE
```

---

## Development Environment Setup

### Prerequisites

**macOS/Linux:**
```bash
# Node.js (18+)
node --version  # v18.0.0+

# npm (9+)
npm --version   # 9.0.0+

# Xcode (for iOS development)
xcode-select --install

# Android Studio (for Android emulator)
# Download from https://developer.android.com/studio
```

**Windows:**
```powershell
# Node.js (via chocolatey)
choco install nodejs

# Android Studio
# Download from https://developer.android.com/studio

# For iOS: Must use macOS
```

### 1. Backend Setup

```bash
# Clone repository
git clone https://github.com/safecall/safecall.git
cd safecall/backend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Edit .env file with your credentials
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-anon-key
# TWILIO_ACCOUNT_SID=...
# TWILIO_AUTH_TOKEN=...
# AZURE_SPEECH_KEY=...
# AZURE_SPEECH_REGION=...
# SENDGRID_API_KEY=...
# SESSION_SECRET=...

# Create database migrations (manual first time)
npx ts-node scripts/migrate.ts

# Seed default fraud keywords
npx ts-node scripts/seed.ts

# Start development server
npm run dev
# Server runs on http://localhost:5000
```

**Backend .env.example:**
```bash
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGc...  # Service role key (server-side only)
SUPABASE_ANON_KEY=eyJhbGc...     # Anon key (public)

# Twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+15551234567
TWILIO_WEBHOOK_SECRET=xxxx

# Azure Speech-to-Text
AZURE_SPEECH_KEY=xxxx
AZURE_SPEECH_REGION=eastus

# SendGrid
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=noreply@safecall.app

# Application
NODE_ENV=development
PORT=5000
JWT_SECRET=your-secret-key
SESSION_SECRET=your-session-secret

# Logging
LOG_LEVEL=debug

# CORS
CORS_ORIGIN=exp://localhost:*,http://localhost:3000
```

### 2. Frontend Setup

```bash
cd safecall/frontend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Edit .env file
# EXPO_PUBLIC_API_URL=http://localhost:5000/api/v1
# EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=...

# Start Expo development server
npm start

# In Expo Go terminal:
# Press 'i' for iOS simulator
# Press 'a' for Android emulator
# Press 'w' for web browser
```

**Frontend .env.example:**
```bash
# API
EXPO_PUBLIC_API_URL=http://localhost:5000/api/v1

# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Environment
EXPO_PUBLIC_ENV=development
```

### 3. Database Setup (Supabase)

```bash
# Create Supabase project at https://supabase.com

# Get credentials
# Settings > API
# - Project URL
# - anon key (public)
# - service role key (secret)

# Create migrations
cd backend
npx supabase migration new init_schema

# Edit migration file with SQL from docs/database-schema.md
# Then run migration
npx supabase db push
```

### 4. Twilio Setup

```bash
# Create Twilio account at https://www.twilio.com

# Buy virtual phone number
# Phone Numbers > Buy a Number > Voice

# Configure URL callbacks
# Phone Numbers > [Your number] > Voice Configuration
# A Call Comes In: POST https://your-domain.com/api/v1/webhook/twilio/call-incoming

# Get credentials
# Account Info: Account SID, Auth Token
# API Keys: Create API key for authentication
```

### 5. Azure Setup

```bash
# Create Azure Speech Resource
# https://portal.azure.com
# Create Resource > Speech

# Get credentials
# Keys > Key1
# Endpoints > Speech-to-Text endpoint

# Test with CLI
curl -X POST "https://[region].stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1" \
  -H "Ocp-Apim-Subscription-Key: [KEY]" \
  -H "Content-Type: audio/wav" \
  --data-binary "@test.wav"
```

---

## Running the App

### Development Mode

**Terminal 1: Backend**
```bash
cd backend
npm run dev
# Output: API running on http://localhost:5000
```

**Terminal 2: Frontend**
```bash
cd frontend
npm start
# Output: Expo server running
# Press 'i' for iOS or 'a' for Android
```

### Testing Locally

**iOS Simulator:**
```bash
# Start simulator
open -a Simulator

# Run app in simulator
npm start
# Press 'i'
```

**Android Emulator:**
```bash
# Start Android Studio
# Create virtual device: AVD Manager > Create Virtual Device

# Run app
npm start
# Press 'a'
```

**Web Browser (for testing):**
```bash
npm start
# Press 'w'
# Opens http://localhost:19006
```

---

## Testing Call Flow Locally

### 1. Setup Test Credentials

Create test user in Supabase:
```sql
INSERT INTO users (email, name, user_type) VALUES
('grandma@example.com', 'Margaret Smith', 'elder');

INSERT INTO profiles (
  caretaker_id, first_name, last_name, phone_number, twilio_virtual_number
) VALUES
('grandma_uuid', 'Margaret', 'Smith', '+15551234567', '+15556789012');
```

### 2. Record Greeting

```bash
# Via app UI or API
curl -X POST http://localhost:5000/api/v1/profiles/prof_id/greeting \
  -H "Authorization: Bearer token" \
  -F "audio=@greeting.wav"
```

### 3. Simulate Incoming Call

```bash
# Use Twilio CLI to send test call
twilio api:incoming-phone-numbers:list
twilio api:calls:create --from '+15551112222' --to '+15556789012'

# Or use curl to simulate webhook
curl -X POST http://localhost:5000/api/v1/webhook/twilio/call-incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123&From=%2B15551112222&To=%2B15556789012"
```

### 4. Mock Recording Ready

```bash
curl -X POST http://localhost:5000/api/v1/webhook/twilio/recording-ready \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123&RecordingSid=RE123&RecordingUrl=https://api.twilio.com/.../Recordings/RE123"
```

### 5. Check Dashboard

Open app, see new call appear with fraud detection results.

---

## Code Style & Standards

### TypeScript

```typescript
// Always use explicit types
const getCall = async (id: string): Promise<Call> => {
  // ...
};

// Use interfaces for objects
interface Call {
  id: string;
  profile_id: string;
  fraud_score: number;
  transcript: string;
  created_at: Date;
}

// Use enums for constants
enum FraudRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}
```

### Naming Conventions

```typescript
// Variables: camelCase
const userEmail = 'user@example.com';

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;

// Types/Interfaces: PascalCase
interface UserProfile {}
type AlertType = 'email' | 'sms' | 'push';

// Functions: camelCase
const validatePhoneNumber = (phone: string): boolean => {};

// Files: kebab-case (components), camelCase (utils)
// ✅ CallDetailScreen.tsx
// ✅ useCallsSubscription.ts
// ✅ validateEmail.ts
```

### Error Handling

```typescript
// Always catch and log errors
try {
  await transcribeAudio(recording);
} catch (error) {
  logger.error('Transcription failed', {
    error: error.message,
    recordingId: recording.id,
    stack: error.stack
  });
  
  // Re-throw with context
  throw new TranscriptionError(
    'Failed to transcribe audio',
    { originalError: error, recordingId: recording.id }
  );
}
```

---

## Debugging

### Backend Debugging

```typescript
// Use winston logger
import logger from './utils/logger';

logger.info('Call received', { callSid, from, to });
logger.error('Transcription failed', { error, recordingId });
logger.debug('Fraud score calculated', { score, keywords });
```

**View logs:**
```bash
# Railway dashboard
railway logs

# Local logs
tail -f logs/app.log
```

### Frontend Debugging

```typescript
// React Native debugger
import { LogBox } from 'react-native';

// Ignore specific warnings
LogBox.ignoreLogs(['Non-serializable values']);

// Debug logs
console.log('[DEBUG] Call data:', callData);
console.warn('[WARN] Slow operation detected');
console.error('[ERROR] Failed to load calls', error);
```

**View logs:**
```bash
# Expo console
# Shows in terminal

# React Native debugger
# Chrome DevTools: chrome://inspect
```

### Database Debugging

```bash
# Connect to Supabase database
psql "postgresql://[user]@[host]:5432/[database]"

# Run queries directly
SELECT * FROM calls WHERE fraud_score > 70;
SELECT * FROM audit_logs WHERE action = 'call_listened' LIMIT 10;
```

---

## Git Workflow

### Branch Naming

```
feature/[name]        - New feature
bugfix/[name]         - Bug fix
docs/[name]           - Documentation
refactor/[name]       - Refactoring
test/[name]           - Tests
```

### Commit Messages

```
feat(auth): add two-factor authentication
fix(calls): prevent duplicate transcription jobs
docs(security): update encryption guidelines
refactor(api): simplify error handling
test(fraud): add keyword detection tests
```

### Pull Request Process

1. Create feature branch
2. Make changes (with tests)
3. Push to GitHub
4. Create PR with description
5. Wait for review & CI tests
6. Merge once approved

---

## Continuous Integration/Deployment

### GitHub Actions

**Test on PR:**
```yaml
# .github/workflows/test.yml
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
      - run: npm run lint
```

**Deploy to staging:**
```bash
# Automatic on PR approval
# Deploy to staging environment
```

**Deploy to production:**
```bash
# Manual trigger
# Deploy to production environment
# Requires approval
```

---

## Performance Optimization

### Frontend

```typescript
// Memoize expensive components
const CallCard = React.memo(({ call }) => {
  return <View>...</View>;
}, (prevProps, nextProps) => {
  return prevProps.call.id === nextProps.call.id;
});

// Lazy load screens
const CallDetailScreen = lazy(() => 
  import('./screens/CallDetailScreen')
);

// Use FlatList for large lists
<FlatList
  data={calls}
  renderItem={({ item }) => <CallCard call={item} />}
  keyExtractor={(call) => call.id}
  initialNumToRender={10}
  maxToRenderPerBatch={5}
/>
```

### Backend

```typescript
// Use database indexes
CREATE INDEX idx_calls_profile_fraud 
  ON calls(profile_id) WHERE is_fraud = true;

// Pagination for list endpoints
const limit = Math.min(req.query.limit, 100);
const offset = req.query.offset || 0;

// Connection pooling
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000
});
```

---

## Deployment

See `deployment.md` for full deployment guide.

Quick start:
```bash
# Deploy backend to Railway
git push origin main
# Railway auto-deploys

# Deploy frontend to Expo
eas build --platform ios
eas build --platform android
eas submit --platform ios
eas submit --platform android
```

---

## Troubleshooting

See `troubleshooting.md` for common issues and solutions.
