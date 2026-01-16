-- ============================================================================
-- WINDCHASERS SUPABASE SCHEMA
-- ============================================================================
-- Complete database schema for Windchasers brand
-- Based on multi-touchpoint architecture with aviation-specific fields
-- 
-- This schema supports:
-- - Multi-channel lead tracking (web, whatsapp, voice, social)
-- - Lead scoring and stage management
-- - Aviation-specific data in unified_context JSONB field
-- ============================================================================

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Phone normalization function
-- Removes all non-digit characters from phone numbers for consistent matching
-- Drop existing function first to avoid parameter name conflicts
DO $$
DECLARE
  func_signature TEXT;
BEGIN
  -- Find and drop function with any parameter signature
  FOR func_signature IN
    SELECT pg_get_function_identity_arguments(oid)
    FROM pg_proc
    WHERE proname = 'normalize_phone'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS normalize_phone(%s) CASCADE', func_signature);
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors if function doesn't exist
    NULL;
END $$;

CREATE OR REPLACE FUNCTION normalize_phone(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove all non-digit characters, keep only numbers
  RETURN regexp_replace(phone_number, '\D', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Updated timestamp trigger function
-- Automatically updates updated_at column when rows are modified
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Dashboard Users Table (Required for authentication)
-- Extends Supabase auth.users with dashboard-specific roles and metadata
CREATE TABLE IF NOT EXISTS dashboard_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- User Invitations Table
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  invited_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dashboard Settings Table
CREATE TABLE IF NOT EXISTS dashboard_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- all_leads table
-- Minimal unifier table - one record per unique customer
-- Deduplication by (customer_phone_normalized, brand)
CREATE TABLE IF NOT EXISTS all_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  customer_phone_normalized TEXT,
  first_touchpoint TEXT NOT NULL CHECK (first_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_touchpoint TEXT NOT NULL CHECK (last_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- WINDCHASERS BRAND: Default and constraint set to 'windchasers'
  brand TEXT DEFAULT 'windchasers' CHECK (brand IN ('windchasers')),
  
  -- unified_context: JSONB field for cross-channel data
  -- Expected structure for Windchasers aviation fields:
  -- {
  --   "windchasers": {
  --     "user_type": "student" | "parent" | "professional",
  --     "city": "string",
  --     "course_interest": "DGCA" | "Flight" | "Heli" | "Cabin" | "Drone",
  --     "training_type": "online" | "offline" | "hybrid",
  --     "class_12_science": boolean,
  --     "plan_to_fly": "asap" | "1-3mo" | "6+mo" | "1yr+",
  --     "budget_awareness": "aware" | "exploring" | "unaware",
  --     "dgca_completed": boolean
  --   }
  -- }
  unified_context JSONB DEFAULT '{}'::jsonb,
  
  -- Lead scoring and lifecycle fields
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_stage TEXT DEFAULT 'New' CHECK (lead_stage IN (
    'New',
    'Engaged',
    'Qualified',
    'High Intent',
    'Booking Made',
    'Converted',
    'Closed Lost',
    'In Sequence',
    'Cold'
  )),
  sub_stage TEXT,
  stage_override BOOLEAN DEFAULT FALSE,
  last_scored_at TIMESTAMP WITH TIME ZONE,
  is_manual_override BOOLEAN DEFAULT FALSE,
  is_active_chat BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure lead scoring columns exist (in case table was created without them)
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'New',
ADD COLUMN IF NOT EXISTS sub_stage TEXT,
ADD COLUMN IF NOT EXISTS stage_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_active_chat BOOLEAN DEFAULT FALSE;

-- Add check constraints for lead scoring columns (if they don't exist)
DO $$
BEGIN
  -- Add lead_score constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'all_leads_lead_score_check'
  ) THEN
    ALTER TABLE all_leads 
    ADD CONSTRAINT all_leads_lead_score_check 
    CHECK (lead_score >= 0 AND lead_score <= 100);
  END IF;
  
  -- Add lead_stage constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'all_leads_lead_stage_check'
  ) THEN
    ALTER TABLE all_leads 
    ADD CONSTRAINT all_leads_lead_stage_check 
    CHECK (lead_stage IN (
      'New',
      'Engaged',
      'Qualified',
      'High Intent',
      'Booking Made',
      'Converted',
      'Closed Lost',
      'In Sequence',
      'Cold'
    ));
  END IF;
END $$;

-- web_sessions table
-- Self-contained web channel data - all fields needed for web interactions
CREATE TABLE IF NOT EXISTS web_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  
  -- WINDCHASERS BRAND: Default and constraint set to 'windchasers'
  brand TEXT DEFAULT 'windchasers' CHECK (brand IN ('windchasers')),
  
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  external_session_id TEXT,
  chat_session_id TEXT,
  website_url TEXT,
  booking_status TEXT CHECK (booking_status IN ('pending', 'confirmed', 'cancelled')),
  booking_date DATE,
  booking_time TIME,
  google_event_id TEXT,
  booking_created_at TIMESTAMP WITH TIME ZONE,
  conversation_summary TEXT,
  user_inputs_summary JSONB,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  session_status TEXT DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'abandoned')),
  channel_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- whatsapp_sessions table
-- Self-contained WhatsApp channel data
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  
  -- WINDCHASERS BRAND: Default and constraint set to 'windchasers'
  brand TEXT DEFAULT 'windchasers' CHECK (brand IN ('windchasers')),
  
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  whatsapp_business_account_id TEXT,
  whatsapp_contact_id TEXT,
  conversation_summary TEXT,
  conversation_context JSONB,
  user_inputs_summary JSONB,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_from TEXT,
  last_message_preview TEXT,
  conversation_status TEXT,
  response_time_avg_seconds INTEGER,
  overall_sentiment TEXT,
  channel_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- voice_sessions table
-- Self-contained voice channel data
CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  
  -- WINDCHASERS BRAND: Default and constraint set to 'windchasers'
  brand TEXT DEFAULT 'windchasers' CHECK (brand IN ('windchasers')),
  
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  call_sid TEXT,
  phone_number TEXT,
  call_duration_seconds INTEGER,
  call_status TEXT,
  call_direction TEXT,
  recording_url TEXT,
  transcription TEXT,
  call_summary TEXT,
  sentiment TEXT,
  conversation_context JSONB,
  user_inputs_summary JSONB,
  audio_quality TEXT,
  channel_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- social_sessions table
-- Self-contained social media channel data
CREATE TABLE IF NOT EXISTS social_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  
  -- WINDCHASERS BRAND: Default and constraint set to 'windchasers'
  brand TEXT DEFAULT 'windchasers' CHECK (brand IN ('windchasers')),
  
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  platform TEXT,
  platform_user_id TEXT,
  platform_username TEXT,
  engagement_type TEXT,
  content_id TEXT,
  engagement_preview TEXT,
  last_engagement_at TIMESTAMP WITH TIME ZONE,
  engagement_count INTEGER DEFAULT 0,
  conversation_summary TEXT,
  conversation_context JSONB,
  user_inputs_summary JSONB,
  sentiment TEXT,
  engagement_quality TEXT,
  channel_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- conversations table (renamed from messages)
-- Universal append-only audit trail for all channels
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'voice', 'social')),
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'agent', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- lead_stage_changes table
-- Logs all stage transitions for audit trail
CREATE TABLE IF NOT EXISTS lead_stage_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  old_sub_stage TEXT,
  new_sub_stage TEXT,
  old_score INTEGER,
  new_score INTEGER,
  changed_by UUID,
  change_reason TEXT,
  is_automatic BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- lead_stage_overrides table
