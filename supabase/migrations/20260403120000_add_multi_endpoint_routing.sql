-- Multi-Endpoint Routing Support (PSTN + Mobile + Landline)
-- Enables single Verity number to route to mobile, landline, or app based on call ingress

-- 1. Profile endpoints table
-- Stores normalized phone endpoints for mobile/landline targeting
create table if not exists profile_endpoints (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  
  -- endpoint identity
  endpoint_type varchar(50) not null,  -- 'mobile' | 'landline' | 'app'
  phone_number text,  -- NULL for 'app' endpoint
  
  -- normalized E.164 for matching
  phone_number_e164 varchar(20),  -- normalized form for ingress detection
  
  -- endpoint status
  is_active boolean default true,
  verified_at timestamptz,  -- when endpoint was added/verified
  last_dialed_at timestamptz,
  
  -- metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- constraints
  constraint phone_present_for_pstn check (
    (endpoint_type = 'app' and phone_number is null) or 
    (endpoint_type in ('mobile', 'landline') and phone_number is not null)
  ),
  constraint valid_endpoint_type check (endpoint_type in ('mobile', 'landline', 'app')),
  constraint phone_format check (phone_number is null or phone_number ~ '^\+?[0-9]{10,}$')
);

-- Partial unique index to ensure only one mobile and one landline per profile
create unique index if not exists idx_unique_mobile_landline_per_profile 
  on profile_endpoints(profile_id, endpoint_type) 
  where endpoint_type != 'app';

create index if not exists idx_profile_endpoints_profile_id on profile_endpoints(profile_id);
create index if not exists idx_profile_endpoints_phone_e164 on profile_endpoints(phone_number_e164);
create index if not exists idx_profile_endpoints_endpoint_type on profile_endpoints(endpoint_type);
create index if not exists idx_profile_endpoints_is_active on profile_endpoints(is_active) where is_active = true;

-- 2. Profile routing preferences
-- Controls how calls are routed and distributed
create table if not exists profile_routing_prefs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  
  -- feature enable flags
  multi_endpoint_enabled boolean default false,  -- master on/off for ingress-aware routing
  use_ingress_aware_routing boolean default true,  -- if true, route back to ingress endpoint
  
  -- routing behavior
  default_fallback_type varchar(50),  -- 'app' | 'voicemail' | 'first_available'
  simultaneous_ring_enabled boolean default false,  -- ring multiple endpoints at once
  ring_timeout_seconds int default 30,
  
  -- loop prevention
  hop_limit_threshold int default 5,
  duplicate_detection_window_seconds int default 300,  -- 5 minute window
  
  -- no-answer behavior
  no_answer_action varchar(50) default 'voicemail',  -- 'voicemail' | 'fallback' | 'hangup'
  voicemail_enabled boolean default true,
  
  -- metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  constraint valid_fallback_type check (default_fallback_type in ('app', 'voicemail', 'first_available')),
  constraint valid_no_answer_action check (no_answer_action in ('voicemail', 'fallback', 'hangup')),
  constraint valid_timeout check (ring_timeout_seconds > 0 and ring_timeout_seconds <= 300),
  constraint valid_hop_limit check (hop_limit_threshold > 0 and hop_limit_threshold <= 10)
);

create index if not exists idx_routing_prefs_profile_id on profile_routing_prefs(profile_id);
create index if not exists idx_routing_prefs_multi_endpoint_enabled on profile_routing_prefs(multi_endpoint_enabled);

-- 3. Call routing trace
-- Audit trail for understanding call flow through endpoints
create table if not exists call_routing_traces (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  
  -- ingress info
  ingress_detected varchar(50),  -- 'mobile' | 'landline' | 'app' | 'unknown'
  ingress_confidence varchar(50) default 'low',  -- 'high' | 'medium' | 'low'
  ingress_from_number varchar(20),  -- number call came from before forwarding
  forwarded_from_number varchar(20),  -- extracted from forwarding metadata
  
  -- routing decision
  routing_mode varchar(50) not null,  -- 'ingress_aware' | 'legacy' | 'failed_safe'
  target_endpoint_type varchar(50),  -- which endpoint was attempted
  ani_confidence varchar(50),  -- confidence in caller identity
  
  -- loop guard
  loop_guard_result varchar(50),  -- 'allowed' | 'blocked_ingress' | 'blocked_hop' | 'blocked_duplicate'
  hop_count int default 0,
  
  -- leg tracking
  routing_attempts int default 0,  -- how many endpoints attempted
  last_attempted_leg varchar(255),  -- masked destination value
  
  -- metadata
  trace_notes text,
  created_at timestamptz default now(),
  
  constraint valid_ingress check (ingress_detected in ('mobile', 'landline', 'app', 'unknown')),
  constraint valid_confidence check (ingress_confidence in ('high', 'medium', 'low')),
  constraint valid_ani_confidence check (ani_confidence in ('high', 'medium', 'low')),
  constraint valid_routing_mode check (routing_mode in ('ingress_aware', 'legacy', 'failed_safe')),
  constraint valid_loop_guard_result check (loop_guard_result in ('allowed', 'blocked_ingress', 'blocked_hop', 'blocked_duplicate'))
);

