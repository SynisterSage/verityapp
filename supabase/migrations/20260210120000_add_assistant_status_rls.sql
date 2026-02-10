-- =====================================================================
-- MIGRATION: Protect assistant status with row level security
-- =====================================================================

ALTER TABLE assistant_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service-role-only" ON assistant_status
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
