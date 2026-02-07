-- ============================================================================
-- HOTFIX: Ensure caretaker_id is populated in all tables
-- ============================================================================
--
-- PURPOSE: Migration 20260207230000 may not have populated caretaker_id if
-- it ran before all the UPDATE statements completed or if there were locks.
-- This ensures all rows have caretaker_id set.
--
-- ============================================================================

-- Ensure caretaker_id is NOT NULL in calls
UPDATE calls c
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE c.profile_id = p.id 
  AND c.caretaker_id IS NULL;

-- Ensure caretaker_id is NOT NULL in alerts
UPDATE alerts a
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE a.profile_id = p.id 
  AND a.caretaker_id IS NULL;

-- Ensure caretaker_id is NOT NULL in trusted_contacts
UPDATE trusted_contacts tc
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE tc.profile_id = p.id 
  AND tc.caretaker_id IS NULL;

-- Ensure caretaker_id is NOT NULL in blocked_callers
UPDATE blocked_callers bc
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE bc.profile_id = p.id 
  AND bc.caretaker_id IS NULL;

-- Ensure caretaker_id is NOT NULL in fraud_safe_phrases
UPDATE fraud_safe_phrases fsp
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE fsp.profile_id = p.id 
  AND fsp.caretaker_id IS NULL;

-- Ensure caretaker_id is NOT NULL in profile_device_tokens
UPDATE profile_device_tokens pdt
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE pdt.profile_id = p.id 
  AND pdt.caretaker_id IS NULL;

-- Ensure caretaker_id is NOT NULL in profile_members
UPDATE profile_members pm
SET caretaker_id = p.caretaker_id
FROM profiles p
WHERE pm.profile_id = p.id 
  AND pm.caretaker_id IS NULL;

-- Add NOT NULL constraints to ensure no future issues
ALTER TABLE calls ALTER COLUMN caretaker_id SET NOT NULL;
ALTER TABLE alerts ALTER COLUMN caretaker_id SET NOT NULL;
ALTER TABLE trusted_contacts ALTER COLUMN caretaker_id SET NOT NULL;
ALTER TABLE blocked_callers ALTER COLUMN caretaker_id SET NOT NULL;
ALTER TABLE fraud_safe_phrases ALTER COLUMN caretaker_id SET NOT NULL;
ALTER TABLE profile_device_tokens ALTER COLUMN caretaker_id SET NOT NULL;
ALTER TABLE profile_members ALTER COLUMN caretaker_id SET NOT NULL;

-- ============================================================================
-- HOTFIX COMPLETE
-- ============================================================================
--
-- All caretaker_id columns are now:
-- 1. Populated with correct values
-- 2. Set to NOT NULL to prevent future issues
--
-- Result: RLS policies will work correctly now
--
-- ============================================================================