create index if not exists idx_routing_traces_profile_id on call_routing_traces(profile_id);
create index if not exists idx_routing_traces_call_id on call_routing_traces(call_id);
create index if not exists idx_routing_traces_ingress_detected on call_routing_traces(ingress_detected);
create index if not exists idx_routing_traces_routing_mode on call_routing_traces(routing_mode);
create index if not exists idx_routing_traces_created_at on call_routing_traces(created_at desc);

-- 4. Add multi_endpoint_enabled flag to profiles
-- This allows per-profile opt-in while maintaining backward compatibility
alter table if exists profiles
  add column if not exists multi_endpoint_enabled boolean default false;

-- Create indexes for new column
create index if not exists idx_profiles_multi_endpoint_enabled on profiles(multi_endpoint_enabled);

-- 5. Migration helper: copy legacy fields to new endpoint schema for existing profiles
-- This ensures backward compatibility; old phone_number/fallback_phone_number continue to work
create or replace function migrate_legacy_endpoints()
returns void as $$
declare
  profile record;
begin
  for profile in 
    select id, phone_number, fallback_phone_number 
    from profiles 
    where (phone_number is not null or fallback_phone_number is not null)
      and not exists (select 1 from profile_endpoints where profile_id = profiles.id)
  loop
    -- Insert primary phone as mobile endpoint
    if profile.phone_number is not null then
      insert into profile_endpoints (profile_id, endpoint_type, phone_number, phone_number_e164, verified_at, is_active)
      values (
        profile.id, 
        'mobile', 
        profile.phone_number,
        profile.phone_number,  -- normalized on write in app
        now(),
        true
      );
    end if;

    -- Insert fallback as landline endpoint if different from primary
    if profile.fallback_phone_number is not null and profile.fallback_phone_number != profile.phone_number then
      insert into profile_endpoints (profile_id, endpoint_type, phone_number, phone_number_e164, verified_at, is_active)
      values (
        profile.id,
        'landline',
        profile.fallback_phone_number,
        profile.fallback_phone_number,  -- normalized on write in app
        now(),
        true
      );
    end if;

    -- Create default routing prefs if not exists
    insert into profile_routing_prefs (profile_id)
    values (profile.id)
    on conflict(profile_id) do update set updated_at = now();
  end loop;
end;
$$ language plpgsql;

-- Run migration for all existing profiles
select migrate_legacy_endpoints();

-- Clean up helper function
drop function if exists migrate_legacy_endpoints();

-- 6. RLS Policies
-- Profiles can see their own endpoints
alter table profile_endpoints enable row level security;
create policy "Users can view own profile endpoints"
  on profile_endpoints for select
  using (
    profile_id in (
      select id from profiles 
      where caretaker_id = auth.uid()
    )
    or profile_id in (
      select profile_id from profile_members 
      where user_id = auth.uid()
    )
  );

create policy "Users can update own profile endpoints"
  on profile_endpoints for update
  using (
    profile_id in (
      select id from profiles 
      where caretaker_id = auth.uid()
    )
  );

create policy "Users can insert own profile endpoints"
  on profile_endpoints for insert
  with check (
    profile_id in (
      select id from profiles 
      where caretaker_id = auth.uid()
    )
  );

-- Routing preferences RLS
alter table profile_routing_prefs enable row level security;
create policy "Users can view own routing prefs"
  on profile_routing_prefs for select
  using (
    profile_id in (
      select id from profiles 
      where caretaker_id = auth.uid()
    )
    or profile_id in (
      select profile_id from profile_members 
      where user_id = auth.uid()
    )
  );

create policy "Users can update own routing prefs"
  on profile_routing_prefs for update
  using (
    profile_id in (
      select id from profiles 
      where caretaker_id = auth.uid()
    )
  );

-- Routing traces RLS (audit only, caretaker and members can see)
alter table call_routing_traces enable row level security;
create policy "Users can view own call routing traces"
  on call_routing_traces for select
  using (
    profile_id in (
      select id from profiles 
      where caretaker_id = auth.uid()
    )
    or profile_id in (
      select profile_id from profile_members 
      where user_id = auth.uid()
    )
  );
