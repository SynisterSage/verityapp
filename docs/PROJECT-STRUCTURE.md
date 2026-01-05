# SafeCall - Complete Project Documentation

## 📋 Documentation Index

All documentation files have been created in the `docs/` directory:

### 1. **app-overview.md**
   - Problem statement & solution overview
   - Key features & target users
   - Business model
   - Success metrics & timeline

### 2. **technical-architecture.md**
   - System architecture diagram
   - Data flow for incoming calls
   - Component architecture (frontend & backend)
   - Technology stack details
   - Hosting & deployment strategy
   - Performance targets
   - Scalability roadmap

### 3. **database-schema.md**
   - Detailed table schemas (8 tables)
   - SQL definitions with constraints
   - Row-level security (RLS) policies
   - Useful views for analytics
   - Migration strategy
   - Data retention policies
   - Performance optimization indexes

### 4. **api-specification.md**
   - Complete REST API documentation
   - 30+ endpoints with examples
   - Authentication & authorization
   - Error handling
   - Rate limiting
   - Twilio webhooks specification
   - Real-time subscriptions (Supabase Realtime)
   - Request/response examples

### 5. **security.md**
   - Data classification & handling
   - Authentication (JWT, Supabase Auth)
   - Role-based access control (RBAC)
   - Data encryption (in transit & at rest)
   - API security (CORS, rate limiting, CSRF)
   - Audit logging
   - Compliance (GDPR, HIPAA, CCPA)
   - Vulnerability management
   - Incident response plan
   - Security checklist (25+ items)

### 6. **fraud-detection.md**
   - Fraud scoring algorithm
   - 40+ default fraud keywords
   - Fraud detection service implementation
   - Custom keyword management
   - Testing strategies
   - Machine learning roadmap (Phase 2)
   - Monitoring & metrics
   - Edge case handling

### 7. **setup-guide.md**
   - Development environment setup
   - Backend configuration (Node.js + Express)
   - Frontend configuration (React Native + Expo)
   - Database setup (Supabase)
   - Twilio setup
   - Azure setup
   - Testing call flow locally
   - Code style & standards
   - Debugging techniques
   - Git workflow

---

## 🚀 Quick Start Summary

### Tech Stack
```
Frontend:    React Native + Expo (TypeScript)
Backend:     Node.js + Express on Railway (TypeScript)
Database:    Supabase PostgreSQL
Phone:       Twilio
Speech-to-Text: Azure (free tier)
Email:       Resend
Real-time:   Supabase Realtime (WebSocket)
Auth:        Supabase Auth (JWT)
Storage:     Supabase Storage (recordings)
```

### Architecture Overview
```
Elderly Person's Landline
    ↓
Call Forwarding to Twilio
    ↓
Your Backend (Node.js)
    ├─ Record voicemail
    ├─ Transcribe (Azure)
    ├─ Analyze for fraud
    ├─ Store in Supabase
    └─ Alert family (Email)
    ↓
Family Dashboard (React Native)
    ├─ Real-time call updates
    ├─ Listen to recordings
    ├─ Read transcripts
    ├─ Block callers
    └─ Review fraud analysis
```

### Key Features (MVP)
✅ Custom voicemail greeting (recorded by caretaker)
✅ All calls automatically intercepted & recorded
✅ Real-time transcription (Azure Speech-to-Text)
✅ Fraud keyword detection (40+ keywords)
✅ Real-time alerts to family (email)
✅ Call history with full transcripts
✅ Audio playback with transcript viewer
✅ Block caller functionality
✅ Multi-family member access
✅ Settings for fraud keywords & thresholds

---

## 📊 Data Flow Example

