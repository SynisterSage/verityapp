-- =====================================================================
-- MIGRATION: Track assistant status for dev support console
-- =====================================================================

CREATE TABLE IF NOT EXISTS assistant_status (
  id TEXT PRIMARY KEY,
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE assistant_status IS 'Holds the current online/offline flag for the dev support persona.';

CREATE UNIQUE INDEX IF NOT EXISTS assistant_status_id_idx ON assistant_status (id);
