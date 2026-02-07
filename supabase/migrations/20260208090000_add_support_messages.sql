-- ==========================================================================
-- MIGRATION: Add support_messages table and RLS policies
-- ==========================================================================

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'agent')),
  content TEXT NOT NULL,
  category TEXT,
  metadata JSONB,
  is_read_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  is_read_by_agent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_messages_profile_idx ON support_messages (profile_id);
CREATE INDEX IF NOT EXISTS support_messages_created_at_idx ON support_messages (created_at);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_messages_read ON support_messages
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = support_messages.profile_id
        AND (
          p.caretaker_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profile_members pm
            WHERE pm.profile_id = p.id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY support_messages_insert ON support_messages
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      sender = 'user'
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = NEW.profile_id
          AND (
            p.caretaker_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM profile_members pm
              WHERE pm.profile_id = p.id
                AND pm.user_id = auth.uid()
            )
          )
      )
    )
  );

CREATE POLICY support_messages_update ON support_messages
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
  );

CREATE POLICY support_messages_delete ON support_messages
  FOR DELETE
  USING (
    auth.role() = 'service_role'
  );
