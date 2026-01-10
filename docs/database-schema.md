# Database Schema & Data Model

## Tables Overview

```sql
-- Core tables
users (authentication & profiles)
profiles (elderly people being protected)
calls (incoming calls)
alerts (notifications to caretakers)
blocked_numbers (spam list)
fraud_keywords (configurable detection)
family_members (multi-user access)
audit_logs (compliance & debugging)
```

## Detailed Schema

### 1. users (Authentication & Account Management)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,  -- Supabase Auth handles this
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  user_type VARCHAR(50) NOT NULL,  -- 'caretaker' | 'elder' | 'admin'
  avatar_url TEXT,  -- Supabase Storage URL
  
  -- Profile info
  date_of_birth DATE,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  
  -- Account status
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  account_created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  
  -- Settings
  preferred_language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_user_type CHECK (user_type IN ('caretaker', 'elder', 'admin'))
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_user_type ON users(user_type);
CREATE INDEX idx_users_is_active ON users(is_active);
```

### 2. profiles (Elderly People Being Protected)

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caretaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  elder_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Can be NULL if elder not registered
  
  -- Identity
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  
  -- Twilio integration
  twilio_virtual_number VARCHAR(20),  -- +1555-XXXX-XXXX
  twilio_account_sid VARCHAR(255),
  activation_code VARCHAR(20) UNIQUE,  -- For phone forwarding setup
  is_activated BOOLEAN DEFAULT false,
  activation_code_expires_at TIMESTAMP,
  
  -- Greeting
  greeting_audio_url TEXT,  -- Supabase Storage URL
  greeting_recorded_at TIMESTAMP,
  greeting_duration_seconds INT,  -- For storage optimization
  
  -- Settings
  alert_threshold_score INT DEFAULT 70,  -- Fraud score (0-100) above which to alert
  enable_email_alerts BOOLEAN DEFAULT true,
  enable_sms_alerts BOOLEAN DEFAULT false,
  enable_push_alerts BOOLEAN DEFAULT true,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_call_at TIMESTAMP,
  call_count INT DEFAULT 0,
  fraud_call_count INT DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT phone_format CHECK (phone_number ~ '^\+?[0-9]{10,}$')
);

-- Indexes
CREATE INDEX idx_profiles_caretaker_id ON profiles(caretaker_id);
CREATE INDEX idx_profiles_elder_id ON profiles(elder_id);
CREATE INDEX idx_profiles_twilio_number ON profiles(twilio_virtual_number);
CREATE INDEX idx_profiles_phone_number ON profiles(phone_number);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);
```

### 3. calls (All Incoming Calls)

```sql
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Call info from Twilio
  twilio_call_sid VARCHAR(255) UNIQUE,
  twilio_recording_sid VARCHAR(255),
  caller_id VARCHAR(20) NOT NULL,  -- Phone number of caller
  caller_name VARCHAR(255),  -- Reverse phone lookup (future feature)
  
  -- Call details
  call_received_at TIMESTAMP NOT NULL,
  call_duration_seconds INT DEFAULT 0,  -- Voicemail length
  
  -- Recording
  recording_url TEXT,  -- Supabase Storage URL
  recording_duration_seconds INT,
  recording_size_bytes INT,
  
  -- Transcription
  transcript TEXT,
  transcript_confidence FLOAT,  -- 0-1 accuracy score from Azure
  transcription_provider VARCHAR(50) DEFAULT 'azure',  -- For future multi-provider support
  transcribed_at TIMESTAMP,
  
  -- Fraud detection
  fraud_score INT DEFAULT 0,  -- 0-100 score
  fraud_keywords_detected TEXT[] DEFAULT ARRAY[]::TEXT[],  -- Array of matched keywords
  is_fraud BOOLEAN DEFAULT false,  -- Shorthand: fraud_score > threshold
  fraud_analysis_method VARCHAR(50) DEFAULT 'keyword',  -- 'keyword' | 'ml_model' (future)
  fraud_analysis_details JSONB,  -- Store detailed analysis results
  
  -- Status & tagging
  status VARCHAR(50) DEFAULT 'new',  -- 'new' | 'reviewed' | 'marked_fraud' | 'marked_safe' | 'blocked'
  risk_level VARCHAR(50) GENERATED ALWAYS AS (
    CASE 
      WHEN fraud_score >= 80 THEN 'critical'
      WHEN fraud_score >= 60 THEN 'high'
      WHEN fraud_score >= 40 THEN 'medium'
      ELSE 'low'
    END
  ) STORED,
  
  -- Caretaker actions
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  caretaker_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('new', 'reviewed', 'marked_fraud', 'marked_safe', 'blocked')),
  CONSTRAINT valid_fraud_score CHECK (fraud_score >= 0 AND fraud_score <= 100)
);

-- Indexes for fast queries
CREATE INDEX idx_calls_profile_id ON calls(profile_id);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_calls_fraud_score ON calls(fraud_score);
CREATE INDEX idx_calls_is_fraud ON calls(is_fraud);
CREATE INDEX idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX idx_calls_caller_id ON calls(caller_id);  -- For blocking lookups
```