### Incoming Scam Call
```
1. Scammer calls grandma's landline: +1-555-1234567
2. Landline auto-forwards to Twilio: +1-555-6789012
3. Twilio receives call, hits webhook: POST /webhook/twilio/call-incoming
4. Backend:
   - Creates call record in database
   - Fetches greeting audio: "Hello, you've reached Margaret..."
   - Tells Twilio to play greeting & record message
5. Scammer hears greeting, leaves message: "This is your bank..."
6. Twilio stops recording, hits webhook: POST /webhook/twilio/recording-ready
7. Backend:
   - Downloads recording from Twilio
   - Uploads to Azure Speech-to-Text API
   - Gets transcript: "Hello, this is your bank..."
   - Detects fraud keywords: "bank" (8), "verify" (16), "account" (12), "social security" (18)
   - Calculates fraud_score = 92/100 (HIGH RISK)
8. Backend creates alert: "⚠️ FRAUD ALERT - Suspicious call to Margaret Smith"
9. Sends email to caretaker + broadcasts via WebSocket
10. Caretaker's phone app sees new call instantly with:
    - 🔴 FRAUD badge
    - Transcript preview
    - "Listen", "Block", "Report" buttons
11. Caretaker listens to recording, confirms it's fraud
12. Taps "Block Caller" → +1-555-9876543 added to blocked list
13. Next time this number calls, Twilio hangs up immediately
```

---

## 📁 Project Structure

```
safecall/
├── frontend/                    # React Native + Expo app
│   ├── src/
│   │   ├── screens/            # All UI screens
│   │   ├── components/         # Reusable UI components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── services/           # API clients, audio, etc
│   │   ├── types/              # TypeScript interfaces
│   │   └── App.tsx             # Root component
│   └── app.json               # Expo configuration
│
├── backend/                     # Node.js + Express API
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── controllers/       # Route handlers
│   │   ├── services/          # Business logic (Twilio, Azure, fraud)
│   │   ├── middleware/        # Auth, validation, error handling
│   │   ├── jobs/              # Background tasks
│   │   ├── types/             # TypeScript types
│   │   ├── config/            # Configuration
│   │   └── app.ts             # Express setup
│   └── tests/                 # Unit & integration tests
│
├── docs/                        # Documentation (THIS FOLDER)
│   ├── app-overview.md
│   ├── technical-architecture.md
│   ├── database-schema.md
│   ├── api-specification.md
│   ├── security.md
│   ├── fraud-detection.md
│   ├── setup-guide.md
│   └── PROJECT-STRUCTURE.md    (this file)
│
├── .github/
│   ├── workflows/
│   │   ├── test.yml           # Run tests on PR
│   │   ├── deploy-staging.yml # Deploy to staging
│   │   └── deploy-prod.yml    # Deploy to production
│
├── README.md                    # Project overview
└── LICENSE                      # MIT License
```

---

## 🗄️ Database Schema (8 Tables)

```
users
├─ id (UUID)
├─ email (unique)
├─ password_hash
├─ name, phone
├─ user_type ('caretaker' | 'elder' | 'admin')
└─ created_at

profiles (Elderly people being protected)
├─ id (UUID)
├─ caretaker_id → users.id
├─ elder_id → users.id (nullable)
├─ first_name, last_name, phone_number
├─ twilio_virtual_number
├─ greeting_audio_url
├─ alert_threshold_score (0-100)
└─ created_at

calls (All incoming calls)
├─ id (UUID)
├─ profile_id → profiles.id
├─ caller_id (phone number)
├─ recording_url
├─ transcript
├─ fraud_score (0-100)
├─ fraud_keywords_detected (array)
├─ is_fraud (boolean)
├─ status ('new' | 'reviewed' | 'marked_fraud' | 'marked_safe')
└─ created_at

alerts (Notifications sent to caretakers)
├─ id (UUID)
├─ call_id → calls.id
├─ caretaker_id → users.id
├─ alert_type ('email' | 'sms' | 'push')
├─ status ('pending' | 'sent' | 'delivered' | 'read')
└─ created_at

blocked_numbers
├─ id (UUID)
├─ profile_id → profiles.id
├─ phone_number
├─ block_reason ('fraud' | 'spam' | 'harassment')
└─ blocked_at

fraud_keywords
├─ id (UUID)
├─ profile_id → profiles.id
├─ keyword (string)
├─ severity_weight (0-20)
├─ is_active (boolean)
└─ source ('default' | 'custom')

family_members (Multi-user access control)
├─ id (UUID)
├─ profile_id → profiles.id
├─ user_id → users.id
├─ role ('admin' | 'editor' | 'viewer')
└─ permissions (detailed access control)

audit_logs (Compliance & security)
├─ id (UUID)
├─ action (string)
├─ entity_type (string)
├─ user_id → users.id
├─ details (JSONB)
└─ created_at
```

---

## 🔌 API Endpoints (30+)

