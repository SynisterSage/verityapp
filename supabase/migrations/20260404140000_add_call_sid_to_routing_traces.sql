-- Add call_sid column to call_routing_traces for hop detection queries
-- This allows querying routing traces by Twilio call_sid to detect loops

alter table call_routing_traces 
add column call_sid text;

-- Add index for hop detection (profile_id + call_sid queries)
create index if not exists idx_routing_traces_call_sid 
  on call_routing_traces(call_sid);

-- Composite index for the exact query pattern in hop detection
create index if not exists idx_routing_traces_profile_call_sid_v2
  on call_routing_traces(profile_id, call_sid);
