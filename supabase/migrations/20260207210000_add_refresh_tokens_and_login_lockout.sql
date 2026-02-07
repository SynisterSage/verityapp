-- ============================================================================
-- MIGRATION: Add Refresh Token Management & Account Lockout
-- ============================================================================
--
-- FEATURES:
-- 1. Track issued refresh tokens for rotation and revocation
-- 2. Account lockout after 5 failed login attempts for 15 minutes
-- 3. One-time use refresh tokens (invalidated after use)
--
-- SAFETY:
-- ✅ Idempotent: Uses IF NOT EXISTS
-- ✅ Backward compatible: Only adds new fields/table
-- ✅ Can rollback: Drop table if needed
--
-- ============================================================================

-- 1. Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, -- Hash of actual token sent to client
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- 2. Add login attempt tracking to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'login_attempts') THEN
    ALTER TABLE profiles ADD COLUMN login_attempts INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'locked_until') THEN
    ALTER TABLE profiles ADD COLUMN locked_until TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_failed_login_at') THEN
    ALTER TABLE profiles ADD COLUMN last_failed_login_at TIMESTAMPTZ;
  END IF;
END $$;

-- Enable RLS on refresh_tokens table
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Only users can see their own refresh tokens
DROP POLICY IF EXISTS refresh_tokens_read ON refresh_tokens;
CREATE POLICY refresh_tokens_read ON refresh_tokens
  FOR SELECT
  USING (user_id = auth.uid());

-- Only service role can manage (backend only)
DROP POLICY IF EXISTS refresh_tokens_manage ON refresh_tokens;
CREATE POLICY refresh_tokens_manage ON refresh_tokens
  FOR ALL
  USING (false); -- No direct user access

-- 3. Add index for account lockout queries
CREATE INDEX IF NOT EXISTS idx_profiles_locked_until ON profiles(locked_until);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
--
-- What was added:
-- 1. refresh_tokens table with token tracking
-- 2. login_attempts, locked_until, last_failed_login_at to profiles
--
-- How to use:
-- - POST /auth/refresh-token: Validates refresh token, returns new pair
-- - POST /auth/login: Tracks attempts, locks after 5 failures for 15 min
-- - Refresh tokens: 7-day expiration, one-time use, can be revoked
--
-- ============================================================================
