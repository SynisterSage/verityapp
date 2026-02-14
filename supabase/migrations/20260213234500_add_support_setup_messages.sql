-- ==========================================================================
-- MIGRATION: Add support_setup_messages for users without profiles
-- ==========================================================================

CREATE TABLE IF NOT EXISTS support_setup_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_snapshot TEXT,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'agent')),
  content TEXT NOT NULL,
  category TEXT,
  metadata JSONB,
  is_read_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  is_read_by_agent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_setup_messages_user_idx ON support_setup_messages (user_id);
CREATE INDEX IF NOT EXISTS support_setup_messages_created_at_idx ON support_setup_messages (created_at);

ALTER TABLE support_setup_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_setup_messages_read ON support_setup_messages
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  );

CREATE POLICY support_setup_messages_insert ON support_setup_messages
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (sender = 'user' AND user_id = auth.uid())
  );

CREATE POLICY support_setup_messages_update ON support_setup_messages
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
  );

CREATE POLICY support_setup_messages_delete ON support_setup_messages
  FOR DELETE
  USING (
    auth.role() = 'service_role'
  );