### 4. alerts (Notifications to Caretakers)

```sql
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Recipient
  caretaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Alert details
  alert_type VARCHAR(50) NOT NULL,  -- 'email' | 'sms' | 'push'
  alert_title VARCHAR(255) NOT NULL,  -- "FRAUD ALERT - Suspicious call"
  alert_body TEXT NOT NULL,  -- Full message
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending' | 'sent' | 'delivered' | 'failed' | 'read'
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  
  -- Error tracking
  error_message TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  
  -- External IDs for tracking
  email_message_id VARCHAR(255),  -- Resend message ID (if available)
  sms_sid VARCHAR(255),  -- Twilio SMS SID
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_alert_type CHECK (alert_type IN ('email', 'sms', 'push')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read'))
);

-- Indexes
CREATE INDEX idx_alerts_caretaker_id ON alerts(caretaker_id);
CREATE INDEX idx_alerts_call_id ON alerts(call_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
```

### 5. blocked_numbers (Spam/Fraud Caller List)

```sql
CREATE TABLE blocked_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Block info
  phone_number VARCHAR(20) NOT NULL,
  block_reason VARCHAR(255),  -- 'fraud' | 'spam' | 'harassment' | 'other'
  
  -- Source
  blocked_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  source VARCHAR(50) DEFAULT 'manual',  -- 'manual' | 'auto' | 'community'
  
  -- Community blocking (future feature)
  is_shared_with_community BOOLEAN DEFAULT false,
  community_block_count INT DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  blocked_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT phone_format CHECK (phone_number ~ '^\+?[0-9]{10,}$'),
  CONSTRAINT valid_reason CHECK (block_reason IN ('fraud', 'spam', 'harassment', 'other', null))
);

-- Unique constraint: one block per number per profile
CREATE UNIQUE INDEX idx_blocked_numbers_profile_phone ON blocked_numbers(profile_id, phone_number) WHERE is_active = true;

-- Indexes
CREATE INDEX idx_blocked_numbers_profile_id ON blocked_numbers(profile_id);
CREATE INDEX idx_blocked_numbers_phone_number ON blocked_numbers(phone_number);
CREATE INDEX idx_blocked_numbers_is_active ON blocked_numbers(is_active);
```

### 6. fraud_keywords (Configurable Detection Rules)

```sql
CREATE TABLE fraud_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Keyword
  keyword VARCHAR(100) NOT NULL,
  keyword_category VARCHAR(50),  -- 'banking' | 'government' | 'tech_support' | 'other'
  
  -- Detection settings
  is_active BOOLEAN DEFAULT true,
  severity_weight INT DEFAULT 10,  -- 0-20, how much does this word contribute to fraud score
  
  -- Metadata
  source VARCHAR(50) DEFAULT 'custom',  -- 'default' | 'custom' | 'community'
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_category CHECK (keyword_category IN ('banking', 'government', 'tech_support', 'other', null)),
  CONSTRAINT valid_weight CHECK (severity_weight >= 0 AND severity_weight <= 20)
);

-- Indexes
CREATE INDEX idx_fraud_keywords_profile_id ON fraud_keywords(profile_id);
CREATE INDEX idx_fraud_keywords_is_active ON fraud_keywords(is_active);
CREATE INDEX idx_fraud_keywords_keyword ON fraud_keywords(keyword);
```

### 7. family_members (Multi-User Access Control)

```sql
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Role-based access
  role VARCHAR(50) NOT NULL,  -- 'admin' | 'editor'
  
  -- Permissions
  can_view_calls BOOLEAN DEFAULT true,
  can_receive_alerts BOOLEAN DEFAULT true,
  can_block_callers BOOLEAN DEFAULT false,
  can_modify_settings BOOLEAN DEFAULT false,
  can_delete_recordings BOOLEAN DEFAULT false,
  
  -- Relationship
  relationship VARCHAR(50),  -- 'child' | 'spouse' | 'sibling' | 'nurse' | 'other'
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  invitation_sent_at TIMESTAMP,
  invitation_accepted_at TIMESTAMP,
  
  -- Metadata
  added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_role CHECK (role IN ('admin', 'editor')),
  CONSTRAINT valid_relationship CHECK (relationship IN ('child', 'spouse', 'sibling', 'nurse', 'caregiver', 'attorney', 'other', null))
);

-- Unique constraint: user can only have one role per profile
CREATE UNIQUE INDEX idx_family_members_profile_user ON family_members(profile_id, user_id) WHERE is_active = true;

-- Indexes
CREATE INDEX idx_family_members_profile_id ON family_members(profile_id);
CREATE INDEX idx_family_members_user_id ON family_members(user_id);
```

