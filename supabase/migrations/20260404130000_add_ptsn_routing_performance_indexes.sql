-- Performance indexes for PTSN multi-endpoint routing

-- Composite index for hop detection query (call_routing_traces by profile+call_sid)
create index if not exists idx_routing_traces_profile_call_sid 
  on call_routing_traces(profile_id, call_sid);

-- Index for duplicate detection time-window queries
create index if not exists idx_routing_traces_profile_created 
  on call_routing_traces(profile_id, created_at desc);

-- Index for ingress type queries (used in detectCallIngress)
create index if not exists idx_routing_traces_profile_ingress 
  on call_routing_traces(profile_id, ingress_detected, created_at desc);

-- Composite index for endpoint lookups (active endpoints by profile)
create index if not exists idx_endpoints_profile_active_type 
  on profile_endpoints(profile_id, is_active, endpoint_type) 
  include (phone_number);  -- Include phone_number to enable index-only scans

-- Index for routing preference lookups (by profile)
create index if not exists idx_routing_prefs_profile 
  on profile_routing_prefs(profile_id);

-- Index for calls table to speed up call_routing_traces FK lookups
create index if not exists idx_calls_profile_call_sid 
  on calls(profile_id, call_sid, created_at desc);

-- Index for loop guard checks on phones
create index if not exists idx_orphaned_dids_profile 
  on orphaned_dids(profile_id, phone_number);
