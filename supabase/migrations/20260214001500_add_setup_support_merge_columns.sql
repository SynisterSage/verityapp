-- ==========================================================================
-- MIGRATION: Track pre-profile support merge state
-- ==========================================================================

ALTER TABLE support_setup_messages
  ADD COLUMN IF NOT EXISTS merged_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE support_setup_messages
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS support_setup_messages_unmerged_idx
  ON support_setup_messages (user_id, created_at)
  WHERE merged_profile_id IS NULL;
