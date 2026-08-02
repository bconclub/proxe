-- ═══════════════════════════════════════════════════════════════════════════
-- PROXe fresh-Supabase bootstrap — SINGLE-FILE edition (v2: fresh-DB GRANT fix)
-- Paste the WHOLE file into the Supabase SQL editor and Run once.
-- Afterwards run verification.sql. Sources + rationale: README.md.
-- ═══════════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 00_extensions.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 00_extensions.sql
-- Fresh-project prerequisites. gen_random_uuid() is built into Postgres 13+;
-- pgvector powers knowledge_base_chunks (block 24).
CREATE EXTENSION IF NOT EXISTS vector;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 01_dashboard_schema.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Dashboard Users Table
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

-- Dashboard Leads Table
-- Stores leads from all channels (Web, WhatsApp, Voice, Social)
-- This is separate from chat_sessions which is managed by the web agent
CREATE TABLE IF NOT EXISTS dashboard_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('web', 'whatsapp', 'voice', 'social')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'new',
  booking_date DATE,
  booking_time TIME,
  metadata JSONB,
  chat_session_id UUID, -- Optional reference to original chat_session if from web agent
  notes TEXT
);

-- Indexes for dashboard_leads
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_created_at ON dashboard_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_source ON dashboard_leads(source);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_status ON dashboard_leads(status);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_booking_date ON dashboard_leads(booking_date) WHERE booking_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_chat_session_id ON dashboard_leads(chat_session_id);

-- RLS Policies for dashboard_leads
ALTER TABLE dashboard_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view dashboard_leads"
  ON dashboard_leads FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert dashboard_leads"
  ON dashboard_leads FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update dashboard_leads"
  ON dashboard_leads FOR UPDATE
  USING (auth.role() = 'authenticated');

-- RLS Policies for dashboard_users
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON dashboard_users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
  ON dashboard_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update their own profile"
  ON dashboard_users FOR UPDATE
  USING (auth.uid() = id);

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

CREATE POLICY "Admins can view all invitations"
  ON user_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Anyone can view invitation by token"
  ON user_invitations FOR SELECT
  USING (true);

-- RLS Policies for dashboard_settings
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view settings"
  ON dashboard_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can update settings"
  ON dashboard_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert settings"
  ON dashboard_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_dashboard_users_updated_at BEFORE UPDATE ON dashboard_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_settings_updated_at BEFORE UPDATE ON dashboard_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime for dashboard_leads
-- This allows real-time updates in the dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE dashboard_leads;

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
    -- Log error but don't fail the user creation
    RAISE WARNING 'Error creating dashboard_user for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create dashboard_user when auth user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 02_dashboard_rls_fix.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Fix infinite recursion in dashboard_users RLS policies
-- The issue: Policies check dashboard_users table, which triggers the same policy check

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all users" ON dashboard_users;
DROP POLICY IF EXISTS "Admins can update any user" ON dashboard_users;

-- Create a SECURITY DEFINER function to check admin role
-- This function bypasses RLS to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM dashboard_users 
    WHERE id = user_id AND role = 'admin'
  );
END;
$$;

-- Recreate the policies using the function (avoids recursion)
CREATE POLICY "Admins can view all users"
  ON dashboard_users FOR SELECT
  USING (
    auth.uid() = id OR is_admin(auth.uid())
  );

CREATE POLICY "Admins can update any user"
  ON dashboard_users FOR UPDATE
  USING (
    auth.uid() = id OR is_admin(auth.uid())
  );

-- Also fix the policies for other tables that reference dashboard_users
-- These don't cause recursion but should use the function for consistency

-- Fix dashboard_settings policies
DROP POLICY IF EXISTS "Admins can update settings" ON dashboard_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON dashboard_settings;

CREATE POLICY "Admins can update settings"
  ON dashboard_settings FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert settings"
  ON dashboard_settings FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Fix user_invitations policies
DROP POLICY IF EXISTS "Admins can view all invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;

CREATE POLICY "Admins can view all invitations"
  ON user_invitations FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 03_lead_schema.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 03_lead_schema.sql  (from proxe migration 007, adapted for a FRESH project)