### 8. audit_logs (Compliance & Debugging)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Action info
  action VARCHAR(100) NOT NULL,  -- 'call_received' | 'call_transcribed' | 'alert_sent' | etc
  entity_type VARCHAR(50) NOT NULL,  -- 'call' | 'alert' | 'user' | 'profile'
  entity_id VARCHAR(255),  -- ID of affected resource
  
  -- User who triggered action
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Details
  details JSONB,  -- Flexible storage for action-specific data
  status VARCHAR(50),  -- 'success' | 'failure'
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(45),  -- IPv4 or IPv6
  user_agent TEXT
);

-- Indexes
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

## Views for Common Queries

```sql
-- Recent calls with fraud alerts
CREATE VIEW recent_fraud_calls AS
SELECT 
  c.id,
  c.profile_id,
  c.caller_id,
  c.transcript,
  c.fraud_score,
  c.created_at,
  p.first_name || ' ' || p.last_name as elder_name,
  COUNT(a.id) as alert_count
FROM calls c
JOIN profiles p ON c.profile_id = p.id
LEFT JOIN alerts a ON c.id = a.call_id
WHERE c.is_fraud = true
  AND c.created_at > NOW() - INTERVAL '7 days'
GROUP BY c.id, p.first_name, p.last_name
ORDER BY c.created_at DESC;

-- Caretaker dashboard stats
CREATE VIEW caretaker_dashboard_stats AS
SELECT 
  p.id as profile_id,
  p.first_name || ' ' || p.last_name as elder_name,
  COUNT(c.id) as total_calls,
  COUNT(CASE WHEN c.is_fraud = true THEN 1 END) as fraud_calls,
  COUNT(CASE WHEN a.id IS NOT NULL THEN 1 END) as unread_alerts,
  MAX(c.created_at) as last_call_at
FROM profiles p
LEFT JOIN calls c ON p.id = c.profile_id
LEFT JOIN alerts a ON c.id = a.call_id AND a.read_at IS NULL
GROUP BY p.id;
```

## Data Retention & Archiving

```
Call Recordings:
- Keep in Supabase Storage for 90 days
- Archive to cold storage (AWS S3 Glacier) after 90 days
- Delete after 2 years (compliant with legal holds)

Call Transcripts:
- Keep in database for 2 years
- Available for legal discovery
- Anonymize after 2 years

Audit Logs:
- Keep for 7 years (compliance requirement)
- Archive to cold storage after 1 year
- Regular backups (daily)
```

## Performance Optimization

```sql
-- Materialized view for analytics (refresh hourly)
CREATE MATERIALIZED VIEW fraud_analytics AS
SELECT 
  DATE(c.created_at) as date,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN c.is_fraud = true THEN 1 END) as fraud_count,
  AVG(c.fraud_score) as avg_fraud_score,
  COUNT(DISTINCT c.profile_id) as unique_elders
FROM calls c
GROUP BY DATE(c.created_at)
ORDER BY date DESC;

CREATE INDEX idx_fraud_analytics_date ON fraud_analytics(date);
```

## RLS (Row-Level Security) Policies

```sql
-- Users can only see their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_can_see_own_profile ON users
  FOR SELECT USING (auth.uid() = id);

-- Caretakers can see profiles they manage
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY caretakers_can_see_managed_profiles ON profiles
  FOR SELECT USING (
    caretaker_id = auth.uid() 
    OR auth.uid() IN (SELECT user_id FROM family_members WHERE profile_id = id AND is_active = true)
  );

-- Only caretakers/family can see calls for their profiles
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY family_can_see_calls ON calls
  FOR SELECT USING (
    auth.uid() IN (
      SELECT caretaker_id FROM profiles WHERE id = profile_id
      UNION
      SELECT user_id FROM family_members WHERE profile_id = profile_id AND is_active = true
    )
  );
```

## Migration Strategy

```bash
# Supabase migrations
supabase migration new init_schema
# Edit migration file with SQL above
supabase migration up

# Seed default data (fraud keywords)
INSERT INTO fraud_keywords (keyword, keyword_category, severity_weight, source) VALUES
('wire money', 'banking', 20, 'default'),
('confirm password', 'banking', 18, 'default'),
('verify account', 'banking', 16, 'default'),
('bank', 'banking', 8, 'default'),
('IRS', 'government', 20, 'default'),
('FBI', 'government', 20, 'default'),
('tax refund', 'government', 15, 'default'),
('social security', 'government', 18, 'default'),
('Microsoft', 'tech_support', 15, 'default'),
('Apple', 'tech_support', 15, 'default'),
...
```
