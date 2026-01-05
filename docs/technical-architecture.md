# Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  React Native App (iOS/Android) via Expo                        │
│  - Authentication screens                                       │
│  - Greeting recording interface                                 │
│  - Call history dashboard                                       │
│  - Settings & preferences                                       │
│  - Real-time notifications                                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ HTTPS / WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER                                │
│  Node.js + Express on Railway (TypeScript)                      │
│  - REST endpoints (/auth, /profiles, /calls, /alerts)           │
│  - Twilio webhooks (/webhook/twilio/*)                          │
│  - Background jobs (transcription, fraud detection)             │
│  - Email service (SendGrid)                                     │
└──────┬───────────────────────────┬──────────────┬───────────────┘
       │                           │              │
       ▼                           ▼              ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  SUPABASE        │  │     TWILIO       │  │     AZURE        │
│  - PostgreSQL    │  │  - Call routing  │  │  - Speech-to-    │
│  - Auth          │  │  - Recording     │  │    Text          │
│  - Realtime      │  │  - Voicemail     │  │  - Transcription │
│  - Storage       │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ TELEPHONE NETWORK│
                    │  - Grandma's     │
                    │    Landline      │
                    └──────────────────┘
```

## Data Flow

### Incoming Call Processing

```
1. CALL RECEIVED
   Grandma's Landline → Call Forwarding → Twilio Virtual Number

2. TWILIO PROCESSES
   Twilio receives call
   ├─ POST /webhook/twilio/call-incoming
   ├─ Backend creates call record (status: "incoming")
   ├─ Fetch greeting audio from Supabase Storage
   ├─ TwiML response: play greeting + record message

3. GREETING PLAYS
   Scammer hears: "Hello, you've reached [Grandma]. Please leave a message."

4. MESSAGE RECORDED
   Scammer leaves message
   ├─ Twilio records audio
   ├─ POST /webhook/twilio/recording-ready

5. TRANSCRIPTION
   Backend receives recording
   ├─ Download from Twilio
   ├─ Upload to Azure Speech-to-Text API
   ├─ Wait for transcription (~3-5 seconds)

6. FRAUD ANALYSIS
   Backend analyzes transcript
   ├─ Scan for fraud keywords
   ├─ Check blocked numbers
   ├─ Calculate fraud_score (0-100)
   ├─ Update call record in Supabase

7. ALERT GENERATION
   If fraud detected (score > 70)
   ├─ Create alert record
   ├─ Send email via SendGrid
   ├─ Broadcast via Supabase Realtime (WebSocket)

8. FAMILY NOTIFICATION
   Caretaker's app receives update
   ├─ Realtime subscription triggers
   ├─ New call appears on dashboard
   ├─ Notification badge appears
   ├─ Sound/vibration alert (if enabled)

9. FAMILY ACTION
   Caretaker reviews call
   ├─ Listens to recording
   ├─ Reads transcript
   ├─ Confirms fraud or marks false alarm
   ├─ Blocks caller if needed
```

## Component Architecture

### Frontend (React Native)

```
src/
├── screens/
│   ├── auth/
│   │   ├── LoginScreen.tsx
│   │   ├── SignupScreen.tsx
│   │   └── ForgotPasswordScreen.tsx
│   ├── onboarding/
│   │   ├── ProfileSetupScreen.tsx
│   │   ├── GreetingRecordingScreen.tsx
│   │   ├── KeywordSetupScreen.tsx
│   │   └── ActivationCodeScreen.tsx
│   ├── dashboard/
│   │   ├── HomeScreen.tsx
│   │   ├── CallHistoryScreen.tsx
│   │   ├── CallDetailScreen.tsx
│   │   └── StatsScreen.tsx
│   └── settings/
│       ├── SettingsScreen.tsx
│       ├── AlertPreferencesScreen.tsx
│       └── BlockedNumbersScreen.tsx
├── components/
│   ├── CallCard.tsx
│   ├── RecordingButton.tsx
│   ├── AlertBanner.tsx
│   ├── TranscriptViewer.tsx
│   └── RiskBadge.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useCallsSubscription.ts
│   ├── useRecording.ts
│   └── useFraudDetection.ts
├── services/
│   ├── api.ts (REST client)
│   ├── supabase.ts (Supabase client)
│   ├── audio.ts (recording/playback)
│   └── notifications.ts (push/local)
├── types/
│   ├── user.ts
│   ├── call.ts
│   ├── alert.ts
│   └── index.ts
├── context/
│   ├── AuthContext.tsx
│   └── CallsContext.tsx
└── App.tsx (navigation, auth flow)
```

### Backend (Node.js)

```
src/
├── routes/
│   ├── auth.ts
│   ├── profiles.ts
│   ├── calls.ts
│   ├── alerts.ts
│   ├── settings.ts
│   └── webhooks/
│       └── twilio.ts
├── controllers/
│   ├── authController.ts
│   ├── profileController.ts
│   ├── callController.ts
│   ├── alertController.ts
│   └── settingsController.ts
├── services/
│   ├── twilio.ts (Twilio integration)
│   ├── azure.ts (Speech-to-Text)
│   ├── supabase.ts (Database)
│   ├── sendgrid.ts (Email)
│   ├── fraud.ts (Fraud detection)
│   └── recording.ts (Audio handling)
├── middleware/
│   ├── auth.ts (JWT verification)
│   ├── validation.ts (Request validation)
│   ├── errorHandler.ts
│   └── logging.ts
├── jobs/
│   ├── transcriptionJob.ts
│   ├── fraudAnalysisJob.ts
│   └── alertJob.ts
├── types/
│   ├── index.ts
│   └── database.ts
├── config/
│   ├── constants.ts
│   ├── env.ts
│   └── twilio.ts
└── app.ts (Express app setup)
```

## Technology Stack Details

### Frontend: React Native + Expo

**Why:**
- Single codebase for iOS & Android
- Rapid development & testing
- Instant reload during development
- Easy to test on physical devices & simulators
- Expo handles most native setup

**Key Libraries:**
```json
{
  "react-native": "latest",
  "expo": "latest",
  "@react-navigation/native": "for navigation",
  "supabase-js": "for Supabase client",
  "axios": "for HTTP requests",
  "react-hook-form": "for form handling",
  "zustand": "for state management",
  "react-native-sound": "for audio playback",
  "react-native-recorder": "for audio recording"
}
```

### Backend: Node.js + Express

**Why:**
- TypeScript for type safety
- Fast development cycle
- Excellent ecosystem (Twilio, Supabase, Azure SDKs)
- Easy to host on Railway

**Key Libraries:**
```json
{
  "express": "for REST API",
  "typescript": "for type safety",
  "twilio": "for Twilio integration",
  "@azure/cognitiveservices-speech": "for transcription",
  "@supabase/supabase-js": "for database",
  "sendgrid": "for email",
  "jsonwebtoken": "for auth",
  "dotenv": "for environment variables",
  "cors": "for cross-origin requests"
}
```

### Database: Supabase (PostgreSQL)

**Why:**
- PostgreSQL reliability
- Real-time subscriptions (WebSocket)
- Built-in authentication
- File storage (Supabase Storage)
- Easy to migrate/scale
- Free tier generous for MVP

**Key Features:**
- Row-level security (RLS) for multi-user safety
- Real-time database subscriptions
- Automatic backups
- REST API built-in

### Phone: Twilio

**Why:**
- Industry standard for call handling
- Reliable call routing
- Built-in recording
- Webhook support
- Global coverage
- Pay-as-you-go (no upfront cost)

**Cost Estimate:**
- ~$0.01-0.02 per incoming call
- MVP (100 calls/month): ~$1-2
- Scale (10k calls/month): ~$100-200

### Speech-to-Text: Azure

**Why:**
- Free tier: 5 hours/month (plenty for MVP)
- Excellent accuracy
- Real-time & batch processing
- Easy integration
- Clear upgrade path to paid

**Free Tier Limits:**
- 5 concurrent requests
- 5 audio hours per month
- No SLA

### Email: SendGrid

**Why:**
- Free tier: 100 emails/day
- Excellent deliverability
- Easy integration
- Good for transactional emails

## Hosting & Deployment

### Frontend: Expo
- **Build:** `expo build:ios` / `expo build:android`
- **Deploy:** Apple App Store & Google Play Store
- **Distribution:** Direct via Expo Go app (for MVP testing)

### Backend: Railway
- **Deploy:** Push to GitHub, Railway auto-deploys
- **Database:** Supabase (hosted separately)
- **Environment:** Node.js 18+
- **Cost:** ~$5-10/month for small server

### Database: Supabase (Managed)
- **Hosted:** Supabase cloud
- **Backups:** Automatic daily backups
- **Scalability:** Automatic scaling on paid tier

## Security Considerations

See `security.md` for comprehensive security documentation.

**Key Points:**
- All API calls over HTTPS
- JWT tokens for authentication
- Supabase RLS for data isolation
- Encrypted recording storage
- PII handling (phone numbers, voice data)
- HIPAA/FERPA considerations (future)

## Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Call receipt to greeting play** | <2 seconds | User experience |
| **Transcription latency** | <10 seconds | Fraud detection speed |
| **Alert delivery** | <5 seconds | Real-time notifications |
| **Dashboard load time** | <2 seconds | Mobile responsiveness |
| **API response time** | <500ms | Smooth UX |

## Scalability Path

**MVP (Week 1-5):** Single server, one database
- Handles ~1000 concurrent users
- ~10k calls/month

**Phase 2 (Months 2-3):** Load balancing
- Multiple backend instances
- Dedicated transcription workers
- CDN for media files

**Phase 3 (Months 4+):** Enterprise scale
- Auto-scaling backend
- Distributed transcription (multi-region)
- Advanced fraud ML model
- Dedicated customer support
