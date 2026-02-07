-- Migration: Create Twilio Number Pool for auto-assignment
-- This table stores purchased Twilio numbers and manages assignment to profiles

CREATE TABLE twilio_number_pool (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Twilio details
  phone_number text UNIQUE NOT NULL,
  twilio_sid text UNIQUE NOT NULL,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'available',
  -- Possible values: 'available', 'assigned', 'reserved', 'released'
  
  -- Assignment tracking
  assigned_to_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  reserved_until timestamptz, -- For temporary holds during assignment (5 min window)
  
  -- Metadata
  country_code text DEFAULT 'US',
  area_code text,
  capabilities jsonb DEFAULT '{"voice": true, "sms": false, "mms": false}'::jsonb,
  
  -- Audit fields
  imported_at timestamptz DEFAULT now(),
  imported_by uuid REFERENCES auth.users(id),
  released_at timestamptz,
  
  -- Standard timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_twilio_pool_status_available ON twilio_number_pool(status) 
  WHERE status = 'available';

CREATE INDEX idx_twilio_pool_assigned_profile ON twilio_number_pool(assigned_to_profile_id) 
  WHERE assigned_to_profile_id IS NOT NULL;

CREATE INDEX idx_twilio_pool_area_code_status ON twilio_number_pool(area_code, status)
  WHERE status = 'available';

CREATE INDEX idx_twilio_pool_reserved_until ON twilio_number_pool(reserved_until)
  WHERE reserved_until IS NOT NULL;

-- RLS Policies (Backend service role only)
ALTER TABLE twilio_number_pool ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on twilio_number_pool" 
  ON twilio_number_pool
  FOR ALL 
  USING (auth.jwt()->>'role' = 'service_role');

-- Update timestamp function and trigger
CREATE OR REPLACE FUNCTION update_twilio_number_pool_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_twilio_number_pool_updated_at 
  BEFORE UPDATE ON twilio_number_pool 
  FOR EACH ROW 
  EXECUTE FUNCTION update_twilio_number_pool_updated_at();

-- Function to atomically claim an available number
-- This prevents race conditions when multiple users try to get numbers simultaneously
CREATE OR REPLACE FUNCTION claim_available_number(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  phone_number text,
  twilio_sid text
) 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
  -- Atomically update and return the first available number
  -- FOR UPDATE SKIP LOCKED prevents concurrent transactions from blocking
  RETURN QUERY
  UPDATE twilio_number_pool
  SET 
    status = 'reserved',
    assigned_to_profile_id = p_profile_id,
    reserved_until = now() + interval '5 minutes',
    updated_at = now()
  WHERE twilio_number_pool.id = (
    SELECT twilio_number_pool.id 
    FROM twilio_number_pool
    WHERE status = 'available'
    ORDER BY created_at ASC -- FIFO: assign oldest available numbers first
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    twilio_number_pool.id,
    twilio_number_pool.phone_number,
    twilio_number_pool.twilio_sid;
END;
$$;

-- Function to release expired reservations (for cleanup job)
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  released_count integer;
BEGIN
  WITH released AS (
    UPDATE twilio_number_pool
    SET 
      status = 'available',
      assigned_to_profile_id = NULL,
      reserved_until = NULL,
      updated_at = now()
    WHERE status = 'reserved'
      AND reserved_until < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO released_count FROM released;
  
  RETURN released_count;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE twilio_number_pool IS 'Pool of Twilio phone numbers for auto-assignment to profiles';
COMMENT ON FUNCTION claim_available_number IS 'Atomically claims an available number for a profile';
COMMENT ON FUNCTION release_expired_reservations IS 'Cleanup function to release expired number reservations';