### Authentication (6 endpoints)
```
POST   /auth/signup
POST   /auth/login
POST   /auth/refresh-token
POST   /auth/logout
POST   /auth/forgot-password
POST   /auth/reset-password
```

### Profiles (6 endpoints)
```
POST   /profiles                      # Create new profile
GET    /profiles                      # List all profiles
GET    /profiles/:profileId           # Get single profile
PUT    /profiles/:profileId           # Update settings
DELETE /profiles/:profileId           # Delete profile
POST   /profiles/:profileId/activate  # Confirm phone forwarding
```

### Calls (7 endpoints)
```
GET    /calls?profile_id=...          # List calls for profile
GET    /calls/:callId                 # Get call details
PUT    /calls/:callId/mark-fraud      # Mark as confirmed fraud
PUT    /calls/:callId/mark-safe       # Mark as false alarm
DELETE /calls/:callId                 # Delete recording
POST   /calls/:callId/block-caller    # Block caller
GET    /calls/export                  # Export call history
```

### Alerts (2 endpoints)
```
GET    /alerts                        # List alerts for user
PUT    /alerts/:alertId/read          # Mark alert as read
```

### Settings (3 endpoints)
```
GET    /settings                      # Get user settings
PUT    /settings                      # Update settings
PUT    /profiles/:profileId/fraud-keywords  # Update keywords
```

### Twilio Webhooks (2 endpoints - called by Twilio)
```
POST   /webhook/twilio/call-incoming       # Incoming call received
POST   /webhook/twilio/recording-ready    # Voicemail ready
```

---

## 🔒 Security Highlights

### Authentication & Authorization
- JWT tokens (Supabase Auth)
- Role-based access control (RBAC)
- Row-level security (RLS) in database
- Multi-family member access with role restrictions

### Data Protection
- HTTPS/TLS 1.3 encryption (in transit)
- AES-256 encryption (at rest)
- PII handling with care
- Voice data encrypted in Supabase Storage
- Automatic cleanup after retention period

### Compliance
- GDPR compliant (data export, deletion, portability)
- CCPA ready (privacy controls)
- HIPAA-eligible (future enhancement)
- SOC 2 certified services (Twilio, Azure, Supabase)

### Audit & Monitoring
- All sensitive actions logged
- 7-year audit log retention
- Automated alerts on suspicious patterns
- Incident response plan documented

---

## 💰 Cost Estimation (MVP)

### Monthly Costs
```
Twilio:           ~$5-10   (100-1000 calls)
Azure:            ~$0      (free tier: 5 hours/month)
Resend:           ~$0      (sandbox senders available)
Supabase:         ~$0      (free tier starter)
Railway:          ~$5-10   (small server)
Total:            ~$10-20/month
```

### Scaling Costs
```
1000 calls/month:  ~$50-100/month
10k calls/month:   ~$100-200/month
100k calls/month:  ~$500-1000/month
```

---

## 📅 Development Timeline

### Phase 1: MVP (Weeks 1-5)
- Week 1-2: Backend setup, Twilio integration, database
- Week 3: Frontend (React Native), greeting recording
- Week 4: Azure transcription, fraud detection
- Week 5: Testing, bug fixes, launch

### Phase 2: Enhancements (Months 2-3)
- Multi-family member support
- SMS alerts
- Advanced fraud detection (ML model)
- Call history export (PDF)
- Community reporting

### Phase 3: Enterprise (Months 4+)
- Assisted living facility bundle
- Advanced analytics
- API for third-party integrations
- White-label solution
- Professional support

---

## 🧪 Testing Strategy

### Unit Tests
- Fraud detection algorithm
- Input validation
- Transcription service
- Email sending

### Integration Tests
- End-to-end call flow
- Database operations
- API endpoints
- Twilio webhook handling

### E2E Tests
- Mobile app UI flows
- Call recording & playback
- Real Twilio calls (staging environment)

### Performance Tests
- API response times
- Database query optimization
- Real-time update latency
- Memory usage on mobile

---

## 📈 Success Metrics

### User Metrics
- 100+ app installs (MVP launch)
- 50+ active users (2 weeks)
- 1000+ calls intercepted (1 month)
- 10+ scams prevented (confirmed by users)

### Technical Metrics
- 99% uptime (backend)
- <2s greeting play latency
- <10s transcription latency
- <5s email delivery
- <500ms API response time

