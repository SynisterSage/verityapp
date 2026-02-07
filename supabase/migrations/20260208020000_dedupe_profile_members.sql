-- ============================================================================
-- MIGRATION: Remove duplicate profile_members rows per user and profile
-- ============================================================================
-- Deduplicate rows so that each (profile_id, user_id) pair appears once, which
-- is required before adding a uniqueness constraint and keeps the caretaker row
-- from duplicating in the API response.
WITH ranked AS (
  SELECT
    id,
    profile_id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY profile_id, user_id
      ORDER BY COALESCE(created_at, '1970-01-01'::timestamp), id
    ) AS rn
  FROM profile_members
)
DELETE FROM profile_members
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_members_profile_user_unique
  ON profile_members (profile_id, user_id);