-- Tracks manual stage overrides
CREATE TABLE IF NOT EXISTS lead_stage_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  overridden_stage TEXT NOT NULL,
  overridden_sub_stage TEXT,
  overridden_by UUID,
  override_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  removed_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- activities table (for activity logging)
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_subtype TEXT,
  note TEXT,
  duration_minutes INTEGER,
  next_follow_up_date TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- all_leads indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_all_leads_phone_brand 
ON all_leads(customer_phone_normalized, brand) 
WHERE customer_phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_all_leads_first_touchpoint ON all_leads(first_touchpoint);
CREATE INDEX IF NOT EXISTS idx_all_leads_last_touchpoint ON all_leads(last_touchpoint);
CREATE INDEX IF NOT EXISTS idx_all_leads_last_interaction_at ON all_leads(last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_all_leads_brand ON all_leads(brand);
CREATE INDEX IF NOT EXISTS idx_all_leads_created_at ON all_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_score ON all_leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_stage ON all_leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_all_leads_sub_stage ON all_leads(sub_stage) WHERE sub_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_stage_override ON all_leads(stage_override) WHERE stage_override = TRUE;
CREATE INDEX IF NOT EXISTS idx_all_leads_is_active_chat ON all_leads(is_active_chat) WHERE is_active_chat = TRUE;

-- web_sessions indexes
CREATE INDEX IF NOT EXISTS idx_web_sessions_lead_id ON web_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_web_sessions_booking_date ON web_sessions(booking_date) WHERE booking_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_sessions_created_at ON web_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_sessions_external_session_id ON web_sessions(external_session_id) WHERE external_session_id IS NOT NULL;

-- whatsapp_sessions indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_lead_id ON whatsapp_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_created_at ON whatsapp_sessions(created_at DESC);

-- voice_sessions indexes
CREATE INDEX IF NOT EXISTS idx_voice_sessions_lead_id ON voice_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_created_at ON voice_sessions(created_at DESC);

-- social_sessions indexes
CREATE INDEX IF NOT EXISTS idx_social_sessions_lead_id ON social_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_social_sessions_created_at ON social_sessions(created_at DESC);

-- conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_channel ON conversations(lead_id, channel);

-- lead_stage_changes indexes
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_lead_id ON lead_stage_changes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_created_at ON lead_stage_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_new_stage ON lead_stage_changes(new_stage);

-- lead_stage_overrides indexes
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_lead_id ON lead_stage_overrides(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_is_active ON lead_stage_overrides(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_created_at ON lead_stage_overrides(created_at DESC);

-- activities indexes
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp triggers
-- Triggers for dashboard_users updated_at
DROP TRIGGER IF EXISTS update_dashboard_users_updated_at ON dashboard_users;
CREATE TRIGGER update_dashboard_users_updated_at
  BEFORE UPDATE ON dashboard_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_all_leads_updated_at ON all_leads;
CREATE TRIGGER update_all_leads_updated_at
  BEFORE UPDATE ON all_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_web_sessions_updated_at ON web_sessions;
CREATE TRIGGER update_web_sessions_updated_at
  BEFORE UPDATE ON web_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_sessions_updated_at ON whatsapp_sessions;
CREATE TRIGGER update_whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_voice_sessions_updated_at ON voice_sessions;
CREATE TRIGGER update_voice_sessions_updated_at
  BEFORE UPDATE ON voice_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_social_sessions_updated_at ON social_sessions;
CREATE TRIGGER update_social_sessions_updated_at
  BEFORE UPDATE ON social_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES (Row Level Security)
-- ============================================================================

-- RLS Policies for dashboard_users
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON dashboard_users;
CREATE POLICY "Users can view their own profile"
  ON dashboard_users FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all users" ON dashboard_users;
CREATE POLICY "Admins can view all users"
  ON dashboard_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can update their own profile" ON dashboard_users;
CREATE POLICY "Users can update their own profile"
  ON dashboard_users FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update any user" ON dashboard_users;
CREATE POLICY "Admins can update any user"
  ON dashboard_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for user_invitations
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all invitations" ON user_invitations;
CREATE POLICY "Admins can view all invitations"
  ON user_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Anyone can view invitation by token" ON user_invitations;
CREATE POLICY "Anyone can view invitation by token"
  ON user_invitations FOR SELECT
  USING (true);

-- RLS Policies for dashboard_settings
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view settings" ON dashboard_settings;
CREATE POLICY "Authenticated users can view settings"
  ON dashboard_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can update settings" ON dashboard_settings;
CREATE POLICY "Admins can update settings"
  ON dashboard_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert settings" ON dashboard_settings;
CREATE POLICY "Admins can insert settings"
  ON dashboard_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Enable RLS on all tables
ALTER TABLE all_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- all_leads RLS policies
DROP POLICY IF EXISTS "Authenticated users can view all_leads" ON all_leads;
CREATE POLICY "Authenticated users can view all_leads"
  ON all_leads FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert all_leads" ON all_leads;
CREATE POLICY "Authenticated users can insert all_leads"
  ON all_leads FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update all_leads" ON all_leads;
CREATE POLICY "Authenticated users can update all_leads"
  ON all_leads FOR UPDATE
  USING (auth.role() = 'authenticated');

-- web_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view web_sessions" ON web_sessions;
CREATE POLICY "Authenticated users can view web_sessions"
  ON web_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert web_sessions" ON web_sessions;
CREATE POLICY "Authenticated users can insert web_sessions"
  ON web_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update web_sessions" ON web_sessions;
CREATE POLICY "Authenticated users can update web_sessions"
  ON web_sessions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- whatsapp_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Authenticated users can view whatsapp_sessions"
  ON whatsapp_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Authenticated users can insert whatsapp_sessions"
  ON whatsapp_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- voice_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view voice_sessions" ON voice_sessions;
CREATE POLICY "Authenticated users can view voice_sessions"
  ON voice_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert voice_sessions" ON voice_sessions;
CREATE POLICY "Authenticated users can insert voice_sessions"
  ON voice_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- social_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view social_sessions" ON social_sessions;
CREATE POLICY "Authenticated users can view social_sessions"
  ON social_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert social_sessions" ON social_sessions;
CREATE POLICY "Authenticated users can insert social_sessions"
  ON social_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- conversations RLS policies (allow all for webhooks)
DROP POLICY IF EXISTS "Allow all users to view conversations" ON conversations;
CREATE POLICY "Allow all users to view conversations"
  ON conversations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow all users to insert conversations" ON conversations;
CREATE POLICY "Allow all users to insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

-- lead_stage_changes RLS policies
DROP POLICY IF EXISTS "Authenticated users can view lead_stage_changes" ON lead_stage_changes;
CREATE POLICY "Authenticated users can view lead_stage_changes"
  ON lead_stage_changes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_changes" ON lead_stage_changes;
CREATE POLICY "Authenticated users can insert lead_stage_changes"
  ON lead_stage_changes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- lead_stage_overrides RLS policies
DROP POLICY IF EXISTS "Authenticated users can view lead_stage_overrides" ON lead_stage_overrides;
CREATE POLICY "Authenticated users can view lead_stage_overrides"
  ON lead_stage_overrides FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_overrides" ON lead_stage_overrides;
CREATE POLICY "Authenticated users can insert lead_stage_overrides"
  ON lead_stage_overrides FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update lead_stage_overrides" ON lead_stage_overrides;
CREATE POLICY "Authenticated users can update lead_stage_overrides"
  ON lead_stage_overrides FOR UPDATE
  USING (auth.role() = 'authenticated');

-- activities RLS policies
DROP POLICY IF EXISTS "Authenticated users can view activities" ON activities;
CREATE POLICY "Authenticated users can view activities"
  ON activities FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert activities" ON activities;
CREATE POLICY "Authenticated users can insert activities"
  ON activities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- VIEWS
-- ============================================================================

-- unified_leads view
-- Aggregates all lead data from all_leads and channel-specific tables
-- Used by dashboard for displaying lead information
DROP VIEW IF EXISTS unified_leads;

CREATE OR REPLACE VIEW unified_leads
WITH (security_invoker = true)
AS
SELECT 
  al.id,
  al.first_touchpoint,
  al.last_touchpoint,
  al.customer_name AS name,
  al.email,
  al.phone,
  al.brand,
  al.created_at AS timestamp,
  al.last_interaction_at,
  -- Status from web_sessions booking_status (most common)
  -- Cast to TEXT to avoid enum constraint issues when no booking exists
  COALESCE(
    (SELECT ws.booking_status::TEXT FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1),
    NULL
  ) AS status,
  -- Booking date/time from web_sessions
  (SELECT ws.booking_date FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1) AS booking_date,
  (SELECT ws.booking_time FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1) AS booking_time,
  -- Lead scoring fields
  al.lead_score,
  al.lead_stage,
  al.sub_stage,
  al.stage_override,
  al.last_scored_at,
  al.is_manual_override,
  al.is_active_chat,
  -- Metadata with all channel data
  JSONB_BUILD_OBJECT(
    'web_data', (
      SELECT JSONB_BUILD_OBJECT(
        'customer_name', ws.customer_name,
        'booking_status', ws.booking_status,
        'booking_date', ws.booking_date,
        'booking_time', ws.booking_time,
        'conversation_summary', ws.conversation_summary,
        'message_count', ws.message_count,
        'last_message_at', ws.last_message_at,
        'session_status', ws.session_status,
        'website_url', ws.website_url
      )
      FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1
    ),
    'whatsapp_data', (
      SELECT JSONB_BUILD_OBJECT(
        'message_count', whs.message_count,
        'last_message_at', whs.last_message_at,
        'conversation_status', whs.conversation_status,
        'overall_sentiment', whs.overall_sentiment
      )
      FROM whatsapp_sessions whs WHERE whs.lead_id = al.id ORDER BY whs.created_at DESC LIMIT 1
    ),
    'voice_data', (
      SELECT JSONB_BUILD_OBJECT(
        'call_duration', vs.call_duration_seconds,
        'call_status', vs.call_status,
        'sentiment', vs.sentiment
      )
      FROM voice_sessions vs WHERE vs.lead_id = al.id ORDER BY vs.created_at DESC LIMIT 1
    ),
    'social_data', (
      SELECT JSONB_AGG(JSONB_BUILD_OBJECT('platform', ss.platform, 'engagement_type', ss.engagement_type))
      FROM social_sessions ss WHERE ss.lead_id = al.id
    )
  ) AS metadata,
  -- unified_context: Contains Windchasers aviation-specific fields
  -- Expected structure:
  -- {
  --   "windchasers": {
  --     "user_type": "student" | "parent" | "professional",
  --     "city": "string",
  --     "course_interest": "DGCA" | "Flight" | "Heli" | "Cabin" | "Drone",
  --     "training_type": "online" | "offline" | "hybrid",
  --     "class_12_science": boolean,
  --     "plan_to_fly": "asap" | "1-3mo" | "6+mo" | "1yr+",
  --     "budget_awareness": "aware" | "exploring" | "unaware",
  --     "dgca_completed": boolean
  --   }
  -- }
  al.unified_context
FROM all_leads al
WHERE (
  al.customer_name IS NOT NULL 
  OR al.email IS NOT NULL 
  OR al.phone IS NOT NULL
);

-- Grant access to unified_leads view
GRANT SELECT ON unified_leads TO authenticated;
ALTER VIEW unified_leads OWNER TO postgres;

-- ============================================================================
-- REALTIME PUBLICATION
-- ============================================================================
-- Enable Supabase Realtime for live updates

DO $$
BEGIN
  -- Add all_leads to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'all_leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE all_leads;
  END IF;

  -- Add web_sessions to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'web_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE web_sessions;
  END IF;

  -- Add whatsapp_sessions to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'whatsapp_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_sessions;
  END IF;

  -- Add voice_sessions to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'voice_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE voice_sessions;
  END IF;

  -- Add social_sessions to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'social_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE social_sessions;
  END IF;

  -- Add conversations to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
  END $$;

-- Function to create dashboard user on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO dashboard_users (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating dashboard_user for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create dashboard_user when auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================
-- 
-- Windchasers schema is now ready for use.
-- 
-- KEY DIFFERENCES FROM PROXE SCHEMA:
-- - All brand defaults and constraints set to 'windchasers'
-- - unified_context JSONB field documented for aviation-specific data
-- 
-- AVIATION FIELDS STRUCTURE (stored in unified_context):
-- {
--   "windchasers": {
--     "user_type": "student" | "parent" | "professional",
--     "city": "string",
--     "course_interest": "DGCA" | "Flight" | "Heli" | "Cabin" | "Drone",
--     "training_type": "online" | "offline" | "hybrid",
--     "class_12_science": boolean,
--     "plan_to_fly": "asap" | "1-3mo" | "6+mo" | "1yr+",
--     "budget_awareness": "aware" | "exploring" | "unaware",
--     "dgca_completed": boolean
--   }
-- }
--
-- ============================================================================