-- Multi-touchpoint lead schema: all_leads + per-channel session tables + messages.
-- Fresh-project edits vs the historical 007:
--   • Steps 15–18 (backfill from legacy `sessions` + unified_leads v1) removed —
--     no `sessions` table exists on a fresh DB; the FINAL unified_leads view is
--     created in block 20.
--   • session lead_id columns are NULLABLE (core's sessionManager creates
--     sessions before a lead exists); web_sessions uses ON DELETE SET NULL
--     (wc 032's contract), the rest keep CASCADE.
--   • messages.lead_id nullable; messages.channel CHECK includes
--     'landing_page' and 'meta_forms' (core writes both).

-- Step 1: Create function to normalize phone numbers
CREATE OR REPLACE FUNCTION normalize_phone(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove all non-digit characters, keep only numbers
  RETURN regexp_replace(phone_number, '\D', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Create all_leads table (minimal unifier)
CREATE TABLE IF NOT EXISTS all_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  customer_phone_normalized TEXT,
  first_touchpoint TEXT NOT NULL CHECK (first_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_touchpoint TEXT NOT NULL CHECK (last_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe')),
  unified_context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Create unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_all_leads_phone_brand 
ON all_leads(customer_phone_normalized, brand) 
WHERE customer_phone_normalized IS NOT NULL;

-- Step 4: Create indexes for all_leads
CREATE INDEX IF NOT EXISTS idx_all_leads_first_touchpoint ON all_leads(first_touchpoint);
CREATE INDEX IF NOT EXISTS idx_all_leads_last_touchpoint ON all_leads(last_touchpoint);
CREATE INDEX IF NOT EXISTS idx_all_leads_last_interaction_at ON all_leads(last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_all_leads_brand ON all_leads(brand);
CREATE INDEX IF NOT EXISTS idx_all_leads_created_at ON all_leads(created_at DESC);

-- Step 5: Create web_sessions table (self-contained)
CREATE TABLE IF NOT EXISTS web_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE SET NULL,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe')),
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

-- Step 6: Create indexes for web_sessions
CREATE INDEX IF NOT EXISTS idx_web_sessions_lead_id ON web_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_web_sessions_booking_date ON web_sessions(booking_date) WHERE booking_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_sessions_created_at ON web_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_sessions_external_session_id ON web_sessions(external_session_id) WHERE external_session_id IS NOT NULL;

-- Step 7: Create whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe')),
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

-- Step 8: Create indexes for whatsapp_sessions
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_lead_id ON whatsapp_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_created_at ON whatsapp_sessions(created_at DESC);

-- Step 9: Create voice_sessions table
CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe')),
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

-- Step 10: Create indexes for voice_sessions
CREATE INDEX IF NOT EXISTS idx_voice_sessions_lead_id ON voice_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_created_at ON voice_sessions(created_at DESC);

-- Step 11: Create social_sessions table
CREATE TABLE IF NOT EXISTS social_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe')),
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

-- Step 12: Create indexes for social_sessions
CREATE INDEX IF NOT EXISTS idx_social_sessions_lead_id ON social_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_social_sessions_created_at ON social_sessions(created_at DESC);

-- Step 13: Create messages table (universal message log)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'voice', 'social', 'landing_page', 'meta_forms')),
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'agent', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 14: Create indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_lead_channel ON messages(lead_id, channel);

-- Steps 15–18 removed for fresh-project bootstrap:
--   15/16: backfill from legacy sessions table (does not exist on fresh DB)
--   17/18: unified_leads v1 + grant (superseded — block 20 creates the FINAL view and grants)

-- Step 19: Enable Row Level Security (RLS) on all tables
ALTER TABLE all_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Step 20: Create RLS policies for all_leads
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

-- Step 21: Create RLS policies for web_sessions
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

-- Step 22: Create RLS policies for whatsapp_sessions
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Authenticated users can view whatsapp_sessions"
  ON whatsapp_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Authenticated users can insert whatsapp_sessions"
  ON whatsapp_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 23: Create RLS policies for voice_sessions
DROP POLICY IF EXISTS "Authenticated users can view voice_sessions" ON voice_sessions;
CREATE POLICY "Authenticated users can view voice_sessions"
  ON voice_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert voice_sessions" ON voice_sessions;
CREATE POLICY "Authenticated users can insert voice_sessions"
  ON voice_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 24: Create RLS policies for social_sessions
DROP POLICY IF EXISTS "Authenticated users can view social_sessions" ON social_sessions;
CREATE POLICY "Authenticated users can view social_sessions"
  ON social_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert social_sessions" ON social_sessions;
CREATE POLICY "Authenticated users can insert social_sessions"
  ON social_sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 25: Create RLS policies for messages
DROP POLICY IF EXISTS "Authenticated users can view messages" ON messages;
CREATE POLICY "Authenticated users can view messages"
  ON messages FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert messages" ON messages;
CREATE POLICY "Authenticated users can insert messages"
  ON messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 26: Enable Realtime for all tables
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

  -- Add messages to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

-- Step 27: Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
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

-- Migration complete!
-- Note: The old 'sessions' table is kept for reference but can be archived later
-- To archive: ALTER TABLE sessions RENAME TO sessions_archive;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 04_sessions_parity.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 04_sessions_parity.sql
-- Columns core writes/reads that 007's original DDL predates. Derived from
-- core code, not from any sibling migration (none exists):
--   whatsapp_sessions.external_session_id  webhook + engine.ts:2362
--   whatsapp_sessions.session_status       sessionManager.ts
--   whatsapp_sessions.metadata             calendar/sync
--   booking_* + reminder_*                 cron/booking-reminders
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS external_session_id TEXT,
  ADD COLUMN IF NOT EXISTS session_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS booking_status TEXT,
  ADD COLUMN IF NOT EXISTS booking_date DATE,
  ADD COLUMN IF NOT EXISTS booking_time TIME,
  ADD COLUMN IF NOT EXISTS booking_meet_link TEXT,
  ADD COLUMN IF NOT EXISTS booking_title TEXT,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_external_session_id
  ON whatsapp_sessions(external_session_id);

ALTER TABLE web_sessions
  ADD COLUMN IF NOT EXISTS booking_meet_link TEXT,
  ADD COLUMN IF NOT EXISTS booking_title TEXT,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT FALSE;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 05_unified_view.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Lead Scoring and Lifecycle System
-- Adds lead scoring, stage tracking, and auto-behaviors

-- Step 1: Add scoring and stage fields to all_leads table
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'New' CHECK (lead_stage IN (
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
ADD COLUMN IF NOT EXISTS sub_stage TEXT,
ADD COLUMN IF NOT EXISTS stage_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_active_chat BOOLEAN DEFAULT FALSE;

-- Step 2: Create indexes for scoring fields
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_score ON all_leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_stage ON all_leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_all_leads_sub_stage ON all_leads(sub_stage) WHERE sub_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_stage_override ON all_leads(stage_override) WHERE stage_override = TRUE;
CREATE INDEX IF NOT EXISTS idx_all_leads_is_active_chat ON all_leads(is_active_chat) WHERE is_active_chat = TRUE;

-- Step 3: Create lead_stage_changes table to log all stage transitions
CREATE TABLE IF NOT EXISTS lead_stage_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  old_sub_stage TEXT,
  new_sub_stage TEXT,
  old_score INTEGER,
  new_score INTEGER,
  changed_by UUID REFERENCES dashboard_users(id),
  change_reason TEXT,
  is_automatic BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Create indexes for lead_stage_changes
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_lead_id ON lead_stage_changes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_created_at ON lead_stage_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_new_stage ON lead_stage_changes(new_stage);

-- Step 5: Create lead_stage_overrides table to track manual overrides
CREATE TABLE IF NOT EXISTS lead_stage_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  overridden_stage TEXT NOT NULL,
  overridden_sub_stage TEXT,
  overridden_by UUID NOT NULL REFERENCES dashboard_users(id),
  override_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  removed_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Step 6: Create indexes for lead_stage_overrides
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_lead_id ON lead_stage_overrides(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_is_active ON lead_stage_overrides(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_created_at ON lead_stage_overrides(created_at DESC);

-- Step 7: Enable RLS on new tables
ALTER TABLE lead_stage_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_overrides ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies for lead_stage_changes
CREATE POLICY "Authenticated users can view lead_stage_changes"
  ON lead_stage_changes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert lead_stage_changes"
  ON lead_stage_changes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 9: Create RLS policies for lead_stage_overrides
CREATE POLICY "Authenticated users can view lead_stage_overrides"
  ON lead_stage_overrides FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert lead_stage_overrides"
  ON lead_stage_overrides FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update lead_stage_overrides"
  ON lead_stage_overrides FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Step 10: Create function to calculate lead score
-- Scoring Algorithm:
-- AI Analysis (60%): Engagement quality (20%), Intent signals (20%), Question depth (20%)
-- Activity (30%): Response rate, Days inactive, Touchpoints
-- Business (10%): Booking made (+50), Re-engaged (+20)
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  ai_score INTEGER := 0;
  activity_score INTEGER := 0;
  business_score INTEGER := 0;
  final_score INTEGER := 0;
  
  -- AI Analysis components
  engagement_quality_score INTEGER := 0;
  intent_signals_score INTEGER := 0;
  question_depth_score INTEGER := 0;
  
  -- Activity metrics
  response_rate NUMERIC := 0;
  days_inactive INTEGER := 0;
  touchpoint_count INTEGER := 0;
  
  -- Business metrics
  has_booking BOOLEAN := FALSE;
  is_reengaged BOOLEAN := FALSE;
  
  -- Lead data
  lead_data RECORD;
  last_interaction TIMESTAMP WITH TIME ZONE;
  message_count INTEGER := 0;
  conversation_summary TEXT;
  unified_context JSONB;
BEGIN
  -- Get lead data
  SELECT 
    al.*,
    COALESCE(ws.message_count, 0) + COALESCE(whs.message_count, 0) + COALESCE(vs.call_duration_seconds, 0) / 60 AS total_interactions,
    COALESCE(ws.conversation_summary, whs.conversation_summary, vs.call_summary) AS summary,
    al.unified_context
  INTO lead_data
  FROM all_leads al
  LEFT JOIN web_sessions ws ON ws.lead_id = al.id
  LEFT JOIN whatsapp_sessions whs ON whs.lead_id = al.id
  LEFT JOIN voice_sessions vs ON vs.lead_id = al.id
  WHERE al.id = lead_uuid;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  last_interaction := COALESCE(lead_data.last_interaction_at, lead_data.created_at);
  message_count := COALESCE(lead_data.total_interactions, 0);
  conversation_summary := lead_data.summary;
  unified_context := COALESCE(lead_data.unified_context, '{}'::jsonb);
  
  -- Calculate days inactive
  days_inactive := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  
  -- Count touchpoints (sessions across channels)
  SELECT COUNT(*) INTO touchpoint_count
  FROM (
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM voice_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM social_sessions WHERE lead_id = lead_uuid
  ) AS touchpoints;
  
  -- Check for booking
  SELECT EXISTS(
    SELECT 1 FROM web_sessions 
    WHERE lead_id = lead_uuid 
    AND booking_status IN ('pending', 'confirmed')
  ) INTO has_booking;
  
  -- AI Analysis (60% of total score = 60 points max)
  -- Engagement Quality (20% = 20 points max)
  IF message_count > 10 THEN
    engagement_quality_score := 20;
  ELSIF message_count > 5 THEN
    engagement_quality_score := 15;
  ELSIF message_count > 2 THEN
    engagement_quality_score := 10;
  ELSIF message_count > 0 THEN
    engagement_quality_score := 5;
  END IF;
  
  -- Intent Signals (20% = 20 points max)
  -- Check unified_context for intent keywords
  IF unified_context IS NOT NULL AND unified_context ? 'intent_signals' THEN
    intent_signals_score := LEAST(20, (unified_context->>'intent_signals')::INTEGER);
  ELSIF conversation_summary IS NOT NULL THEN
    -- Simple keyword matching for intent
    IF conversation_summary ILIKE '%interested%' OR 
       conversation_summary ILIKE '%want%' OR 
       conversation_summary ILIKE '%need%' OR
       conversation_summary ILIKE '%book%' OR
       conversation_summary ILIKE '%schedule%' THEN
      intent_signals_score := 15;
    ELSIF conversation_summary ILIKE '%price%' OR 
           conversation_summary ILIKE '%cost%' OR
           conversation_summary ILIKE '%information%' THEN
      intent_signals_score := 10;
    ELSE
      intent_signals_score := 5;
    END IF;
  END IF;
  
  -- Question Depth (20% = 20 points max)
  IF unified_context IS NOT NULL AND unified_context ? 'question_depth' THEN
    question_depth_score := LEAST(20, (unified_context->>'question_depth')::INTEGER);
  ELSIF message_count > 5 THEN
    question_depth_score := 15;
  ELSIF message_count > 2 THEN
    question_depth_score := 10;
  ELSE
    question_depth_score := 5;
  END IF;
  
  ai_score := engagement_quality_score + intent_signals_score + question_depth_score;
  
  -- Activity Score (30% of total = 30 points max)
  -- Response rate (based on message count and recency)
  IF days_inactive = 0 THEN
    response_rate := 1.0;
  ELSIF days_inactive <= 1 THEN
    response_rate := 0.8;
  ELSIF days_inactive <= 3 THEN
    response_rate := 0.6;
  ELSIF days_inactive <= 7 THEN
    response_rate := 0.4;
  ELSE
    response_rate := 0.2;
  END IF;
  
  -- Activity points: response rate (15 points) + touchpoints (10 points) - inactivity penalty (5 points)
  activity_score := ROUND((response_rate * 15) + LEAST(touchpoint_count * 2, 10) - LEAST(days_inactive / 7, 5));
  activity_score := GREATEST(0, activity_score);
  
  -- Business Score (10% of total, but can boost beyond 100)
  IF has_booking THEN
    business_score := 50; -- Major boost
  ELSIF days_inactive > 7 AND days_inactive <= 30 AND message_count > 0 THEN
    business_score := 20; -- Re-engaged
  END IF;
  
  -- Calculate final score (capped at 100, but business_score can push it over)
  final_score := ai_score + activity_score + business_score;
  final_score := LEAST(100, final_score);
  
  RETURN final_score;
END;
$$ LANGUAGE plpgsql;

-- Step 11: Create function to determine stage from score
CREATE OR REPLACE FUNCTION determine_lead_stage(score INTEGER, is_active_chat BOOLEAN, has_booking BOOLEAN)
RETURNS TEXT AS $$
BEGIN
  -- Manual stages (Converted, Closed Lost) are set manually, not by score
  -- This function only handles automatic stage assignment
  
  IF has_booking THEN
    RETURN 'Booking Made';
  ELSIF score >= 86 THEN
    RETURN 'Booking Made';
  ELSIF score >= 61 THEN
    RETURN 'High Intent';
  ELSIF score >= 31 THEN
    RETURN 'Qualified';
  ELSIF is_active_chat THEN
    RETURN 'Engaged';
  ELSIF score < 61 THEN
    RETURN 'In Sequence';
  ELSE
    RETURN 'New';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 12: Create function to update lead score and stage
CREATE OR REPLACE FUNCTION update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  new_score INTEGER;
  new_stage TEXT;
  old_stage TEXT;
  old_sub_stage TEXT;
  old_score INTEGER;
  has_booking BOOLEAN;
  is_active_chat BOOLEAN;
  has_override BOOLEAN;
  result JSONB;
BEGIN
  -- Get current state
  SELECT 
    lead_stage,
    sub_stage,
    lead_score,
    stage_override,
    is_active_chat,
    EXISTS(
      SELECT 1 FROM web_sessions 
      WHERE lead_id = lead_uuid 
      AND booking_status IN ('pending', 'confirmed')
    )
  INTO old_stage, old_sub_stage, old_score, has_override, is_active_chat, has_booking
  FROM all_leads
  WHERE id = lead_uuid;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  -- Calculate new score
  new_score := calculate_lead_score(lead_uuid);
  
  -- Determine new stage (only if no override)
  IF has_override THEN
    new_stage := old_stage; -- Keep current stage if overridden
  ELSE
    new_stage := determine_lead_stage(new_score, is_active_chat, has_booking);
  END IF;
  
  -- Update lead
  UPDATE all_leads
  SET 
    lead_score = new_score,
    lead_stage = new_stage,
    last_scored_at = NOW()
  WHERE id = lead_uuid;
  
  -- Log stage change if it changed
  IF old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score THEN
    INSERT INTO lead_stage_changes (
      lead_id,
      old_stage,
      new_stage,
      old_sub_stage,
      new_sub_stage,
      old_score,
      new_score,
      changed_by,
      is_automatic,
      change_reason
    ) VALUES (
      lead_uuid,
      old_stage,
      new_stage,
      old_sub_stage,
      NULL,
      old_score,
      new_score,
      user_uuid,
      NOT has_override,
      CASE WHEN has_override THEN 'Manual override maintained' ELSE 'Automatic score-based update' END
    );
  END IF;
  
  RETURN jsonb_build_object(
    'lead_id', lead_uuid,
    'old_score', old_score,
    'new_score', new_score,
    'old_stage', old_stage,
    'new_stage', new_stage,
    'updated_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Step 13: Create trigger to auto-update score after interaction
CREATE OR REPLACE FUNCTION trigger_update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Update score when messages are added or sessions are updated
  PERFORM update_lead_score_and_stage(NEW.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to messages table
DROP TRIGGER IF EXISTS trigger_messages_update_score ON messages;
CREATE TRIGGER trigger_messages_update_score
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lead_score();

-- Step 14: Create function to check for no response (24 hours)
CREATE OR REPLACE FUNCTION check_no_response_leads()
RETURNS void AS $$
BEGIN
  -- Update leads with no response in 24 hours to "No Response" status
  UPDATE all_leads
  SET status = 'RNR (No Response)'
  WHERE last_interaction_at < NOW() - INTERVAL '24 hours'
    AND is_active_chat = FALSE
    AND status != 'RNR (No Response)'
    AND status != 'Closed'
    AND status != 'Converted';
END;
$$ LANGUAGE plpgsql;

-- Step 15: Create function to push low-score leads to sequence
CREATE OR REPLACE FUNCTION push_low_score_to_sequence()
RETURNS void AS $$
BEGIN
  -- Push leads with score < 61 to "In Sequence" stage
  UPDATE all_leads
  SET lead_stage = 'In Sequence'
  WHERE lead_score < 61
    AND lead_stage NOT IN ('In Sequence', 'Cold', 'Converted', 'Closed Lost')
    AND stage_override = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Step 16: Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_lead_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION determine_lead_stage(INTEGER, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION update_lead_score_and_stage(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_no_response_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION push_low_score_to_sequence() TO authenticated;

-- Migration complete!


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 06_scoring.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: PROXe Lead Scoring Database Schema
-- Sets up lead scoring columns, stage_history table, and triggers
-- Note: Using 'all_leads' table (the main leads table in this system)

-- Step 1: ALTER all_leads table - add lead scoring columns
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS sub_stage TEXT NULL,
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS no_response_since TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS days_inactive INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_touchpoints INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sequence_id TEXT NULL,
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS override_by TEXT NULL,
ADD COLUMN IF NOT EXISTS override_at TIMESTAMP WITH TIME ZONE NULL;

-- Note: last_interaction_at already exists in all_leads, but we ensure it's set correctly
-- Update existing rows to set last_interaction_at if null
UPDATE all_leads
SET last_interaction_at = COALESCE(last_interaction_at, created_at, NOW())
WHERE last_interaction_at IS NULL;

-- Step 2: CREATE stage_history table
CREATE TABLE IF NOT EXISTS stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  score_at_change INTEGER,
  changed_by TEXT NOT NULL, -- values: 'system' or user_id
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT NULL
);

-- Step 3: CREATE indexes for query performance
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_stage ON all_leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_score ON all_leads(lead_score);
CREATE INDEX IF NOT EXISTS idx_all_leads_last_interaction_at ON all_leads(last_interaction_at DESC);

-- Additional useful indexes
CREATE INDEX IF NOT EXISTS idx_all_leads_sequence_id ON all_leads(sequence_id) WHERE sequence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_is_manual_override ON all_leads(is_manual_override) WHERE is_manual_override = true;
CREATE INDEX IF NOT EXISTS idx_all_leads_days_inactive ON all_leads(days_inactive);

-- Indexes for stage_history table
CREATE INDEX IF NOT EXISTS idx_stage_history_lead_id ON stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_at ON stage_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_history_new_stage ON stage_history(new_stage);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_by ON stage_history(changed_by);

-- Step 4: CREATE database trigger function
-- This function will be called when lead_stage is updated
CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert into stage_history if the stage actually changed
  IF OLD.lead_stage IS DISTINCT FROM NEW.lead_stage THEN
    INSERT INTO stage_history (
      lead_id,
      old_stage,
      new_stage,
      score_at_change,
      changed_by,
      changed_at,
      reason
    ) VALUES (
      NEW.id,
      OLD.lead_stage,
      NEW.lead_stage,
      NEW.lead_score,
      COALESCE(NEW.override_by, 'system'),
      NOW(),
      CASE 
        WHEN NEW.is_manual_override THEN 'Manual override'
        ELSE 'System update'
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: CREATE trigger on all_leads.lead_stage UPDATE
DROP TRIGGER IF EXISTS trigger_log_stage_change ON all_leads;
CREATE TRIGGER trigger_log_stage_change
  AFTER UPDATE OF lead_stage ON all_leads
  FOR EACH ROW
  WHEN (OLD.lead_stage IS DISTINCT FROM NEW.lead_stage)
  EXECUTE FUNCTION log_stage_change();

-- Step 6: Enable RLS on stage_history table
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for stage_history
CREATE POLICY "Authenticated users can view stage_history"
  ON stage_history FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert stage_history"
  ON stage_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Grant access to authenticated users
GRANT SELECT, INSERT ON stage_history TO authenticated;

-- Migration complete!
-- The trigger will automatically log all stage changes to stage_history table


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 07_activities.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: PROXe Lead Scoring and Activity Tracking System
-- Complete implementation with AI scoring, activity tracking, and unified summary

-- Step 1: Ensure all required fields exist in all_leads table
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS sub_stage TEXT NULL,
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS days_inactive INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_touchpoints INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false;

-- Update existing rows to set last_interaction_at if null
UPDATE all_leads
SET last_interaction_at = COALESCE(last_interaction_at, created_at, NOW())
WHERE last_interaction_at IS NULL;

-- Step 2: Rename lead_activities to activities (if it exists as lead_activities)
-- First check if lead_activities exists, if so rename it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_activities') THEN
    ALTER TABLE lead_activities RENAME TO activities;
  END IF;
END $$;

-- Step 3: Create activities table if it doesn't exist (or ensure it has correct structure)
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  -- No CHECK: core's noteOrchestrator also writes 'automation' (and future
  -- types); the original (call|meeting|message|note) list rejected them.
  activity_type TEXT NOT NULL,
  note TEXT NOT NULL,
  duration_minutes INTEGER NULL,
  next_followup_date TIMESTAMP WITH TIME ZONE NULL,
  -- Nullable: core writes user.id when a human acted, NULL for automated
  -- activity. FK kept for the dashboard_users PostgREST embeds.
  created_by UUID NULL REFERENCES dashboard_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for activities
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_activity_type ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_activities_next_followup_date ON activities(next_followup_date) WHERE next_followup_date IS NOT NULL;

-- Enable RLS on activities
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for activities
DROP POLICY IF EXISTS "Authenticated users can view activities" ON activities;
CREATE POLICY "Authenticated users can view activities"
  ON activities FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert activities" ON activities;
CREATE POLICY "Authenticated users can insert activities"
  ON activities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 4: Ensure stage_history table exists with correct structure
CREATE TABLE IF NOT EXISTS stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  score_at_change INTEGER,
  changed_by TEXT NOT NULL, -- values: 'PROXe AI', 'system', or user_id
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for stage_history
CREATE INDEX IF NOT EXISTS idx_stage_history_lead_id ON stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_at ON stage_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_history_new_stage ON stage_history(new_stage);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_by ON stage_history(changed_by);

-- Enable RLS on stage_history
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for stage_history
DROP POLICY IF EXISTS "Authenticated users can view stage_history" ON stage_history;
CREATE POLICY "Authenticated users can view stage_history"
  ON stage_history FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert stage_history" ON stage_history;
CREATE POLICY "Authenticated users can insert stage_history"
  ON stage_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 5: Create function to update lead metrics (response_count, total_touchpoints, days_inactive)
CREATE OR REPLACE FUNCTION update_lead_metrics(lead_uuid UUID)
RETURNS void AS $$
DECLARE
  msg_count INTEGER;
  touchpoint_count INTEGER;
  last_interaction TIMESTAMP WITH TIME ZONE;
  days_inactive_calc INTEGER;
BEGIN
  -- Count messages from customer
  SELECT COUNT(*) INTO msg_count
  FROM messages
  WHERE lead_id = lead_uuid AND sender = 'customer';
  
  -- Count touchpoints (sessions across channels)
  SELECT COUNT(*) INTO touchpoint_count
  FROM (
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM voice_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM social_sessions WHERE lead_id = lead_uuid
  ) AS touchpoints;
  
  -- Get last interaction
  SELECT COALESCE(MAX(created_at), created_at) INTO last_interaction
  FROM messages
  WHERE lead_id = lead_uuid;
  
  -- Calculate days inactive
  IF last_interaction IS NOT NULL THEN
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  ELSE
    SELECT created_at INTO last_interaction FROM all_leads WHERE id = lead_uuid;
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  END IF;
  
  -- Update lead
  UPDATE all_leads
  SET 
    response_count = msg_count,
    total_touchpoints = touchpoint_count,
    days_inactive = GREATEST(0, days_inactive_calc),
    last_interaction_at = COALESCE(last_interaction, last_interaction_at, created_at)
  WHERE id = lead_uuid;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger function to update metrics when messages are inserted
CREATE OR REPLACE FUNCTION trigger_update_lead_metrics()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_lead_metrics(NEW.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_messages_update_metrics ON messages;

-- Create trigger on messages table
CREATE TRIGGER trigger_messages_update_metrics
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lead_metrics();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_lead_metrics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_update_lead_metrics() TO authenticated;

-- Step 7: Create function to trigger AI scoring (called from application code)
-- Note: This function can be called from application code when messages are inserted
-- For automatic triggering, set up a webhook or call /api/webhooks/message-created from your application
CREATE OR REPLACE FUNCTION trigger_ai_scoring(lead_uuid UUID)
RETURNS void AS $$
BEGIN
  -- This function is a placeholder - actual scoring is done via API endpoint
  -- Application code should call: POST /api/webhooks/message-created with { lead_id: lead_uuid }
  -- Or directly: POST /api/leads/score with { lead_id: lead_uuid }
  PERFORM 1; -- No-op, just to make function valid
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION trigger_ai_scoring(UUID) TO authenticated;

-- Migration complete!
-- 
-- SETUP INSTRUCTIONS:
-- 1. AI scoring is triggered via API endpoint: POST /api/leads/score
-- 2. Call this endpoint from your message insertion code, or set up a webhook
-- 3. For automatic scoring on message insert, call /api/webhooks/message-created from your application
-- 4. Set up daily cron job to call: POST /api/leads/rescore-all with Authorization: Bearer <CRON_SECRET>
-- 5. Ensure CLAUDE_API_KEY is set in your environment variables


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 08_stage_tracking.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Fix Lead Stage RLS and Column Consistency
-- Ensures all columns exist and RLS policies are correct for updates

-- Step 1: Ensure both stage_override and is_manual_override columns exist
-- (Some migrations use different names, we'll keep both for compatibility)
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS stage_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;

-- Step 2: Sync the two columns - if one is true, set the other to true
-- Create a function to keep them in sync
CREATE OR REPLACE FUNCTION sync_stage_override_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- If stage_override is set, also set is_manual_override
  IF NEW.stage_override IS TRUE THEN
    NEW.is_manual_override := TRUE;
  ELSIF NEW.is_manual_override IS TRUE THEN
    NEW.stage_override := TRUE;
  ELSIF NEW.stage_override IS FALSE AND NEW.is_manual_override IS FALSE THEN
    -- Both false, keep them in sync
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_stage_override ON all_leads;

-- Create trigger to sync columns
CREATE TRIGGER trigger_sync_stage_override
  BEFORE UPDATE OF stage_override, is_manual_override ON all_leads
  FOR EACH ROW
  EXECUTE FUNCTION sync_stage_override_columns();

-- Step 3: Ensure both stage_history and lead_stage_changes tables exist
-- (Some code uses one, some uses the other - we'll ensure both work)

-- Create lead_stage_changes if it doesn't exist (for compatibility)
-- Match the schema from migration 011
CREATE TABLE IF NOT EXISTS lead_stage_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  old_sub_stage TEXT,
  new_sub_stage TEXT,
  old_score INTEGER,
  new_score INTEGER,
  changed_by UUID REFERENCES dashboard_users(id),
  change_reason TEXT,
  is_automatic BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for lead_stage_changes
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_lead_id ON lead_stage_changes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_created_at ON lead_stage_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_new_stage ON lead_stage_changes(new_stage);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_changed_by ON lead_stage_changes(changed_by);

-- Enable RLS on lead_stage_changes
ALTER TABLE lead_stage_changes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for lead_stage_changes
DROP POLICY IF EXISTS "Authenticated users can view lead_stage_changes" ON lead_stage_changes;
CREATE POLICY "Authenticated users can view lead_stage_changes"
  ON lead_stage_changes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_changes" ON lead_stage_changes;
CREATE POLICY "Authenticated users can insert lead_stage_changes"
  ON lead_stage_changes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 4: Ensure stage_history has UPDATE policy if needed
-- (Currently it only has SELECT and INSERT, which should be fine)

-- Step 5: Verify and fix RLS policies for all_leads UPDATE
-- Ensure the UPDATE policy exists and allows authenticated users
DROP POLICY IF EXISTS "Authenticated users can update all_leads" ON all_leads;
CREATE POLICY "Authenticated users can update all_leads"
  ON all_leads FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Step 6: Ensure activities table has proper RLS policies
-- Verify UPDATE policy exists for activities (if needed for updates)
DROP POLICY IF EXISTS "Authenticated users can update activities" ON activities;
CREATE POLICY "Authenticated users can update activities"
  ON activities FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Step 7: Ensure lead_stage_overrides has UPDATE policy
-- (Already exists from migration 011, but ensure it's correct)
DROP POLICY IF EXISTS "Authenticated users can update lead_stage_overrides" ON lead_stage_overrides;
CREATE POLICY "Authenticated users can update lead_stage_overrides"
  ON lead_stage_overrides FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Migration complete!
-- This ensures:
-- 1. Both stage_override and is_manual_override columns exist and stay in sync
-- 2. Both stage_history and lead_stage_changes tables exist for compatibility
-- 3. All RLS policies allow authenticated users to UPDATE records
-- 4. All necessary indexes are created


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 09_scoring_trigger.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Fix Lead Scoring Trigger
-- The trigger function calls update_lead_score_and_stage with only lead_id,
-- but the function requires user_uuid as well. This migration fixes the trigger.

-- Step 1: Fix the trigger function to handle missing user_uuid
CREATE OR REPLACE FUNCTION trigger_update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Update score when messages are added
  -- Use NULL for user_uuid since triggers don't have user context
  -- The function accepts NULL for user_uuid
  PERFORM update_lead_score_and_stage(NEW.lead_id, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Ensure the trigger exists and is properly attached
DROP TRIGGER IF EXISTS trigger_messages_update_score ON messages;
CREATE TRIGGER trigger_messages_update_score
  AFTER INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION trigger_update_lead_score();

-- Step 3: Verify update_lead_score_and_stage handles NULL user_uuid
-- Update the function to handle NULL user_uuid gracefully
CREATE OR REPLACE FUNCTION update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  new_score INTEGER;
  new_stage TEXT;
  old_stage TEXT;
  old_sub_stage TEXT;
  old_score INTEGER;
  has_override BOOLEAN;
  is_active_chat BOOLEAN;
  has_booking BOOLEAN;
  result JSONB;
BEGIN
  -- Get current state
  SELECT 
    lead_stage,
    sub_stage,
    lead_score,
    stage_override,
    is_active_chat,
    EXISTS(
      SELECT 1 FROM web_sessions 
      WHERE lead_id = lead_uuid 
      AND booking_status IN ('pending', 'confirmed')
    )
  INTO old_stage, old_sub_stage, old_score, has_override, is_active_chat, has_booking
  FROM all_leads
  WHERE id = lead_uuid;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  -- Calculate new score
  new_score := calculate_lead_score(lead_uuid);
  
  -- Determine new stage (only if no override)
  IF has_override THEN
    new_stage := old_stage; -- Keep current stage if overridden
  ELSE
    new_stage := determine_lead_stage(new_score, is_active_chat, has_booking);
  END IF;
  
  -- Update lead
  UPDATE all_leads
  SET 
    lead_score = new_score,
    lead_stage = new_stage,
    last_scored_at = NOW()
  WHERE id = lead_uuid;
  
  -- Log stage change if it changed (only if user_uuid is provided)
  IF (old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score) AND user_uuid IS NOT NULL THEN
    INSERT INTO lead_stage_changes (
      lead_id,
      old_stage,
      new_stage,
      old_sub_stage,
      new_sub_stage,
      old_score,
      new_score,
      changed_by,
      is_automatic,
      change_reason
    ) VALUES (
      lead_uuid,
      old_stage,
      new_stage,
      old_sub_stage,
      NULL,
      old_score,
      new_score,
      user_uuid,
      NOT has_override,
      CASE WHEN has_override THEN 'Manual override maintained' ELSE 'Automatic score-based update' END
    );
  END IF;
  
  RETURN jsonb_build_object(
    'lead_id', lead_uuid,
    'old_score', old_score,
    'new_score', new_score,
    'old_stage', old_stage,
    'new_stage', new_stage,
    'updated_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Migration complete!
-- This ensures:
-- 1. The trigger properly calls update_lead_score_and_stage with NULL user_uuid
-- 2. The trigger only fires when lead_id is NOT NULL
-- 3. The update function handles NULL user_uuid gracefully (doesn't log stage changes without user)


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 10_conversations_rename.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Rename messages table to conversations
-- This migration renames the messages table to conversations for better clarity

-- Step 1: Rename the table (only if it still exists as messages)
-- Use EXECUTE to prevent parsing errors when table doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations') THEN
    EXECUTE 'ALTER TABLE messages RENAME TO conversations';
  END IF;
END $$;

-- Step 2: Rename indexes (only if they still exist with old names)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_lead_id') THEN
    ALTER INDEX idx_messages_lead_id RENAME TO idx_conversations_lead_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_channel') THEN
    ALTER INDEX idx_messages_channel RENAME TO idx_conversations_channel;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_created_at') THEN
    ALTER INDEX idx_messages_created_at RENAME TO idx_conversations_created_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_lead_channel') THEN
    ALTER INDEX idx_messages_lead_channel RENAME TO idx_conversations_lead_channel;
  END IF;
END $$;

-- Step 3: Update RLS policies (drop old, create new with same permissions)
-- Drop all possible policy names (old and new) before creating
DROP POLICY IF EXISTS "Allow all users to view messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can view messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to view conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON conversations;

-- Create new policies with updated names
CREATE POLICY "Allow all users to view conversations"
  ON conversations FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

-- Step 4: Update triggers that reference messages table
-- Drop old trigger if it exists, create new one
DROP TRIGGER IF EXISTS trigger_messages_update_score ON conversations;
DROP TRIGGER IF EXISTS trigger_conversations_update_score ON conversations;
CREATE TRIGGER trigger_conversations_update_score
  AFTER INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lead_score();

-- Step 5: Update Realtime publication
-- Remove messages from realtime, add conversations (if not already added)
DO $$
BEGIN
  -- Remove old table from realtime
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  END IF;
  
  -- Add new table to realtime (only if not already added)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

-- Step 6: Update functions that reference messages table
-- Update calculate_lead_score function to use conversations table
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  msg_count INTEGER;
  touchpoint_count INTEGER;
  last_interaction TIMESTAMP WITH TIME ZONE;
  days_inactive_calc INTEGER;
BEGIN
  -- Count messages from customer
  SELECT COUNT(*) INTO msg_count
  FROM conversations
  WHERE lead_id = lead_uuid AND sender = 'customer';
  
  -- Count touchpoints (sessions across channels)
  SELECT COUNT(*) INTO touchpoint_count
  FROM (
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM voice_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM social_sessions WHERE lead_id = lead_uuid
  ) AS touchpoints;
  
  -- Get last interaction
  SELECT COALESCE(MAX(created_at), created_at) INTO last_interaction
  FROM conversations
  WHERE lead_id = lead_uuid;
  
  -- Calculate days inactive
  IF last_interaction IS NOT NULL THEN
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  ELSE
    SELECT created_at INTO last_interaction FROM all_leads WHERE id = lead_uuid;
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  END IF;
  
  -- Scoring logic (same as before, just using conversations table)
  -- Message count: 10 points per message (max 50)
  score := score + LEAST(msg_count * 10, 50);
  
  -- Touchpoints: 15 points per touchpoint (max 60)
  score := score + LEAST(touchpoint_count * 15, 60);
  
  -- Recency: 20 points if active in last 24h, 10 if last 7 days, 0 otherwise
  IF days_inactive_calc <= 1 THEN
    score := score + 20;
  ELSIF days_inactive_calc <= 7 THEN
    score := score + 10;
  END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Migration complete!
-- All references to 'messages' table should now use 'conversations'


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 11_rls_loosen.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Disable Authentication Requirements for RLS
-- Since authentication is disabled, update all RLS policies to allow access without auth

-- Step 1: Update all_leads RLS policies
DROP POLICY IF EXISTS "Authenticated users can view all_leads" ON all_leads;
        DROP POLICY IF EXISTS "Allow all users to view all_leads" ON all_leads;
CREATE POLICY "Allow all users to view all_leads"
  ON all_leads FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert all_leads" ON all_leads;
DROP POLICY IF EXISTS "Allow all users to insert all_leads" ON all_leads;
CREATE POLICY "Allow all users to insert all_leads"
  ON all_leads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all_leads" ON all_leads;
DROP POLICY IF EXISTS "Allow all users to update all_leads" ON all_leads;
CREATE POLICY "Allow all users to update all_leads"
  ON all_leads FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Step 2: Update conversations RLS policies (messages table renamed to conversations)
DROP POLICY IF EXISTS "Authenticated users can view messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to view messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all users to view conversations" ON conversations;
CREATE POLICY "Allow all users to view conversations"
  ON conversations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert conversations" ON conversations;
CREATE POLICY "Allow all users to insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

-- Step 3: Update web_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view web_sessions" ON web_sessions;
DROP POLICY IF EXISTS "Allow all users to view web_sessions" ON web_sessions;
CREATE POLICY "Allow all users to view web_sessions"
  ON web_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert web_sessions" ON web_sessions;
DROP POLICY IF EXISTS "Allow all users to insert web_sessions" ON web_sessions;
CREATE POLICY "Allow all users to insert web_sessions"
  ON web_sessions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update web_sessions" ON web_sessions;
DROP POLICY IF EXISTS "Allow all users to update web_sessions" ON web_sessions;
CREATE POLICY "Allow all users to update web_sessions"
  ON web_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Step 4: Update whatsapp_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Allow all users to view whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Allow all users to view whatsapp_sessions"
  ON whatsapp_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert whatsapp_sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Allow all users to insert whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Allow all users to insert whatsapp_sessions"
  ON whatsapp_sessions FOR INSERT
  WITH CHECK (true);

-- Step 5: Update voice_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view voice_sessions" ON voice_sessions;
DROP POLICY IF EXISTS "Allow all users to view voice_sessions" ON voice_sessions;
CREATE POLICY "Allow all users to view voice_sessions"
  ON voice_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert voice_sessions" ON voice_sessions;
DROP POLICY IF EXISTS "Allow all users to insert voice_sessions" ON voice_sessions;
CREATE POLICY "Allow all users to insert voice_sessions"
  ON voice_sessions FOR INSERT
  WITH CHECK (true);

-- Step 6: Update social_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view social_sessions" ON social_sessions;
DROP POLICY IF EXISTS "Allow all users to view social_sessions" ON social_sessions;
CREATE POLICY "Allow all users to view social_sessions"
  ON social_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert social_sessions" ON social_sessions;
DROP POLICY IF EXISTS "Allow all users to insert social_sessions" ON social_sessions;
CREATE POLICY "Allow all users to insert social_sessions"
  ON social_sessions FOR INSERT
  WITH CHECK (true);

-- Step 7: Update lead_activities RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_activities') THEN
    DROP POLICY IF EXISTS "Authenticated users can view lead_activities" ON lead_activities;
    DROP POLICY IF EXISTS "Allow all users to view lead_activities" ON lead_activities;
    CREATE POLICY "Allow all users to view lead_activities"
      ON lead_activities FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert lead_activities" ON lead_activities;
    DROP POLICY IF EXISTS "Allow all users to insert lead_activities" ON lead_activities;
    CREATE POLICY "Allow all users to insert lead_activities"
      ON lead_activities FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Step 8: Update lead_stage_changes RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_stage_changes') THEN
    DROP POLICY IF EXISTS "Authenticated users can view lead_stage_changes" ON lead_stage_changes;
    DROP POLICY IF EXISTS "Allow all users to view lead_stage_changes" ON lead_stage_changes;
    CREATE POLICY "Allow all users to view lead_stage_changes"
      ON lead_stage_changes FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_changes" ON lead_stage_changes;
    DROP POLICY IF EXISTS "Allow all users to insert lead_stage_changes" ON lead_stage_changes;
    CREATE POLICY "Allow all users to insert lead_stage_changes"
      ON lead_stage_changes FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Step 9: Update activities RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activities') THEN
    DROP POLICY IF EXISTS "Authenticated users can view activities" ON activities;
    DROP POLICY IF EXISTS "Allow all users to view activities" ON activities;
    CREATE POLICY "Allow all users to view activities"
      ON activities FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert activities" ON activities;
    DROP POLICY IF EXISTS "Allow all users to insert activities" ON activities;
    CREATE POLICY "Allow all users to insert activities"
      ON activities FOR INSERT
      WITH CHECK (true);

    DROP POLICY IF EXISTS "Authenticated users can update activities" ON activities;
    DROP POLICY IF EXISTS "Allow all users to update activities" ON activities;
    CREATE POLICY "Allow all users to update activities"
      ON activities FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Step 10: Update lead_stage_overrides RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_stage_overrides') THEN
    DROP POLICY IF EXISTS "Authenticated users can view lead_stage_overrides" ON lead_stage_overrides;
    DROP POLICY IF EXISTS "Allow all users to view lead_stage_overrides" ON lead_stage_overrides;
    CREATE POLICY "Allow all users to view lead_stage_overrides"
      ON lead_stage_overrides FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_overrides" ON lead_stage_overrides;
    DROP POLICY IF EXISTS "Allow all users to insert lead_stage_overrides" ON lead_stage_overrides;
    CREATE POLICY "Allow all users to insert lead_stage_overrides"
      ON lead_stage_overrides FOR INSERT
      WITH CHECK (true);

    DROP POLICY IF EXISTS "Authenticated users can update lead_stage_overrides" ON lead_stage_overrides;
    DROP POLICY IF EXISTS "Allow all users to update lead_stage_overrides" ON lead_stage_overrides;
    CREATE POLICY "Allow all users to update lead_stage_overrides"
      ON lead_stage_overrides FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Step 11: Update stage_history RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stage_history') THEN
    DROP POLICY IF EXISTS "Authenticated users can view stage_history" ON stage_history;
    DROP POLICY IF EXISTS "Allow all users to view stage_history" ON stage_history;
    CREATE POLICY "Allow all users to view stage_history"
      ON stage_history FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert stage_history" ON stage_history;
    DROP POLICY IF EXISTS "Allow all users to insert stage_history" ON stage_history;
    CREATE POLICY "Allow all users to insert stage_history"
      ON stage_history FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Step 12: Update dashboard_leads RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dashboard_leads') THEN
    DROP POLICY IF EXISTS "Authenticated users can view dashboard_leads" ON dashboard_leads;
    DROP POLICY IF EXISTS "Allow all users to view dashboard_leads" ON dashboard_leads;
    CREATE POLICY "Allow all users to view dashboard_leads"
      ON dashboard_leads FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert dashboard_leads" ON dashboard_leads;
    DROP POLICY IF EXISTS "Allow all users to insert dashboard_leads" ON dashboard_leads;
    CREATE POLICY "Allow all users to insert dashboard_leads"
      ON dashboard_leads FOR INSERT
      WITH CHECK (true);

    DROP POLICY IF EXISTS "Authenticated users can update dashboard_leads" ON dashboard_leads;
    DROP POLICY IF EXISTS "Allow all users to update dashboard_leads" ON dashboard_leads;
    CREATE POLICY "Allow all users to update dashboard_leads"
      ON dashboard_leads FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Step 13: Grant SELECT on unified_leads view to anon role (for unauthenticated access)
-- (fresh-bootstrap: unified_leads GRANT removed — view created + granted in block 20)
-- (fresh-bootstrap: unified_leads GRANT removed — view created + granted in block 20)

-- Migration complete!


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 12_delivery_receipts.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- ============================================================================
-- Lokazen — WhatsApp delivery + read receipts (replicates Windchasers)
-- ============================================================================
-- WHY: Lokazen's `conversations` table was created with only the base columns
-- (channel, content, created_at, id, lead_id, message_type, metadata, sender).
-- The delivery-status code (core/src/app/api/agent/whatsapp/meta/route.ts →
-- handleStatusUpdates, and the inbox delivery ticks) writes/reads
-- delivered_at / read_at / delivery_status, which DID NOT EXIST on this DB —
-- so every Meta status webhook update threw and was swallowed, and no
-- delivered/read receipt ever showed. Windchasers' Supabase already has these
-- (its migrations 003 + 019); this file brings Lokazen to parity.
--
-- Run once in the Lokazen Supabase SQL editor (project egwwpngaoaeqemieawcx).
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Read-receipt timestamp columns (Windchasers migration 003) ---------------
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS read_at      timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 2. Delivery-status columns (Windchasers migration 019) ----------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
  CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status_error      TEXT;

-- 3. Lead cooldown for failed sends -------------------------------------------
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS follow_up_cooldown_until TIMESTAMPTZ;

-- 4. Indexes for fast webhook lookups by WhatsApp message id (wamid) ----------
-- The status webhook matches on metadata->>wa_message_id; the sync cron also
-- checks metadata->>whatsapp_message_id. Index both shapes.
CREATE INDEX IF NOT EXISTS idx_conversations_wa_message_id
  ON conversations USING BTREE ((metadata->>'wa_message_id'))
  WHERE metadata->>'wa_message_id' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_message_id
  ON conversations USING BTREE ((metadata->>'whatsapp_message_id'))
  WHERE metadata->>'whatsapp_message_id' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_delivery_status
  ON conversations(delivery_status) WHERE delivery_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_cooldown
  ON all_leads(follow_up_cooldown_until) WHERE follow_up_cooldown_until IS NOT NULL;

-- 5. Race-condition queue (webhook arrives before the send row is written) -----
CREATE TABLE IF NOT EXISTS status_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_sync_queue_unprocessed
  ON status_sync_queue(created_at) WHERE processed_at IS NULL;
GRANT ALL ON status_sync_queue TO authenticated, anon;

-- 6. Live dashboard updates ---------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 7. Backfill existing rows so old sends don't all read as "no receipt" -------
UPDATE conversations SET delivery_status = 'sent', status_updated_at = created_at
  WHERE channel = 'whatsapp' AND sender = 'agent' AND delivery_status IS NULL;
UPDATE conversations SET delivery_status = 'read', status_updated_at = created_at
  WHERE channel = 'whatsapp' AND sender = 'customer' AND delivery_status IS NULL;

-- ============================================================================
-- Done. Delivered/read receipts will populate as Meta posts status webhooks to
-- /api/agent/whatsapp/meta. Ensure the Lokazen Meta app's webhook is subscribed
-- to the `messages` field (which carries statuses) and points at this deployment.
-- ============================================================================


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 13_agent_tasks.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- ============================================================================
-- windchasers_task_template_parity.sql
-- Purpose:
--   Create missing task + template tables for Windchasers parity.
-- Scope:
--   DDL only (tables, constraints, indexes). No data mutations.
--
-- Notes:
-- - BCON migration files in brands/bcon/supabase/migrations reference
--   agent_tasks and follow_up_templates but do not include CREATE TABLE for them.
-- - Canonical CREATE TABLE shapes were taken from:
--   - master/agent/scripts/create-agent-tasks.sql
--   - master/supabase/migrations/021_add_flow_stages.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) agent_tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'proxe',
  lead_id UUID REFERENCES public.all_leads(id),
  lead_name TEXT,
  lead_phone TEXT,
  task_type TEXT NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status
  ON public.agent_tasks(status);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled
  ON public.agent_tasks(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_brand
  ON public.agent_tasks(brand);

-- Helpful for common query patterns in dashboard + engine
CREATE INDEX IF NOT EXISTS idx_agent_tasks_lead_id
  ON public.agent_tasks(lead_id);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_lead_phone
  ON public.agent_tasks(lead_phone);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_task_type
  ON public.agent_tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at
  ON public.agent_tasks(created_at DESC);

-- ----------------------------------------------------------------------------
-- 2) follow_up_templates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follow_up_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'default',

  -- Stage and timing
  stage TEXT NOT NULL CHECK (stage IN (
    'one_touch', 'low_touch', 'engaged', 'high_intent',
    'booking_made', 'no_show', 'demo_taken', 'proposal_sent', 'converted'
  )),
  day INTEGER NOT NULL CHECK (day IN (1, 3, 7, 30, 90)),

  -- Channel and variant
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'voice', 'sms', 'email')),
  variant TEXT NOT NULL DEFAULT 'A' CHECK (variant IN ('A', 'B', 'C')),

  -- Meta template info
  meta_template_name TEXT,
  meta_template_id TEXT,
  meta_status TEXT DEFAULT 'pending' CHECK (meta_status IN ('pending', 'approved', 'rejected')),
  meta_rejection_reason TEXT,

  -- Content
  content TEXT NOT NULL,
  language TEXT DEFAULT 'en',

  -- Template rotation tracking
  current_variant TEXT DEFAULT 'A' CHECK (current_variant IN ('A', 'B', 'C')),
  send_count INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,

  -- Required unique constraint for ON CONFLICT (brand, stage, day, channel, variant)
  CONSTRAINT follow_up_templates_brand_stage_day_channel_variant_key
    UNIQUE (brand, stage, day, channel, variant)
);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_stage
  ON public.follow_up_templates(stage);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_day
  ON public.follow_up_templates(day);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_channel
  ON public.follow_up_templates(channel);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_meta_status
  ON public.follow_up_templates(meta_status);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_active
  ON public.follow_up_templates(is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_lookup
  ON public.follow_up_templates(brand, stage, day, channel, is_active);


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 14_agent_tasks_update.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Ensure agent_tasks has all columns needed by the task worker.
-- Run in Supabase SQL editor for the BCON project.
-- Safe to run multiple times (all statements use IF NOT EXISTS / IF EXISTS).

-- Add columns that may be missing from the original create-agent-tasks.sql
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lead_name TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add composite indexes for the task worker queries
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_scheduled ON agent_tasks(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type_lead ON agent_tasks(task_type, lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type_phone ON agent_tasks(task_type, lead_phone);


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 15_agent_tasks_cascade.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 032_agent_tasks_cascade_on_lead_delete.sql
--
-- Make agent_tasks.lead_id cascade when a lead is deleted.
--
-- Background: chat-originated leads always get a nudge_waiting agent_task
-- created at the engine level. The agent_tasks.lead_id FK was NO ACTION,
-- and the dashboard's per-lead DELETE handler tried to pre-delete the task
-- but the call was silently filtered out by RLS (no authenticated DELETE
-- policy on agent_tasks). The parent all_leads delete then failed on the
-- FK violation, leaving the lead undeletable from the UI.
--
-- Sibling tables (conversations, activities, messages, lead_stage_changes,
-- lead_stage_overrides, social_sessions, voice_sessions, whatsapp_sessions)
-- already cascade on lead delete; web_sessions uses SET NULL. agent_tasks
-- was the lone NO ACTION.

ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_lead_id_fkey;

ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES all_leads(id) ON DELETE CASCADE;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 16_sync_parity.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- ============================================================================
-- windchasers_sync_migrations.sql
-- Combined, idempotent rollout of BCON-origin migrations 001–007 & 999,
-- plus Windchasers all_leads column additions. Safe to run multiple times:
-- uses ADD COLUMN IF NOT EXISTS, CREATE IF NOT EXISTS, DROP IF EXISTS + ADD
-- for CHECK constraints, conditional changelog seeds, and guarded UPDATEs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- all_leads: extra columns (Windchasers sync) + follow-up tracking (999)
-- ----------------------------------------------------------------------------
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS needs_human_followup BOOLEAN DEFAULT FALSE;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS days_inactive INTEGER DEFAULT 0;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS total_touchpoints INTEGER DEFAULT 0;

ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS last_follow_up_sent_at TIMESTAMPTZ;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS last_follow_up_template TEXT;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS follow_up_cooldown_until TIMESTAMPTZ;

COMMENT ON COLUMN all_leads.needs_human_followup IS 'When true, automated follow-ups must not run; human owns next step.';
COMMENT ON COLUMN all_leads.metadata IS 'Arbitrary JSON metadata for integrations and tooling.';
COMMENT ON COLUMN all_leads.response_count IS 'Count of user/agent responses used for follow-up cadence.';
COMMENT ON COLUMN all_leads.days_inactive IS 'Cached or derived inactivity window for scoring and follow-ups.';
COMMENT ON COLUMN all_leads.total_touchpoints IS 'Aggregate touchpoint count across channels.';
COMMENT ON COLUMN all_leads.last_follow_up_sent_at IS 'Timestamp of last automated follow-up message sent';
COMMENT ON COLUMN all_leads.last_follow_up_template IS 'Template name of last follow-up sent (for rotation)';
COMMENT ON COLUMN all_leads.follow_up_count IS 'Number of follow-ups sent in current sequence';
COMMENT ON COLUMN all_leads.follow_up_cooldown_until IS 'Pause follow-ups until this time (user replied, failure, etc)';

-- ----------------------------------------------------------------------------
-- 001_expand_touchpoint_values — expanded first/last_touchpoint allowed set
-- Use ::text + text[] so CHECK does NOT cast string literals to channel_type in
-- the same transaction as ALTER TYPE ADD VALUE (avoids PG 55P04: new enum
-- values must be committed before they can be used). Enum labels are added in
-- 001b below, after these CHECKs.
-- ----------------------------------------------------------------------------
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_first_touchpoint_check;
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_last_touchpoint_check;

-- proxe additions vs the windchasers original:
--   'landing_page'  — api/integrations/landing-pages writes it
--   'facebook_lead' — api/agent/facebook-lead writes it (wc 034's lesson)
--   'billing'       — goproxe.com's Dodo webhook inserts payer-only leads with it
ALTER TABLE all_leads ADD CONSTRAINT all_leads_first_touchpoint_check
  CHECK (
    first_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms', 'landing_page',
      'facebook_lead', 'billing'
    ]::text[])
  );

ALTER TABLE all_leads ADD CONSTRAINT all_leads_last_touchpoint_check
  CHECK (
    last_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms', 'landing_page',
      'facebook_lead', 'billing'
    ]::text[])
  );

-- (windchasers' 001b `ALTER TYPE public.channel_type …` block omitted: proxe's
-- schema uses TEXT + CHECK throughout — the channel_type enum never existed
-- here, and those statements would error on a fresh project.)

-- ----------------------------------------------------------------------------
-- 002_business_readiness_score.sql — calculate_lead_score with readiness
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  ai_score INTEGER := 0;
  activity_score INTEGER := 0;
  business_score INTEGER := 0;
  readiness_score INTEGER := 0;
  final_score INTEGER := 0;

  -- AI Analysis components
  engagement_quality_score INTEGER := 0;
  intent_signals_score INTEGER := 0;
  question_depth_score INTEGER := 0;

  -- Activity metrics
  response_rate NUMERIC := 0;
  days_inactive INTEGER := 0;
  touchpoint_count INTEGER := 0;

  -- Business metrics
  has_booking BOOLEAN := FALSE;
  is_reengaged BOOLEAN := FALSE;

  -- Readiness metrics
  form_data JSONB;
  business_intel JSONB;

  -- Lead data
  lead_data RECORD;
  last_interaction TIMESTAMP WITH TIME ZONE;
  message_count INTEGER := 0;
  conversation_summary TEXT;
  unified_context JSONB;
BEGIN
  -- Get lead data
  SELECT
    al.*,
    COALESCE(ws.message_count, 0) + COALESCE(whs.message_count, 0) + COALESCE(vs.call_duration_seconds, 0) / 60 AS total_interactions,
    COALESCE(ws.conversation_summary, whs.conversation_summary, vs.call_summary) AS summary,
    al.unified_context
  INTO lead_data
  FROM all_leads al
  LEFT JOIN web_sessions ws ON ws.lead_id = al.id
  LEFT JOIN whatsapp_sessions whs ON whs.lead_id = al.id
  LEFT JOIN voice_sessions vs ON vs.lead_id = al.id
  WHERE al.id = lead_uuid;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  last_interaction := COALESCE(lead_data.last_interaction_at, lead_data.created_at);
  message_count := COALESCE(lead_data.total_interactions, 0);
  conversation_summary := lead_data.summary;
  unified_context := COALESCE(lead_data.unified_context, '{}'::jsonb);
  form_data := COALESCE(unified_context->'form_data', '{}'::jsonb);
  business_intel := COALESCE(unified_context->'business_intel', '{}'::jsonb);

  -- Calculate days inactive
  days_inactive := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;

  -- Count touchpoints
  SELECT COUNT(*) INTO touchpoint_count
  FROM (
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM voice_sessions WHERE lead_id = lead_uuid
  ) AS touchpoints;

  -- Check for booking
  SELECT EXISTS(
    SELECT 1 FROM web_sessions
    WHERE lead_id = lead_uuid
    AND booking_status IN ('pending', 'confirmed')
  ) INTO has_booking;

  -- ═══════════════════════════════════════════════
  -- AI Analysis (60 points max)
  -- ═══════════════════════════════════════════════
  IF message_count > 10 THEN
    engagement_quality_score := 20;
  ELSIF message_count > 5 THEN
    engagement_quality_score := 15;
  ELSIF message_count > 2 THEN
    engagement_quality_score := 10;
  ELSIF message_count > 0 THEN
    engagement_quality_score := 5;
  END IF;

  IF unified_context IS NOT NULL AND unified_context ? 'intent_signals' THEN
    intent_signals_score := LEAST(20, (unified_context->>'intent_signals')::INTEGER);
  ELSIF conversation_summary IS NOT NULL THEN
    IF conversation_summary ILIKE '%interested%' OR
       conversation_summary ILIKE '%want%' OR
       conversation_summary ILIKE '%need%' OR
       conversation_summary ILIKE '%book%' OR
       conversation_summary ILIKE '%schedule%' THEN
      intent_signals_score := 15;
    ELSIF conversation_summary ILIKE '%price%' OR
           conversation_summary ILIKE '%cost%' OR
           conversation_summary ILIKE '%information%' THEN
      intent_signals_score := 10;
    ELSE
      intent_signals_score := 5;
    END IF;
  END IF;

  IF unified_context IS NOT NULL AND unified_context ? 'question_depth' THEN
    question_depth_score := LEAST(20, (unified_context->>'question_depth')::INTEGER);
  ELSIF message_count > 5 THEN
    question_depth_score := 15;
  ELSIF message_count > 2 THEN
    question_depth_score := 10;
  ELSE
    question_depth_score := 5;
  END IF;

  ai_score := engagement_quality_score + intent_signals_score + question_depth_score;

  -- ═══════════════════════════════════════════════
  -- Activity Score (25 points max, was 30)
  -- ═══════════════════════════════════════════════
  IF days_inactive = 0 THEN
    response_rate := 1.0;
  ELSIF days_inactive <= 1 THEN
    response_rate := 0.8;
  ELSIF days_inactive <= 3 THEN
    response_rate := 0.6;
  ELSIF days_inactive <= 7 THEN
    response_rate := 0.4;
  ELSE
    response_rate := 0.2;
  END IF;

  -- Scaled to 25 max (was 30): response rate (12) + touchpoints (8) - inactivity (5)
  activity_score := ROUND((response_rate * 12) + LEAST(touchpoint_count * 2, 8) - LEAST(days_inactive / 7, 5));
  activity_score := GREATEST(0, LEAST(25, activity_score));

  -- ═══════════════════════════════════════════════
  -- Business Readiness Score (15 points max, NEW)
  -- ═══════════════════════════════════════════════

  -- has_website = true: +5
  IF (form_data->>'has_website')::boolean IS TRUE
     OR unified_context ? 'website_url' THEN
    readiness_score := readiness_score + 5;
  END IF;

  -- has_ai_systems = false (they NEED us): +3
  IF (form_data->>'has_ai_systems')::boolean IS FALSE THEN
    readiness_score := readiness_score + 3;
  END IF;

  -- urgency is extremely_urgent or asap: +4
  IF form_data->>'urgency' IN ('extremely_urgent', 'asap', 'immediately', 'right_now') THEN
    readiness_score := readiness_score + 4;
  ELSIF form_data->>'urgency' IN ('urgent', 'soon', 'this_week', 'this_month') THEN
    readiness_score := readiness_score + 2;
  END IF;

  -- monthly_leads > 50: +3
  IF form_data ? 'monthly_leads' THEN
    DECLARE
      leads_num INTEGER := 0;
    BEGIN
      -- Extract numeric part from strings like "50-100", "100+", "100"
      leads_num := COALESCE(
        (regexp_replace(form_data->>'monthly_leads', '[^0-9].*', '', 'g'))::INTEGER,
        0
      );
      IF leads_num > 50 THEN
        readiness_score := readiness_score + 3;
      ELSIF leads_num > 20 THEN
        readiness_score := readiness_score + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Skip if parsing fails
    END;
  END IF;

  -- website_live from crawl = true: +2 bonus
  IF (business_intel->>'website_live')::boolean IS TRUE THEN
    readiness_score := readiness_score + 2;
  END IF;

  readiness_score := LEAST(15, readiness_score);

  -- ═══════════════════════════════════════════════
  -- Business boost (booking = major boost)
  -- ═══════════════════════════════════════════════
  IF has_booking THEN
    business_score := 50;
  ELSIF days_inactive > 7 AND days_inactive <= 30 AND message_count > 0 THEN
    business_score := 20;
  END IF;

  -- Final: AI (60) + Activity (25) + Readiness (15) + business boost
  final_score := ai_score + activity_score + readiness_score + business_score;
  final_score := LEAST(100, final_score);

  RETURN final_score;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 003_smart_timing_read_receipts.sql
-- ----------------------------------------------------------------------------
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_lead_read
  ON conversations (lead_id, sender, created_at DESC)
  WHERE channel = 'whatsapp';

-- ----------------------------------------------------------------------------
-- 004_cancel_deprecated_task_types.sql (skip if agent_tasks not deployed)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.agent_tasks') IS NOT NULL THEN
    EXECUTE $qt$
      UPDATE agent_tasks
      SET status = 'cancelled',
          completed_at = NOW(),
          error_message = 'Deprecated task type — cancelled by migration 004'
      WHERE task_type IN ('post_booking_followup', 'booking_reminder_1h')
        AND status IN ('pending', 'queued', 'in_queue', 'awaiting_approval')
    $qt$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- (windchasers original carried bcon 005/006 one-touch/low-touch template seeds
--  here — BCON marketing copy, useless rows for proxe. Skipped. PROXe follow-up
--  templates get authored in the dashboard once messaging is decided.)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 007_add_changelog_table.sql (table + index + seed rows if missing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS changelog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  category TEXT NOT NULL,
  changes JSONB NOT NULL,
  gpfc_ref TEXT,
  deployed_by TEXT DEFAULT 'bconclub'
);

CREATE INDEX IF NOT EXISTS idx_changelog_date ON changelog (date DESC);

INSERT INTO changelog (version, category, changes, gpfc_ref)
SELECT '1.0.0', 'core', '["Initial platform setup"]'::jsonb, 'foundation'
WHERE NOT EXISTS (
  SELECT 1 FROM changelog c WHERE c.version = '1.0.0' AND c.category = 'core' AND c.gpfc_ref = 'foundation'
);

-- (bcon '1.1.0' changelog seed row skipped — another brand's history.)

-- ----------------------------------------------------------------------------
-- 999_add_follow_up_tracking.sql — indexes + one-time cooldown (idempotent)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_all_leads_follow_up_tracking
  ON all_leads (last_follow_up_sent_at, follow_up_cooldown_until)
  WHERE needs_human_followup = false;

CREATE INDEX IF NOT EXISTS idx_all_leads_stuck_follow_ups
  ON all_leads (last_interaction_at, follow_up_cooldown_until)
  WHERE lead_stage NOT IN ('Converted', 'Closed Won', 'Closed Lost');

-- Only set cooldown when not already scheduled (safe on re-run)
UPDATE all_leads
SET follow_up_cooldown_until = NOW() + INTERVAL '48 hours'
WHERE id IN (
    SELECT DISTINCT lead_id
    FROM conversations
    WHERE sender = 'agent'
      AND created_at > NOW() - INTERVAL '24 hours'
      AND lead_id IS NOT NULL
)
AND follow_up_cooldown_until IS NULL;

SELECT 'windchasers_sync_migrations.sql applied; all_leads row count = ' || COUNT(*)::text AS result
FROM all_leads;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 17_lead_ownership.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 036: Per-user lead ownership + lead-type access control (features.leadAccess)
--
-- 1. dashboard_users.allowed_lead_types — which course types a user may see.
--    NULL = unrestricted (all types). Values are canonical COURSE_OPTIONS
--    strings from core/src/configs/courses.ts: Pilot, DGCA, Helicopter,
--    Cabin Crew, Drone.
-- 2. user_invitations.allowed_lead_types — same, set at invite time and
--    carried onto dashboard_users when the invite is redeemed.
-- 3. all_leads.owner_id — ownership promoted to a real, indexed column so the
--    pipeline/humans views can filter in SQL (?owner=me / IS NULL open pool).
--    The unified_context.owner JSONB object stays as the display record
--    (name/email); both are written together by the app.

ALTER TABLE dashboard_users  ADD COLUMN IF NOT EXISTS allowed_lead_types TEXT[] NULL;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS allowed_lead_types TEXT[] NULL;

ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS owner_id UUID NULL
  REFERENCES dashboard_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_owner_id ON all_leads(owner_id);

-- Backfill owner_id from the JSONB owner already assigned by the app. The join
-- against dashboard_users guards both FK violations (owner no longer exists)
-- and malformed/non-uuid ids stored in JSONB.
UPDATE all_leads l SET owner_id = du.id
FROM dashboard_users du
WHERE l.owner_id IS NULL
  AND du.id::text = l.unified_context->'owner'->>'id';

-- Sanity check (run manually): backfilled vs JSONB owners
-- SELECT count(*) FILTER (WHERE owner_id IS NOT NULL) AS with_owner_col,
--        count(*) FILTER (WHERE unified_context->'owner'->>'id' IS NOT NULL) AS with_owner_jsonb
-- FROM all_leads;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 18_converted_at.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 037_add_converted_at.sql
-- Record WHEN a lead converted. The stage already auto-flips to 'Converted'
-- (via the note classifier / manual stage change), but the conversion DATE was
-- never stored — so conversions weren't dated or trackable. This column captures
-- it: set from the note's date when converting via a call/note, else the moment
-- the lead is moved to Converted. Nullable; only set on conversion.

ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Index for reporting/sorting converted leads by date.
CREATE INDEX IF NOT EXISTS idx_all_leads_converted_at
  ON all_leads (converted_at DESC)
  WHERE converted_at IS NOT NULL;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 19_closed_won.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 038_rename_converted_to_closed_won.sql
-- The "won" stage is renamed 'Converted' -> 'Closed Won' (pairs with the
-- existing 'Closed Lost'). This: drops the lead_stage CHECK constraint (by
-- whatever name it currently has), migrates existing 'Converted' rows, and
-- re-adds the constraint with 'Closed Won' in place of 'Converted' plus the
-- full stage set the app uses (incl. Not Qualified / R&R).
--
-- Run this BEFORE / alongside deploying the code rename — until it runs, the DB
-- CHECK rejects 'Closed Won' and the Convert action will 400.

-- 1. Drop every CHECK constraint on all_leads that references lead_stage
--    (name is auto-generated, so find it by definition).
DO $$
DECLARE cname text;
BEGIN
  FOR cname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'all_leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%lead_stage%'
  LOOP
    EXECUTE format('ALTER TABLE all_leads DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

-- 2. Migrate existing data.
UPDATE all_leads SET lead_stage = 'Closed Won' WHERE lead_stage = 'Converted';

-- 3. Re-add the constraint with the current full stage set ('Closed Won'
--    replaces 'Converted').
ALTER TABLE all_leads ADD CONSTRAINT all_leads_lead_stage_check CHECK (lead_stage IN (
  'New',
  'Engaged',
  'Qualified',
  'High Intent',
  'Booking Made',
  'Closed Won',
  'Closed Lost',
  'Not Qualified',
  'In Sequence',
  'Cold',
  'R&R'
));

-- NOTE: converted leads are stage_override=true, so the scoring function won't
-- re-score them regardless of name — no function change required.


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 20_final_view.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Fix all_leads RLS policies and ensure unified_leads has all scoring fields
-- This ensures both all_leads table and unified_leads view are accessible and complete

-- Step 1: Fix RLS policies for all_leads (ensure they allow access)
DROP POLICY IF EXISTS "Authenticated users can view all_leads" ON all_leads;
DROP POLICY IF EXISTS "Allow all users to view all_leads" ON all_leads;
CREATE POLICY "Allow all users to view all_leads"
  ON all_leads FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert all_leads" ON all_leads;
DROP POLICY IF EXISTS "Allow all users to insert all_leads" ON all_leads;
CREATE POLICY "Allow all users to insert all_leads"
  ON all_leads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all_leads" ON all_leads;
DROP POLICY IF EXISTS "Allow all users to update all_leads" ON all_leads;
CREATE POLICY "Allow all users to update all_leads"
  ON all_leads FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Step 2: Ensure all_leads has scoring columns BEFORE creating view (safe - only adds if missing)
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'New',
ADD COLUMN IF NOT EXISTS sub_stage TEXT NULL,
ADD COLUMN IF NOT EXISTS stage_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS is_active_chat BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS booking_date DATE NULL,
ADD COLUMN IF NOT EXISTS booking_time TIME NULL,
ADD COLUMN IF NOT EXISTS status TEXT NULL;

-- Step 3: Recreate unified_leads view with ALL required fields including scoring
-- Using COALESCE to handle NULL values safely
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
  -- Lead scoring fields (use COALESCE to handle NULLs and provide defaults)
  COALESCE(al.lead_score, 0) AS lead_score,
  COALESCE(al.lead_stage, 'New') AS lead_stage,
  al.sub_stage,
  COALESCE(al.stage_override, FALSE) AS stage_override,
  al.last_scored_at,
  al.is_active_chat,
  -- Status from web_sessions booking_status (most common)
  COALESCE(
    (SELECT ws.booking_status FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1),
    'new'
  ) AS status,
  -- Booking date/time from web_sessions
  (SELECT ws.booking_date FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1) AS booking_date,
  (SELECT ws.booking_time FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1) AS booking_time,
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
  al.unified_context
FROM all_leads al
WHERE (
  al.customer_name IS NOT NULL 
  OR al.email IS NOT NULL 
  OR al.phone IS NOT NULL
);

-- Grant access to authenticated users (and public if auth is disabled)
GRANT SELECT ON unified_leads TO authenticated;
GRANT SELECT ON unified_leads TO anon;

-- Step 4: Fix any invalid lead_score values before adding constraint
-- First, fix any NULL or out-of-range values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'all_leads' 
    AND column_name = 'lead_score'
  ) THEN
    -- Fix NULL values to 0
    UPDATE all_leads 
    SET lead_score = 0 
    WHERE lead_score IS NULL;
    
    -- Fix negative values to 0
    UPDATE all_leads 
    SET lead_score = 0 
    WHERE lead_score < 0;
    
    -- Fix values > 100 to 100
    UPDATE all_leads 
    SET lead_score = 100 
    WHERE lead_score > 100;
  END IF;
END $$;

-- Step 4b: Add check constraint to lead_score if it doesn't exist (safe - only if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'all_leads' 
    AND column_name = 'lead_score'
  ) THEN
    -- Drop constraint if it exists (in case it's different)
    ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS check_lead_score_range;
    
    -- Add constraint (should work now since we fixed the data)
    BEGIN
      ALTER TABLE all_leads 
      ADD CONSTRAINT check_lead_score_range 
      CHECK (lead_score >= 0 AND lead_score <= 100);
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, do nothing
      NULL;
    END;
  END IF;
END $$;

-- Step 5: Create indexes for performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_score ON all_leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_stage ON all_leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_all_leads_sub_stage ON all_leads(sub_stage) WHERE sub_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_stage_override ON all_leads(stage_override) WHERE stage_override = TRUE;
CREATE INDEX IF NOT EXISTS idx_all_leads_is_active_chat ON all_leads(is_active_chat) WHERE is_active_chat = TRUE;
CREATE INDEX IF NOT EXISTS idx_all_leads_booking_date ON all_leads(booking_date) WHERE booking_date IS NOT NULL;

-- Migration complete!
-- This ensures:
-- 1. all_leads table has proper RLS policies allowing access
-- 2. unified_leads view includes all scoring fields (lead_score, lead_stage, etc.)
-- 3. All required columns exist in all_leads table
-- 4. Performance indexes are created


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 21_backfill_fns.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Backfill all_leads from existing web_sessions
-- This script creates all_leads records for web_sessions that have phone/email but no lead_id
-- It's idempotent - can be run multiple times safely

-- Step 1: Create function to normalize phone numbers (same logic as in chatSessions.ts)
CREATE OR REPLACE FUNCTION normalize_phone_for_backfill(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone_number IS NULL OR phone_number = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-digit characters
  DECLARE
    digits TEXT;
  BEGIN
    digits := regexp_replace(phone_number, '\D', '', 'g');
    
    -- Need at least 10 digits
    IF digits IS NULL OR length(digits) < 10 THEN
      RETURN NULL;
    END IF;
    
    -- Return last 10 digits for matching
    RETURN right(digits, 10);
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Backfill all_leads from web_sessions with phone/email but no lead_id
-- This handles sessions that have contact info but weren't linked to leads
DO $$
DECLARE
  session_record RECORD;
  normalized_phone TEXT;
  existing_lead_id UUID;
  new_lead_id UUID;
  sessions_processed INTEGER := 0;
  leads_created INTEGER := 0;
  leads_updated INTEGER := 0;
  sessions_linked INTEGER := 0;
BEGIN
  -- Process all web_sessions that have phone or email but no lead_id
  FOR session_record IN 
    SELECT 
      ws.id,
      ws.external_session_id,
      ws.customer_name,
      ws.customer_email,
      ws.customer_phone,
      ws.brand,
      ws.conversation_summary,
      ws.booking_status,
      ws.booking_date,
      ws.booking_time,
      ws.user_inputs_summary,
      ws.created_at,
      ws.updated_at
    FROM web_sessions ws
    WHERE ws.lead_id IS NULL
      AND (ws.customer_phone IS NOT NULL OR ws.customer_email IS NOT NULL)
  LOOP
    sessions_processed := sessions_processed + 1;
    
    -- Normalize phone number
    normalized_phone := normalize_phone_for_backfill(session_record.customer_phone);
    
    -- Try to find existing lead by normalized phone
    IF normalized_phone IS NOT NULL THEN
      SELECT id INTO existing_lead_id
      FROM all_leads
      WHERE customer_phone_normalized = normalized_phone
        AND brand = COALESCE(session_record.brand, 'proxe')
      LIMIT 1;
    END IF;
    
    -- If no existing lead found, try by email
    IF existing_lead_id IS NULL AND session_record.customer_email IS NOT NULL THEN
      SELECT id INTO existing_lead_id
      FROM all_leads
      WHERE email = session_record.customer_email
        AND brand = COALESCE(session_record.brand, 'proxe')
      LIMIT 1;
    END IF;
    
    -- Create or update lead
    IF existing_lead_id IS NOT NULL THEN
      -- Update existing lead
      UPDATE all_leads
      SET
        customer_name = COALESCE(session_record.customer_name, customer_name),
        email = COALESCE(session_record.customer_email, email),
        phone = COALESCE(session_record.customer_phone, phone),
        customer_phone_normalized = COALESCE(normalized_phone, customer_phone_normalized),
        last_touchpoint = 'web',
        last_interaction_at = GREATEST(
          COALESCE(last_interaction_at, '1970-01-01'::timestamp),
          COALESCE(session_record.updated_at, session_record.created_at)
        ),
        unified_context = COALESCE(
          jsonb_set(
            COALESCE(unified_context, '{}'::jsonb),
            '{web}',
            jsonb_build_object(
              'conversation_summary', session_record.conversation_summary,
              'booking_status', session_record.booking_status,
              'booking_date', session_record.booking_date,
              'booking_time', session_record.booking_time,
              'user_inputs', COALESCE(session_record.user_inputs_summary, '[]'::jsonb)
            )
          ),
          unified_context
        )
      WHERE id = existing_lead_id;
      
      leads_updated := leads_updated + 1;
      new_lead_id := existing_lead_id;
    ELSE
      -- Create new lead (need at least phone or email)
      IF normalized_phone IS NOT NULL OR session_record.customer_email IS NOT NULL THEN
        INSERT INTO all_leads (
          customer_name,
          email,
          phone,
          customer_phone_normalized,
          first_touchpoint,
          last_touchpoint,
          last_interaction_at,
          brand,
          unified_context
        )
        VALUES (
          session_record.customer_name,
          session_record.customer_email,
          session_record.customer_phone,
          normalized_phone,
          'web',
          'web',
          COALESCE(session_record.updated_at, session_record.created_at),
          COALESCE(session_record.brand, 'proxe'),
          jsonb_build_object(
            'web',
            jsonb_build_object(
              'conversation_summary', session_record.conversation_summary,
              'booking_status', session_record.booking_status,
              'booking_date', session_record.booking_date,
              'booking_time', session_record.booking_time,
              'user_inputs', COALESCE(session_record.user_inputs_summary, '[]'::jsonb)
            )
          )
        )
        ON CONFLICT (customer_phone_normalized, brand) 
        DO UPDATE SET
          customer_name = COALESCE(EXCLUDED.customer_name, all_leads.customer_name),
          email = COALESCE(EXCLUDED.email, all_leads.email),
          phone = COALESCE(EXCLUDED.phone, all_leads.phone),
          last_touchpoint = 'web',
          last_interaction_at = GREATEST(
            COALESCE(all_leads.last_interaction_at, '1970-01-01'::timestamp),
            EXCLUDED.last_interaction_at
          )
        RETURNING id INTO new_lead_id;
        
        -- If conflict happened, get the existing lead_id
        IF new_lead_id IS NULL THEN
          SELECT id INTO new_lead_id
          FROM all_leads
          WHERE customer_phone_normalized = normalized_phone
            AND brand = COALESCE(session_record.brand, 'proxe')
          LIMIT 1;
        END IF;
        
        leads_created := leads_created + 1;
      ELSE
        -- Skip sessions without phone or email
        CONTINUE;
      END IF;
    END IF;
    
    -- Link session to lead
    IF new_lead_id IS NOT NULL THEN
      UPDATE web_sessions
      SET lead_id = new_lead_id
      WHERE id = session_record.id;
      
      sessions_linked := sessions_linked + 1;
    END IF;
    
  END LOOP;
  
  -- Log results
  RAISE NOTICE 'Backfill complete: Processed % sessions, Created % leads, Updated % leads, Linked % sessions', 
    sessions_processed, leads_created, leads_updated, sessions_linked;
END $$;

-- Step 3: Create index on customer_phone_normalized if it doesn't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_all_leads_phone_normalized 
ON all_leads(customer_phone_normalized) 
WHERE customer_phone_normalized IS NOT NULL;

-- Step 4: Create index on email if it doesn't exist (for email-based lookups)
CREATE INDEX IF NOT EXISTS idx_all_leads_email 
ON all_leads(email) 
WHERE email IS NOT NULL;

-- Step 5: Verify results - show count of sessions still without lead_id
DO $$
DECLARE
  unlinked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unlinked_count
  FROM web_sessions
  WHERE lead_id IS NULL
    AND (customer_phone IS NOT NULL OR customer_email IS NOT NULL);
  
  IF unlinked_count > 0 THEN
    RAISE WARNING 'There are still % web_sessions with phone/email but no lead_id. These may have invalid phone/email formats.', unlinked_count;
  ELSE
    RAISE NOTICE 'All web_sessions with valid phone/email have been linked to leads.';
  END IF;
END $$;

-- Migration complete!
-- This script is idempotent and can be run multiple times safely.
-- It will only process sessions that don't have a lead_id yet.


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 22_knowledge_base.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration 023: Knowledge Base
-- Stores uploaded documents, scraped URLs, and manual text entries for AI agent context

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'proxe',
  type TEXT NOT NULL CHECK (type IN ('pdf', 'doc', 'url', 'text')),
  title TEXT NOT NULL,
  source_url TEXT,
  content TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  chunks JSONB DEFAULT '[]'::jsonb,
  embeddings_status TEXT NOT NULL DEFAULT 'pending' CHECK (embeddings_status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_knowledge_base_brand ON knowledge_base(brand);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_type ON knowledge_base(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_status ON knowledge_base(embeddings_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_created_at ON knowledge_base(created_at DESC);

-- Full-text search index on title + content
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_fts
  ON knowledge_base USING GIN(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  );

-- ============================================
-- 3. ROW LEVEL SECURITY (auth disabled — matches 018_disable_auth_requirements.sql)
-- ============================================

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all users to view knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to view knowledge_base"
  ON knowledge_base FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all users to insert knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to insert knowledge_base"
  ON knowledge_base FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to update knowledge_base"
  ON knowledge_base FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to delete knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to delete knowledge_base"
  ON knowledge_base FOR DELETE USING (true);

-- ============================================
-- 4. AUTO-UPDATE TRIGGER (reuse existing function from 001_dashboard_schema.sql)
-- ============================================

DROP TRIGGER IF EXISTS update_knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. GRANTS
-- ============================================

GRANT ALL ON knowledge_base TO anon;
GRANT ALL ON knowledge_base TO authenticated;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 23_kb_qa_columns.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration 031: Add Q&A structure columns to knowledge_base
-- Enables structured question/answer entries with categories and tags.
-- The search RPC in 030 already handles these fields.

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS question TEXT,
  ADD COLUMN IF NOT EXISTS answer TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Index for Q&A full-text search
CREATE INDEX IF NOT EXISTS idx_kb_qa_fts
  ON knowledge_base USING GIN(
    to_tsvector('english',
      coalesce(question, '') || ' ' ||
      coalesce(answer, '') || ' ' ||
      coalesce(content, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_kb_category
  ON knowledge_base(category);


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 24_kb_chunks.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration 024: Bridge existing PROXe knowledge_base + add chunks table
-- PROXe's knowledge_base already has: id, content, category, subcategory,
-- question, answer, tags, created_at, updated_at, created_by, embedding, metadata
-- This migration adds missing columns and creates the chunks table for RAG search.

-- ============================================
-- 1. ADD MISSING COLUMNS to existing knowledge_base
-- ============================================

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS chunks JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS embeddings_status TEXT DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Backfill title from question for existing rows
UPDATE knowledge_base SET title = question WHERE title IS NULL AND question IS NOT NULL;
UPDATE knowledge_base SET title = 'Untitled' WHERE title IS NULL;

-- Backfill embeddings_status for existing rows
UPDATE knowledge_base SET embeddings_status = 'ready' WHERE embeddings_status IS NULL;

-- ============================================
-- 2. ENABLE pgvector EXTENSION
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 3. CREATE knowledge_base_chunks TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  char_start INTEGER,
  char_end INTEGER,
  token_estimate INTEGER,
  embedding vector(384),
  fts_vector tsvector,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id
  ON knowledge_base_chunks(knowledge_base_id);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_fts
  ON knowledge_base_chunks USING GIN(fts_vector);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON knowledge_base_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search on parent table (question + answer + content)
CREATE INDEX IF NOT EXISTS idx_kb_qa_fts
  ON knowledge_base USING GIN(
    to_tsvector('english',
      coalesce(question, '') || ' ' ||
      coalesce(answer, '') || ' ' ||
      coalesce(content, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_kb_category
  ON knowledge_base(category);

-- ============================================
-- 5. TRIGGER: auto-compute fts_vector on chunks
-- ============================================

CREATE OR REPLACE FUNCTION kb_chunks_update_fts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts_vector := to_tsvector('english', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kb_chunks_fts ON knowledge_base_chunks;
CREATE TRIGGER trg_kb_chunks_fts
  BEFORE INSERT OR UPDATE OF content ON knowledge_base_chunks
  FOR EACH ROW EXECUTE FUNCTION kb_chunks_update_fts();

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all kb_chunks select" ON knowledge_base_chunks FOR SELECT USING (true);
CREATE POLICY "Allow all kb_chunks insert" ON knowledge_base_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all kb_chunks update" ON knowledge_base_chunks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow all kb_chunks delete" ON knowledge_base_chunks FOR DELETE USING (true);

GRANT ALL ON knowledge_base_chunks TO anon;
GRANT ALL ON knowledge_base_chunks TO authenticated;

-- ============================================
-- 7. RPC: search_knowledge_base (hybrid search)
-- ============================================

CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_text TEXT,
  query_embedding vector(384) DEFAULT NULL,
  match_limit INTEGER DEFAULT 5,
  filter_brand TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_subcategory TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  knowledge_base_id UUID,
  content TEXT,
  chunk_index INTEGER,
  title TEXT,
  source_type TEXT,
  relevance FLOAT,
  search_method TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  ts_query := plainto_tsquery('english', query_text);

  RETURN QUERY
  WITH ranked AS (
    -- 1. Chunk-level full-text search
    SELECT
      c.id,
      c.knowledge_base_id,
      c.content,
      c.chunk_index,
      kb.title,
      kb.type AS source_type,
      ts_rank_cd(c.fts_vector, ts_query)::FLOAT AS relevance,
      'fulltext'::TEXT AS search_method
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
    WHERE c.fts_vector @@ ts_query
      AND kb.embeddings_status = 'ready'

    UNION ALL

    -- 2. Q&A direct search on parent table
    SELECT
      kb.id,
      kb.id AS knowledge_base_id,
      COALESCE(kb.answer, kb.content, '') AS content,
      0 AS chunk_index,
      COALESCE(kb.question, kb.title) AS title,
      kb.type AS source_type,
      ts_rank_cd(
        to_tsvector('english',
          coalesce(kb.question, '') || ' ' ||
          coalesce(kb.answer, '') || ' ' ||
          coalesce(kb.content, '')
        ),
        ts_query
      )::FLOAT AS relevance,
      'qa_match'::TEXT AS search_method
    FROM knowledge_base kb
    WHERE to_tsvector('english',
        coalesce(kb.question, '') || ' ' ||
        coalesce(kb.answer, '') || ' ' ||
        coalesce(kb.content, '')
      ) @@ ts_query
      AND kb.embeddings_status = 'ready'
      AND (filter_category IS NULL OR kb.category = filter_category)
      AND (filter_subcategory IS NULL OR kb.subcategory = filter_subcategory)

    UNION ALL

    -- 3. Vector similarity search
    SELECT
      c.id,
      c.knowledge_base_id,
      c.content,
      c.chunk_index,
      kb.title,
      kb.type AS source_type,
      (1 - (c.embedding <=> query_embedding))::FLOAT AS relevance,
      'vector'::TEXT AS search_method
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
    WHERE query_embedding IS NOT NULL
      AND c.embedding IS NOT NULL
      AND kb.embeddings_status = 'ready'
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_limit
  ),
  deduplicated AS (
    SELECT DISTINCT ON (ranked.id)
      ranked.*
    FROM ranked
    ORDER BY ranked.id, ranked.relevance DESC
  )
  SELECT
    deduplicated.id,
    deduplicated.knowledge_base_id,
    deduplicated.content,
    deduplicated.chunk_index,
    deduplicated.title,
    deduplicated.source_type,
    deduplicated.relevance,
    deduplicated.search_method
  FROM deduplicated
  ORDER BY deduplicated.relevance DESC
  LIMIT match_limit;
END;
$$;

-- ============================================
-- 8. BACKFILL: existing Q&A rows into chunks table
-- ============================================

INSERT INTO knowledge_base_chunks (
  knowledge_base_id,
  chunk_index,
  content
)
SELECT
  kb.id,
  0,
  COALESCE(kb.question, '') || E'\n\n' || COALESCE(kb.answer, kb.content, '')
FROM knowledge_base kb
WHERE (kb.answer IS NOT NULL OR kb.content IS NOT NULL)
  AND kb.embeddings_status = 'ready'
ON CONFLICT DO NOTHING;


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 25_auto_create_leads.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- Migration: Auto-create leads when web_sessions are updated with phone numbers
-- This trigger ensures leads are automatically created when sessions get phone numbers
-- Works as a backup to the application-level ensureAllLeads function

-- Step 1: Create function to normalize phone (reuse from backfill migration)
CREATE OR REPLACE FUNCTION normalize_phone_trigger(phone_number TEXT)
RETURNS TEXT AS $$
DECLARE
  digits TEXT;
  cleaned_digits TEXT;
BEGIN
  IF phone_number IS NULL OR phone_number = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-digit characters
  digits := regexp_replace(phone_number, '\D', '', 'g');
  
  -- Need at least 10 digits
  IF digits IS NULL OR length(digits) < 10 THEN
    RETURN NULL;
  END IF;
  
  cleaned_digits := digits;
  
  -- Remove India country code (+91)
  IF cleaned_digits LIKE '91%' AND length(cleaned_digits) > 10 THEN
    cleaned_digits := substring(cleaned_digits FROM 3);
  END IF;
  
  -- Remove US/Canada country code (+1)
  IF cleaned_digits LIKE '1%' AND length(cleaned_digits) = 11 THEN
    cleaned_digits := substring(cleaned_digits FROM 2);
  END IF;
  
  -- Remove leading zeros
  cleaned_digits := regexp_replace(cleaned_digits, '^0+', '');
  
  -- Need at least 10 digits after cleaning
  IF cleaned_digits IS NULL OR length(cleaned_digits) < 10 THEN
    RETURN NULL;
  END IF;
  
  -- Always return last 10 digits for matching
  RETURN right(cleaned_digits, 10);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Create function to auto-create/update lead when session is updated
CREATE OR REPLACE FUNCTION auto_create_lead_from_session()
RETURNS TRIGGER AS $$
DECLARE
  normalized_phone TEXT;
  existing_lead_id UUID;
  new_lead_id UUID;
BEGIN
  -- Only process if phone number is present and lead_id is NULL
  -- Phone is REQUIRED for lead creation
  IF NEW.customer_phone IS NULL OR NEW.lead_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only process proxe brand
  IF NEW.brand != 'proxe' THEN
    RETURN NEW;
  END IF;
  
  -- Normalize phone number
  normalized_phone := normalize_phone_trigger(NEW.customer_phone);
  
  IF normalized_phone IS NULL THEN
    -- Phone normalization failed, can't create lead
    RETURN NEW;
  END IF;
  
  -- Try to find existing lead by normalized phone
  SELECT id INTO existing_lead_id
  FROM all_leads
  WHERE customer_phone_normalized = normalized_phone
    AND brand = 'proxe'
  LIMIT 1;
  
  -- If not found by phone, try by email
  IF existing_lead_id IS NULL AND NEW.customer_email IS NOT NULL THEN
    SELECT id INTO existing_lead_id
    FROM all_leads
    WHERE email = NEW.customer_email
      AND brand = 'proxe'
    LIMIT 1;
  END IF;
  
  -- Create or update lead
  IF existing_lead_id IS NOT NULL THEN
    -- Update existing lead
    UPDATE all_leads
    SET
      customer_name = COALESCE(NEW.customer_name, customer_name),
      email = COALESCE(NEW.customer_email, email),
      phone = COALESCE(NEW.customer_phone, phone),
      customer_phone_normalized = COALESCE(normalized_phone, customer_phone_normalized),
      last_touchpoint = 'web',
      last_interaction_at = GREATEST(
        COALESCE(last_interaction_at, '1970-01-01'::timestamp),
        COALESCE(NEW.updated_at, NEW.created_at)
      ),
      unified_context = COALESCE(
        jsonb_set(
          COALESCE(unified_context, '{}'::jsonb),
          '{web}',
          jsonb_build_object(
            'conversation_summary', NEW.conversation_summary,
            'booking_status', NEW.booking_status,
            'booking_date', NEW.booking_date,
            'booking_time', NEW.booking_time,
            'user_inputs', COALESCE(NEW.user_inputs_summary, '[]'::jsonb)
          )
        ),
        unified_context
      )
    WHERE id = existing_lead_id;
    
    new_lead_id := existing_lead_id;
  ELSE
    -- Create new lead
    INSERT INTO all_leads (
      customer_name,
      email,
      phone,
      customer_phone_normalized,
      first_touchpoint,
      last_touchpoint,
      last_interaction_at,
      brand,
      unified_context
    )
    VALUES (
      NEW.customer_name,
      NEW.customer_email,
      NEW.customer_phone,
      normalized_phone,
      'web',
      'web',
      COALESCE(NEW.updated_at, NEW.created_at),
      'proxe',
      jsonb_build_object(
        'web',
        jsonb_build_object(
          'conversation_summary', NEW.conversation_summary,
          'booking_status', NEW.booking_status,
          'booking_date', NEW.booking_date,
          'booking_time', NEW.booking_time,
          'user_inputs', COALESCE(NEW.user_inputs_summary, '[]'::jsonb)
        )
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_lead_id;
    
    -- If conflict happened, fetch existing lead
    IF new_lead_id IS NULL THEN
      SELECT id INTO new_lead_id
      FROM all_leads
      WHERE customer_phone_normalized = normalized_phone
        AND brand = 'proxe'
      LIMIT 1;
    END IF;
  END IF;
  
  -- Link session to lead
  IF new_lead_id IS NOT NULL THEN
    NEW.lead_id := new_lead_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger that runs BEFORE UPDATE on web_sessions
-- This ensures lead is created and linked BEFORE the session is updated
DROP TRIGGER IF EXISTS trigger_auto_create_lead_from_session ON web_sessions;

CREATE TRIGGER trigger_auto_create_lead_from_session
  BEFORE UPDATE ON web_sessions
  FOR EACH ROW
  WHEN (
    -- Only trigger when phone is being set/updated and lead_id is NULL
    (NEW.customer_phone IS NOT NULL AND NEW.lead_id IS NULL)
    OR
    -- Or when phone exists but lead_id is still NULL (in case of previous failures)
    (NEW.customer_phone IS NOT NULL AND OLD.customer_phone IS NOT NULL AND NEW.lead_id IS NULL)
  )
  EXECUTE FUNCTION auto_create_lead_from_session();

-- Step 4: Also create trigger for INSERT (for new sessions with phone)
CREATE TRIGGER trigger_auto_create_lead_on_insert
  BEFORE INSERT ON web_sessions
  FOR EACH ROW
  WHEN (NEW.customer_phone IS NOT NULL AND NEW.brand = 'proxe')
  EXECUTE FUNCTION auto_create_lead_from_session();

-- Step 5: Backfill existing sessions (one-time, automatic)
-- This automatically creates leads for existing sessions that have phone but no lead_id
-- Runs automatically when migration is executed - no manual steps needed
DO $$
DECLARE
  session_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Update sessions to trigger the trigger (automatic backfill)
  FOR session_record IN 
    SELECT external_session_id
    FROM web_sessions
    WHERE brand = 'proxe'
      AND customer_phone IS NOT NULL
      AND lead_id IS NULL
  LOOP
    -- Trigger update to fire the trigger (automatic)
    UPDATE web_sessions
    SET updated_at = updated_at  -- Touch the record to trigger
    WHERE external_session_id = session_record.external_session_id;
    
    updated_count := updated_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Automatically created leads for % existing sessions', updated_count;
END $$;

-- Migration complete!
-- The trigger is now fully automatic:
-- 1. Automatically fires on INSERT when new session has phone
-- 2. Automatically fires on UPDATE when session gets phone number
-- 3. Automatically creates leads without any manual intervention
-- 4. Works as backup to application-level ensureAllLeads function
-- 5. One-time backfill of existing sessions happens automatically when migration runs


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 26_whatsapp_connections.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 026_whatsapp_connections.sql
-- Stores WhatsApp Cloud API connections created via the dashboard's
-- embedded-signup flow (Agents → WhatsApp → Connect WhatsApp).
-- Service-role access only: RLS enabled with NO policies — anon/authed
-- clients can never read the access token.

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  access_token text NOT NULL,
  pin text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
  error text,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- One ACTIVE connection per brand (history rows keep status 'disconnected').
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_connections_active
  ON whatsapp_connections (brand) WHERE status = 'active';


-- ╔═══════════════════════════════════════════════════════════════════════
-- ║ 27_admin_seed.sql
-- ╚═══════════════════════════════════════════════════════════════════════
-- 27_admin_seed.sql
-- Admin login mapping. Auth users created BEFORE this script ran predate the
-- on_auth_user_created trigger (block 01), so their dashboard_users rows were
-- never auto-created — backfill every existing auth user, then promote the
-- admin identities. Users added AFTER this script are handled by the trigger.
INSERT INTO dashboard_users (id, email, full_name, role)
SELECT u.id, COALESCE(u.email, ''), u.raw_user_meta_data->>'full_name', 'viewer'
  FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Covers both admin identities in use; a non-existent email is a no-op.
UPDATE dashboard_users SET role = 'admin'
 WHERE email IN ('brands@bconclub.com', 'bconclubx@gmail.com');

-- Sanity: at least one admin row expected.
SELECT id, email, role FROM dashboard_users
 WHERE email IN ('brands@bconclub.com', 'bconclubx@gmail.com');
