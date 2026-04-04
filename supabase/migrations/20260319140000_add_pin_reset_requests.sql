-- ===================================================================
-- MIGRATION: Add pin_reset_requests table and RLS policies
-- ===================================================================

CREATE TABLE IF NOT EXISTS pin_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name TEXT,
  requester_role TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'completed')) DEFAULT 'pending',
  message TEXT,
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  denied_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pin_reset_requests_profile_idx ON pin_reset_requests (profile_id);
CREATE INDEX IF NOT EXISTS pin_reset_requests_status_idx ON pin_reset_requests (status);
CREATE INDEX IF NOT EXISTS pin_reset_requests_expires_idx ON pin_reset_requests (expires_at);

ALTER TABLE pin_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY pin_reset_requests_read ON pin_reset_requests
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = pin_reset_requests.profile_id
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

CREATE POLICY pin_reset_requests_insert ON pin_reset_requests
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
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
  );

CREATE POLICY pin_reset_requests_update ON pin_reset_requests
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
  );

CREATE POLICY pin_reset_requests_delete ON pin_reset_requests
  FOR DELETE
  USING (
    auth.role() = 'service_role'
  );

CREATE OR REPLACE FUNCTION public.pin_reset_requests_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pin_reset_requests_updated_at ON pin_reset_requests;
CREATE TRIGGER set_pin_reset_requests_updated_at
  BEFORE UPDATE ON pin_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.pin_reset_requests_set_updated_at();