### Business Metrics
- 4.5/5 star rating
- $0 customer acquisition cost (grassroots)
- 20% month-over-month growth
- $0 churn rate (free MVP)

---

## 🚀 Getting Started

### For Backend Development
1. See `setup-guide.md` → "Backend Setup"
2. Clone repo, install dependencies
3. Set up Supabase project
4. Configure Twilio account
5. Run `npm run dev`

### For Frontend Development
1. See `setup-guide.md` → "Frontend Setup"
2. Install Expo CLI
3. Configure environment variables
4. Run `npm start`
5. Launch iOS simulator or Android emulator

### For Database
1. See `database-schema.md`
2. Create Supabase project
3. Run migrations
4. Seed default fraud keywords

### For API Testing
1. See `api-specification.md`
2. Use Postman or curl
3. Test with mock data
4. Verify Twilio webhooks

---

## 🆘 Support & Questions

### Common Questions

**Q: Will this work with older phones?**
A: Yes! Elderly people keep their existing landline/phone. Our system works with any phone that supports call forwarding.

**Q: What about HIPAA compliance?**
A: MVP is HIPAA-eligible but not certified. Can be enabled in Phase 2 with additional configuration.

**Q: How do we handle privacy?**
A: See `security.md` for detailed privacy & data handling policies. All recordings encrypted, retention policies enforced, audit logging enabled.

**Q: What if the family doesn't want to use the app?**
A: Caretaker can still receive email alerts without opening the app. Alerts include call summary & transcript.

**Q: Can we add SMS alerts?**
A: Yes, in Phase 2. Currently using email (free), SMS requires small cost per message.

**Q: How do we handle false positives?**
A: Caretaker can mark calls as "false alarm" → helps improve fraud detection. See `fraud-detection.md` for feedback loop.

### Where to Look

- **Setup issues?** → `setup-guide.md`
- **API questions?** → `api-specification.md`
- **Database schema?** → `database-schema.md`
- **Security concerns?** → `security.md`
- **Fraud detection logic?** → `fraud-detection.md`
- **Architecture overview?** → `technical-architecture.md`
- **Project scope?** → `app-overview.md`

---

## 📝 File Checklist

Created documentation files:
- ✅ `docs/app-overview.md` (2,500 words)
- ✅ `docs/technical-architecture.md` (3,000 words)
- ✅ `docs/database-schema.md` (3,500 words)
- ✅ `docs/api-specification.md` (4,000 words)
- ✅ `docs/security.md` (4,000 words)
- ✅ `docs/fraud-detection.md` (3,000 words)
- ✅ `docs/setup-guide.md` (4,000 words)
- ✅ `docs/PROJECT-STRUCTURE.md` (this file - 2,000 words)

**Total Documentation: ~25,000 words**

---

## 🎯 Next Steps

1. **Create GitHub Repository**
   - Initialize with Node.js backend template
   - Set up React Native/Expo frontend template
   - Create directory structure per `setup-guide.md`

2. **Set Up Services**
   - Supabase project (PostgreSQL database)
   - Twilio account (virtual phone number)
   - Azure Speech-to-Text (API key)
  - Resend account (email service)

3. **Start Backend Development**
   - Express app setup
   - Supabase client initialization
   - Twilio integration
   - API endpoints implementation

4. **Start Frontend Development**
   - React Native app scaffolding
   - Authentication screens
   - Dashboard UI
   - Real-time subscriptions

5. **Integration & Testing**
   - End-to-end testing
   - Twilio webhook simulation
   - Fraud detection testing
   - Performance optimization

6. **Deployment**
   - Deploy backend to Railway
   - Build mobile apps (iOS/Android)
   - Submit to App Stores
   - Launch MVP

---

## 📚 Documentation Complete

All aspects of SafeCall have been documented:
- ✅ Product overview & business model
- ✅ Complete technical architecture
- ✅ Database design with RLS
- ✅ Full API specification (30+ endpoints)
- ✅ Security & compliance strategy
- ✅ Fraud detection algorithm
- ✅ Development setup guide
- ✅ Project structure guide

**You're ready to build!** 🚀

Start with `setup-guide.md` to set up your development environment.

---

*Last updated: January 4, 2026*
*SafeCall MVP - Protecting elderly from phone scams*
