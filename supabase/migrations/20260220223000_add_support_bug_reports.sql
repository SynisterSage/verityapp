-- ==========================================================================
-- MIGRATION: Add support_bug_reports table for structured bug intake
-- ==========================================================================

CREATE TABLE IF NOT EXISTS support_bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_role TEXT NOT NULL DEFAULT 'member',
  topic TEXT NOT NULL,
  details TEXT NOT NULL,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_bug_reports_profile_idx
  ON support_bug_reports (profile_id);
CREATE INDEX IF NOT EXISTS support_bug_reports_status_idx
  ON support_bug_reports (status);
CREATE INDEX IF NOT EXISTS support_bug_reports_created_at_idx
  ON support_bug_reports (created_at DESC);

ALTER TABLE support_bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_bug_reports_read ON support_bug_reports
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = support_bug_reports.profile_id
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

CREATE POLICY support_bug_reports_insert ON support_bug_reports
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      reporter_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = profile_id
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

CREATE POLICY support_bug_reports_update ON support_bug_reports
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY support_bug_reports_delete ON support_bug_reports
  FOR DELETE
  USING (auth.role() = 'service_role');
