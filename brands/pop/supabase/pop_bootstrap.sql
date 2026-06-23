-- ============================================================================
-- Pulse of Punjab (POP) - ONE-SHOT DATABASE BOOTSTRAP
-- Paste this ENTIRE file into Supabase > SQL Editor > New query > Run.
-- No DB password needed (the SQL Editor runs as owner).
--
-- STEP 1 wipes the existing project (the 11 old portfolio tables).
-- STEP 2 creates POP's canonical 15-table schema + migrations.
-- ============================================================================

-- ─── STEP 1: WIPE (take all existing tables off) ────────────────────────────
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ─── STEP 2: CANONICAL SCHEMA + MIGRATIONS ──────────────────────────────────

-- ===== 000_master_schema.sql =====
-- ============================================================================
-- PROXe Master Schema — Fresh Database Setup
-- ============================================================================
-- Run this ONCE on a fresh Supabase project (SQL Editor → New Query → Paste → Run)
-- Creates all 15 tables, views, functions, triggers, RLS policies, and indexes.
--
-- Brand-agnostic: `brand` columns are TEXT with no CHECK constraint.
-- Set your brand name via application code (e.g. NEXT_PUBLIC_BRAND=bcon).
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector for KB embeddings


-- ============================================================================
-- 2. UTILITY FUNCTIONS
-- ============================================================================

-- Shared trigger: auto-update `updated_at` column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create dashboard_users row when Supabase Auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.dashboard_users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin check (used by RLS policies)
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.dashboard_users
    WHERE id = user_id AND role = 'admin' AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Phone normalization: strips non-digits, returns last 10 chars
CREATE OR REPLACE FUNCTION normalize_phone(phone_number TEXT)
RETURNS TEXT AS $$
DECLARE
  digits TEXT;
  cleaned TEXT;
BEGIN
  IF phone_number IS NULL OR phone_number = '' THEN RETURN NULL; END IF;
  digits := regexp_replace(phone_number, '\D', '', 'g');
  IF digits IS NULL OR length(digits) < 10 THEN RETURN NULL; END IF;
  cleaned := digits;
  -- Remove India country code (+91)
  IF cleaned LIKE '91%' AND length(cleaned) > 10 THEN
    cleaned := substring(cleaned FROM 3);
  END IF;
  -- Remove US/Canada country code (+1)
  IF cleaned LIKE '1%' AND length(cleaned) = 11 THEN
    cleaned := substring(cleaned FROM 2);
  END IF;
  cleaned := regexp_replace(cleaned, '^0+', '');
  IF cleaned IS NULL OR length(cleaned) < 10 THEN RETURN NULL; END IF;
  RETURN right(cleaned, 10);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Alias used by triggers
CREATE OR REPLACE FUNCTION normalize_phone_trigger(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN normalize_phone(phone_number);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- 3. TABLES (dependency order)
-- ============================================================================

-- ── 3.1 dashboard_users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TRIGGER update_dashboard_users_updated_at
  BEFORE UPDATE ON dashboard_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create dashboard user on Supabase Auth signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 3.2 user_invitations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  invited_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 3.3 dashboard_settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_dashboard_settings_updated_at
  BEFORE UPDATE ON dashboard_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3.4 dashboard_leads (legacy, kept for compat) ──────────────────────────
CREATE TABLE IF NOT EXISTS dashboard_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('web', 'whatsapp', 'voice', 'social')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'new',
  booking_date DATE,
  booking_time TIME,
  metadata JSONB,
  chat_session_id UUID,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dashboard_leads_created_at ON dashboard_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_source ON dashboard_leads(source);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_status ON dashboard_leads(status);


-- ── 3.5 all_leads (PRIMARY leads table) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS all_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  customer_phone_normalized TEXT,
  first_touchpoint TEXT NOT NULL CHECK (first_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_touchpoint TEXT NOT NULL CHECK (last_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  brand TEXT NOT NULL DEFAULT 'default',
  unified_context JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Scoring
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_stage TEXT DEFAULT 'New' CHECK (lead_stage IN (
    'New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made',
    'Converted', 'Closed Lost', 'In Sequence', 'Cold'
  )),
  sub_stage TEXT,
  stage_override BOOLEAN DEFAULT FALSE,
  is_manual_override BOOLEAN DEFAULT FALSE,
  last_scored_at TIMESTAMPTZ,
  is_active_chat BOOLEAN DEFAULT FALSE,
  booking_date DATE,
  booking_time TIME,
  status TEXT
);

-- Dedup unique index on normalized phone + brand
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
CREATE INDEX IF NOT EXISTS idx_all_leads_booking_date ON all_leads(booking_date) WHERE booking_date IS NOT NULL;

CREATE TRIGGER update_all_leads_updated_at
  BEFORE UPDATE ON all_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Keep stage_override and is_manual_override in sync
CREATE OR REPLACE FUNCTION sync_stage_override_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage_override IS DISTINCT FROM OLD.stage_override THEN
      NEW.is_manual_override := NEW.stage_override;
    ELSIF NEW.is_manual_override IS DISTINCT FROM OLD.is_manual_override THEN
      NEW.stage_override := NEW.is_manual_override;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_stage_override ON all_leads;
CREATE TRIGGER trigger_sync_stage_override
  BEFORE UPDATE OF stage_override, is_manual_override ON all_leads
  FOR EACH ROW EXECUTE FUNCTION sync_stage_override_columns();


-- ── 3.6 web_sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT NOT NULL DEFAULT 'default',
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  external_session_id TEXT,
  chat_session_id TEXT,
  website_url TEXT,
  booking_status TEXT CHECK (booking_status IN ('pending', 'confirmed', 'cancelled', 'Call Booked')),
  booking_date DATE,
  booking_time TIME,
  google_event_id TEXT,
  booking_created_at TIMESTAMPTZ,
  conversation_summary TEXT,
  user_inputs_summary JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  session_status TEXT DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'abandoned')),
  channel_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_sessions_lead_id ON web_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_web_sessions_booking_date ON web_sessions(booking_date) WHERE booking_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_sessions_created_at ON web_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_sessions_external_session_id ON web_sessions(external_session_id) WHERE external_session_id IS NOT NULL;

CREATE TRIGGER update_web_sessions_updated_at
  BEFORE UPDATE ON web_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3.7 whatsapp_sessions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT NOT NULL DEFAULT 'default',
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  external_session_id TEXT,
  whatsapp_business_account_id TEXT,
  whatsapp_contact_id TEXT,
  conversation_summary TEXT,
  conversation_context JSONB,
  user_inputs_summary JSONB,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_from TEXT,
  last_message_preview TEXT,
  conversation_status TEXT,
  response_time_avg_seconds INTEGER,
  overall_sentiment TEXT,
  channel_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_lead_id ON whatsapp_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_created_at ON whatsapp_sessions(created_at DESC);

CREATE TRIGGER update_whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3.8 voice_sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT NOT NULL DEFAULT 'default',
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  external_session_id TEXT,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_lead_id ON voice_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_created_at ON voice_sessions(created_at DESC);

CREATE TRIGGER update_voice_sessions_updated_at
  BEFORE UPDATE ON voice_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3.9 social_sessions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT NOT NULL DEFAULT 'default',
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_phone_normalized TEXT,
  external_session_id TEXT,
  platform TEXT,
  platform_user_id TEXT,
  platform_username TEXT,
  engagement_type TEXT,
  content_id TEXT,
  engagement_preview TEXT,
  last_engagement_at TIMESTAMPTZ,
  engagement_count INTEGER DEFAULT 0,
  conversation_summary TEXT,
  conversation_context JSONB,
  user_inputs_summary JSONB,
  sentiment TEXT,
  engagement_quality TEXT,
  channel_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_sessions_lead_id ON social_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_social_sessions_created_at ON social_sessions(created_at DESC);

CREATE TRIGGER update_social_sessions_updated_at
  BEFORE UPDATE ON social_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3.10 conversations (messages across all channels) ───────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'voice', 'social')),
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'agent', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_channel ON conversations(lead_id, channel);


-- ── 3.11 lead_stage_changes (audit log) ─────────────────────────────────────
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_lead_id ON lead_stage_changes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_created_at ON lead_stage_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_new_stage ON lead_stage_changes(new_stage);


-- ── 3.12 lead_stage_overrides ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_stage_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  overridden_stage TEXT NOT NULL,
  overridden_sub_stage TEXT,
  overridden_by UUID NOT NULL REFERENCES dashboard_users(id),
  override_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_lead_id ON lead_stage_overrides(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_is_active ON lead_stage_overrides(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_created_at ON lead_stage_overrides(created_at DESC);


-- ── 3.13 lead_activities (manual notes, calls, meetings) ────────────────────
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call', 'meeting', 'message', 'note')),
  note TEXT NOT NULL,
  duration_minutes INTEGER,
  next_followup_date TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES dashboard_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_activity_type ON lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_next_followup ON lead_activities(next_followup_date) WHERE next_followup_date IS NOT NULL;


-- ── 3.14 knowledge_base ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'default',
  type TEXT NOT NULL CHECK (type IN ('pdf', 'doc', 'url', 'text')),
  title TEXT NOT NULL,
  source_url TEXT,
  content TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  chunks JSONB DEFAULT '[]'::jsonb,
  embeddings_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embeddings_status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Q&A columns
  question TEXT,
  answer TEXT,
  category TEXT,
  subcategory TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_brand ON knowledge_base(brand);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_type ON knowledge_base(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_status ON knowledge_base(embeddings_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_created_at ON knowledge_base(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_fts
  ON knowledge_base USING GIN(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  );
CREATE INDEX IF NOT EXISTS idx_kb_qa_fts
  ON knowledge_base USING GIN(
    to_tsvector('english',
      coalesce(question, '') || ' ' || coalesce(answer, '') || ' ' || coalesce(content, '')
    )
  );
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);

CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 3.15 knowledge_base_chunks (embeddings + FTS) ──────────────────────────
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id ON knowledge_base_chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_fts ON knowledge_base_chunks USING GIN(fts_vector);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON knowledge_base_chunks USING hnsw (embedding vector_cosine_ops);

-- Auto-compute FTS vector on insert/update
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


-- ============================================================================
-- 4. SCORING FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_lead_score(lead_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  ai_score INTEGER := 0;
  activity_score INTEGER := 0;
  business_score INTEGER := 0;
  final_score INTEGER := 0;
  engagement_quality_score INTEGER := 0;
  intent_signals_score INTEGER := 0;
  question_depth_score INTEGER := 0;
  response_rate NUMERIC := 0;
  days_inactive INTEGER := 0;
  touchpoint_count INTEGER := 0;
  has_booking BOOLEAN := FALSE;
  lead_data RECORD;
  last_interaction TIMESTAMPTZ;
  message_count INTEGER := 0;
  conversation_summary TEXT;
  unified_ctx JSONB;
BEGIN
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

  IF NOT FOUND THEN RETURN 0; END IF;

  last_interaction := COALESCE(lead_data.last_interaction_at, lead_data.created_at);
  message_count := COALESCE(lead_data.total_interactions, 0);
  conversation_summary := lead_data.summary;
  unified_ctx := COALESCE(lead_data.unified_context, '{}'::jsonb);
  days_inactive := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;

  SELECT COUNT(*) INTO touchpoint_count FROM (
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid
    UNION ALL SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL SELECT 1 FROM voice_sessions WHERE lead_id = lead_uuid
    UNION ALL SELECT 1 FROM social_sessions WHERE lead_id = lead_uuid
  ) t;

  SELECT EXISTS(
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid AND booking_status IN ('pending', 'confirmed')
  ) INTO has_booking;

  -- AI Analysis (60 points max)
  IF message_count > 10 THEN engagement_quality_score := 20;
  ELSIF message_count > 5 THEN engagement_quality_score := 15;
  ELSIF message_count > 2 THEN engagement_quality_score := 10;
  ELSIF message_count > 0 THEN engagement_quality_score := 5;
  END IF;

  IF unified_ctx ? 'intent_signals' THEN
    intent_signals_score := LEAST(20, (unified_ctx->>'intent_signals')::INTEGER);
  ELSIF conversation_summary IS NOT NULL THEN
    IF conversation_summary ILIKE '%interested%' OR conversation_summary ILIKE '%want%' OR
       conversation_summary ILIKE '%need%' OR conversation_summary ILIKE '%book%' OR
       conversation_summary ILIKE '%schedule%' THEN intent_signals_score := 15;
    ELSIF conversation_summary ILIKE '%price%' OR conversation_summary ILIKE '%cost%' OR
          conversation_summary ILIKE '%information%' THEN intent_signals_score := 10;
    ELSE intent_signals_score := 5;
    END IF;
  END IF;

  IF unified_ctx ? 'question_depth' THEN
    question_depth_score := LEAST(20, (unified_ctx->>'question_depth')::INTEGER);
  ELSIF message_count > 5 THEN question_depth_score := 15;
  ELSIF message_count > 2 THEN question_depth_score := 10;
  ELSE question_depth_score := 5;
  END IF;

  ai_score := engagement_quality_score + intent_signals_score + question_depth_score;

  -- Activity Score (30 points max)
  IF days_inactive = 0 THEN response_rate := 1.0;
  ELSIF days_inactive <= 1 THEN response_rate := 0.8;
  ELSIF days_inactive <= 3 THEN response_rate := 0.6;
  ELSIF days_inactive <= 7 THEN response_rate := 0.4;
  ELSE response_rate := 0.2;
  END IF;

  activity_score := ROUND((response_rate * 15) + LEAST(touchpoint_count * 2, 10) - LEAST(days_inactive / 7, 5));
  activity_score := GREATEST(0, activity_score);

  -- Business Score (10 points, but booking gives +50)
  IF has_booking THEN business_score := 50;
  ELSIF days_inactive > 7 AND days_inactive <= 30 AND message_count > 0 THEN business_score := 20;
  END IF;

  final_score := LEAST(100, ai_score + activity_score + business_score);
  RETURN final_score;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION determine_lead_stage(score INTEGER, is_active_chat BOOLEAN, has_booking BOOLEAN)
RETURNS TEXT AS $$
BEGIN
  IF has_booking THEN RETURN 'Booking Made';
  ELSIF score >= 86 THEN RETURN 'Booking Made';
  ELSIF score >= 61 THEN RETURN 'High Intent';
  ELSIF score >= 31 THEN RETURN 'Qualified';
  ELSIF is_active_chat THEN RETURN 'Engaged';
  ELSIF score < 61 THEN RETURN 'In Sequence';
  ELSE RETURN 'New';
  END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  new_score INTEGER;
  new_stage TEXT;
  old_stage TEXT;
  old_sub_stage TEXT;
  old_score INTEGER;
  has_booking BOOLEAN;
  _is_active_chat BOOLEAN;
  has_override BOOLEAN;
BEGIN
  SELECT lead_stage, sub_stage, lead_score, stage_override, is_active_chat,
    EXISTS(SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid AND booking_status IN ('pending', 'confirmed'))
  INTO old_stage, old_sub_stage, old_score, has_override, _is_active_chat, has_booking
  FROM all_leads WHERE id = lead_uuid;

  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Lead not found'); END IF;

  new_score := calculate_lead_score(lead_uuid);
  IF has_override THEN new_stage := old_stage;
  ELSE new_stage := determine_lead_stage(new_score, _is_active_chat, has_booking);
  END IF;

  UPDATE all_leads SET lead_score = new_score, lead_stage = new_stage, last_scored_at = NOW()
  WHERE id = lead_uuid;

  IF old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score THEN
    INSERT INTO lead_stage_changes (lead_id, old_stage, new_stage, old_sub_stage, new_sub_stage, old_score, new_score, changed_by, is_automatic, change_reason)
    VALUES (lead_uuid, old_stage, new_stage, old_sub_stage, NULL, old_score, new_score, user_uuid, NOT has_override,
      CASE WHEN has_override THEN 'Manual override maintained' ELSE 'Automatic score-based update' END);
  END IF;

  RETURN jsonb_build_object('lead_id', lead_uuid, 'old_score', old_score, 'new_score', new_score, 'old_stage', old_stage, 'new_stage', new_stage, 'updated_at', NOW());
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION trigger_update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_lead_score_and_stage(NEW.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Score updates on new conversation messages
DROP TRIGGER IF EXISTS trigger_conversations_update_score ON conversations;
CREATE TRIGGER trigger_conversations_update_score
  AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_update_lead_score();


-- Utility: mark stale leads as no-response
CREATE OR REPLACE FUNCTION check_no_response_leads()
RETURNS void AS $$
BEGIN
  UPDATE all_leads SET status = 'RNR (No Response)'
  WHERE last_interaction_at < NOW() - INTERVAL '24 hours'
    AND is_active_chat = FALSE
    AND status != 'RNR (No Response)' AND status != 'Closed' AND status != 'Converted';
END;
$$ LANGUAGE plpgsql;

-- Utility: push low-score leads to sequence
CREATE OR REPLACE FUNCTION push_low_score_to_sequence()
RETURNS void AS $$
BEGIN
  UPDATE all_leads SET lead_stage = 'In Sequence'
  WHERE lead_score < 61
    AND lead_stage NOT IN ('In Sequence', 'Cold', 'Converted', 'Closed Lost')
    AND stage_override = FALSE;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. AUTO-CREATE LEAD TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_lead_from_session()
RETURNS TRIGGER AS $$
DECLARE
  normalized_phone TEXT;
  existing_lead_id UUID;
  new_lead_id UUID;
BEGIN
  IF NEW.customer_phone IS NULL OR NEW.lead_id IS NOT NULL THEN RETURN NEW; END IF;

  normalized_phone := normalize_phone_trigger(NEW.customer_phone);
  IF normalized_phone IS NULL THEN RETURN NEW; END IF;

  -- Find existing lead by phone + brand
  SELECT id INTO existing_lead_id FROM all_leads
  WHERE customer_phone_normalized = normalized_phone AND brand = NEW.brand LIMIT 1;

  -- Fallback: find by email + brand
  IF existing_lead_id IS NULL AND NEW.customer_email IS NOT NULL THEN
    SELECT id INTO existing_lead_id FROM all_leads
    WHERE email = NEW.customer_email AND brand = NEW.brand LIMIT 1;
  END IF;

  IF existing_lead_id IS NOT NULL THEN
    UPDATE all_leads SET
      customer_name = COALESCE(NEW.customer_name, customer_name),
      email = COALESCE(NEW.customer_email, email),
      phone = COALESCE(NEW.customer_phone, phone),
      customer_phone_normalized = COALESCE(normalized_phone, customer_phone_normalized),
      last_touchpoint = 'web',
      last_interaction_at = GREATEST(COALESCE(last_interaction_at, '1970-01-01'::timestamp), COALESCE(NEW.updated_at, NEW.created_at)),
      unified_context = COALESCE(
        jsonb_set(COALESCE(unified_context, '{}'::jsonb), '{web}',
          jsonb_build_object('conversation_summary', NEW.conversation_summary, 'booking_status', NEW.booking_status,
            'booking_date', NEW.booking_date, 'booking_time', NEW.booking_time, 'user_inputs', COALESCE(NEW.user_inputs_summary, '[]'::jsonb))),
        unified_context)
    WHERE id = existing_lead_id;
    new_lead_id := existing_lead_id;
  ELSE
    INSERT INTO all_leads (customer_name, email, phone, customer_phone_normalized, first_touchpoint, last_touchpoint, last_interaction_at, brand, unified_context)
    VALUES (NEW.customer_name, NEW.customer_email, NEW.customer_phone, normalized_phone, 'web', 'web',
      COALESCE(NEW.updated_at, NEW.created_at), NEW.brand,
      jsonb_build_object('web', jsonb_build_object('conversation_summary', NEW.conversation_summary, 'booking_status', NEW.booking_status,
        'booking_date', NEW.booking_date, 'booking_time', NEW.booking_time, 'user_inputs', COALESCE(NEW.user_inputs_summary, '[]'::jsonb))))
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_lead_id;

    IF new_lead_id IS NULL THEN
      SELECT id INTO new_lead_id FROM all_leads
      WHERE customer_phone_normalized = normalized_phone AND brand = NEW.brand LIMIT 1;
    END IF;
  END IF;

  IF new_lead_id IS NOT NULL THEN NEW.lead_id := new_lead_id; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_lead_from_session ON web_sessions;
CREATE TRIGGER trigger_auto_create_lead_from_session
  BEFORE UPDATE ON web_sessions
  FOR EACH ROW
  WHEN (NEW.customer_phone IS NOT NULL AND NEW.lead_id IS NULL)
  EXECUTE FUNCTION auto_create_lead_from_session();

DROP TRIGGER IF EXISTS trigger_auto_create_lead_on_insert ON web_sessions;
CREATE TRIGGER trigger_auto_create_lead_on_insert
  BEFORE INSERT ON web_sessions
  FOR EACH ROW
  WHEN (NEW.customer_phone IS NOT NULL)
  EXECUTE FUNCTION auto_create_lead_from_session();


-- ============================================================================
-- 6. KNOWLEDGE BASE SEARCH (hybrid FTS + vector)
-- ============================================================================

CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_text TEXT,
  query_embedding vector(384) DEFAULT NULL,
  match_limit INTEGER DEFAULT 5,
  filter_brand TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_subcategory TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID, knowledge_base_id UUID, content TEXT, chunk_index INTEGER,
  title TEXT, source_type TEXT, relevance FLOAT, search_method TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  ts_query tsquery;
BEGIN
  ts_query := plainto_tsquery('english', query_text);
  RETURN QUERY
  WITH ranked AS (
    -- Chunk-level full-text search
    SELECT c.id, c.knowledge_base_id, c.content, c.chunk_index,
      kb.title, kb.type AS source_type,
      ts_rank_cd(c.fts_vector, ts_query)::FLOAT AS relevance,
      'fulltext'::TEXT AS search_method
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
    WHERE c.fts_vector @@ ts_query AND kb.embeddings_status = 'ready'
      AND (filter_brand IS NULL OR kb.brand = filter_brand)
    UNION ALL
    -- Q&A direct match
    SELECT kb.id, kb.id, COALESCE(kb.answer, kb.content, ''), 0,
      COALESCE(kb.question, kb.title), kb.type,
      ts_rank_cd(to_tsvector('english', coalesce(kb.question,'') || ' ' || coalesce(kb.answer,'') || ' ' || coalesce(kb.content,'')), ts_query)::FLOAT,
      'qa_match'::TEXT
    FROM knowledge_base kb
    WHERE to_tsvector('english', coalesce(kb.question,'') || ' ' || coalesce(kb.answer,'') || ' ' || coalesce(kb.content,'')) @@ ts_query
      AND kb.embeddings_status = 'ready'
      AND (filter_brand IS NULL OR kb.brand = filter_brand)
      AND (filter_category IS NULL OR kb.category = filter_category)
      AND (filter_subcategory IS NULL OR kb.subcategory = filter_subcategory)
    UNION ALL
    -- Vector similarity
    SELECT c.id, c.knowledge_base_id, c.content, c.chunk_index,
      kb.title, kb.type, (1 - (c.embedding <=> query_embedding))::FLOAT, 'vector'::TEXT
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
    WHERE query_embedding IS NOT NULL AND c.embedding IS NOT NULL AND kb.embeddings_status = 'ready'
      AND (filter_brand IS NULL OR kb.brand = filter_brand)
    ORDER BY c.embedding <=> query_embedding LIMIT match_limit
  ),
  deduplicated AS (
    SELECT DISTINCT ON (ranked.id) ranked.* FROM ranked ORDER BY ranked.id, ranked.relevance DESC
  )
  SELECT d.id, d.knowledge_base_id, d.content, d.chunk_index, d.title, d.source_type, d.relevance, d.search_method
  FROM deduplicated d ORDER BY d.relevance DESC LIMIT match_limit;
END;
$$;


-- ============================================================================
-- 7. UNIFIED LEADS VIEW
-- ============================================================================

DROP VIEW IF EXISTS unified_leads;
CREATE OR REPLACE VIEW unified_leads WITH (security_invoker = true) AS
SELECT
  al.id, al.first_touchpoint, al.last_touchpoint,
  al.customer_name AS name, al.email, al.phone, al.brand,
  al.created_at AS timestamp, al.last_interaction_at,
  COALESCE(al.lead_score, 0) AS lead_score,
  COALESCE(al.lead_stage, 'New') AS lead_stage,
  al.sub_stage,
  COALESCE(al.stage_override, FALSE) AS stage_override,
  al.last_scored_at, al.is_active_chat,
  COALESCE(
    (SELECT ws.booking_status FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1),
    'new'
  ) AS status,
  (SELECT ws.booking_date FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1) AS booking_date,
  (SELECT ws.booking_time FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1) AS booking_time,
  JSONB_BUILD_OBJECT(
    'web_data', (SELECT JSONB_BUILD_OBJECT('customer_name', ws.customer_name, 'booking_status', ws.booking_status,
      'booking_date', ws.booking_date, 'booking_time', ws.booking_time, 'conversation_summary', ws.conversation_summary,
      'message_count', ws.message_count, 'last_message_at', ws.last_message_at, 'session_status', ws.session_status)
      FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1),
    'whatsapp_data', (SELECT JSONB_BUILD_OBJECT('message_count', whs.message_count, 'last_message_at', whs.last_message_at,
      'conversation_status', whs.conversation_status, 'overall_sentiment', whs.overall_sentiment)
      FROM whatsapp_sessions whs WHERE whs.lead_id = al.id ORDER BY whs.created_at DESC LIMIT 1),
    'voice_data', (SELECT JSONB_BUILD_OBJECT('call_duration', vs.call_duration_seconds, 'call_status', vs.call_status, 'sentiment', vs.sentiment)
      FROM voice_sessions vs WHERE vs.lead_id = al.id ORDER BY vs.created_at DESC LIMIT 1),
    'social_data', (SELECT JSONB_AGG(JSONB_BUILD_OBJECT('platform', ss.platform, 'engagement_type', ss.engagement_type))
      FROM social_sessions ss WHERE ss.lead_id = al.id)
  ) AS metadata,
  al.unified_context
FROM all_leads al
WHERE al.customer_name IS NOT NULL OR al.email IS NOT NULL OR al.phone IS NOT NULL;


-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE all_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

-- dashboard_users: self or admin
DROP POLICY IF EXISTS "Users can view own profile or admin" ON dashboard_users;
CREATE POLICY "Users can view own profile or admin" ON dashboard_users FOR SELECT USING (auth.uid() = id OR is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users can update own profile or admin" ON dashboard_users;
CREATE POLICY "Users can update own profile or admin" ON dashboard_users FOR UPDATE USING (auth.uid() = id OR is_admin(auth.uid()));

-- user_invitations: admin only
DROP POLICY IF EXISTS "Admins can manage invitations" ON user_invitations;
CREATE POLICY "Admins can manage invitations" ON user_invitations FOR ALL USING (is_admin(auth.uid()));

-- dashboard_settings: read = authenticated, write = admin
DROP POLICY IF EXISTS "Authenticated can read settings" ON dashboard_settings;
CREATE POLICY "Authenticated can read settings" ON dashboard_settings FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admins can write settings" ON dashboard_settings;
CREATE POLICY "Admins can write settings" ON dashboard_settings FOR ALL USING (is_admin(auth.uid()));

-- All data tables: open access (auth handled at app layer)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'dashboard_leads', 'all_leads', 'web_sessions', 'whatsapp_sessions',
    'voice_sessions', 'social_sessions', 'conversations',
    'lead_stage_changes', 'lead_stage_overrides', 'lead_activities',
    'knowledge_base', 'knowledge_base_chunks'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Open select %s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Open select %s" ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Open insert %s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Open insert %s" ON %I FOR INSERT WITH CHECK (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Open update %s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Open update %s" ON %I FOR UPDATE USING (true) WITH CHECK (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Open delete %s" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "Open delete %s" ON %I FOR DELETE USING (true)', tbl, tbl);
  END LOOP;
END $$;


-- ============================================================================
-- 9. GRANTS
-- ============================================================================

GRANT SELECT ON unified_leads TO authenticated, anon;
GRANT ALL ON knowledge_base TO anon, authenticated;
GRANT ALL ON knowledge_base_chunks TO anon, authenticated;

GRANT EXECUTE ON FUNCTION calculate_lead_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION determine_lead_stage(INTEGER, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION update_lead_score_and_stage(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_no_response_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION push_low_score_to_sequence() TO authenticated;
GRANT EXECUTE ON FUNCTION search_knowledge_base(TEXT, vector, INTEGER, TEXT, TEXT, TEXT) TO authenticated, anon;


-- ============================================================================
-- 10. REALTIME PUBLICATION
-- ============================================================================

-- Add tables to Supabase Realtime (used by dashboard for live updates)
DO $$
BEGIN
  -- Drop and recreate to ensure clean state
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE all_leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE web_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE voice_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE social_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE dashboard_leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ============================================================================
-- DONE! Your PROXe database is ready.
-- Next: Create your first admin user with seed_admin.sql
-- ============================================================================

-- ===== migrations/019_whatsapp_delivery_status.sql =====
-- ============================================================================
-- Migration: WhatsApp Delivery Status Tracking
-- Adds dedicated columns for tracking Meta WhatsApp message delivery status
-- ============================================================================
-- Created: 2026-03-30
-- Purpose: Enable automatic delivery status updates from Meta webhooks
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW COLUMNS TO CONVERSATIONS TABLE
-- ============================================================================

-- Add delivery_status column with check constraint for valid Meta statuses
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS delivery_status TEXT 
CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));

COMMENT ON COLUMN conversations.delivery_status IS 
'Meta WhatsApp message delivery status: pending=awaiting send, sent=Meta accepted, delivered=received by device, read=opened by user, failed=delivery error';

-- Add status_updated_at timestamp column
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.status_updated_at IS 
'When the delivery_status was last updated from Meta webhook';

-- Add status error details column for failed messages
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status_error TEXT;

COMMENT ON COLUMN conversations.status_error IS 
'Error message from Meta when delivery_status is failed';

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for fast webhook lookups by WhatsApp message ID
CREATE INDEX IF NOT EXISTS idx_conversations_metadata_whatsapp_msg_id 
ON conversations USING BTREE ((metadata->>'whatsapp_message_id'))
WHERE metadata->>'whatsapp_message_id' IS NOT NULL;

COMMENT ON INDEX idx_conversations_metadata_whatsapp_msg_id IS 
'Fast lookup of conversations by Meta WhatsApp message ID (wamid) for webhook status updates';

-- Index for filtering by delivery status
CREATE INDEX IF NOT EXISTS idx_conversations_delivery_status 
ON conversations(delivery_status)
WHERE delivery_status IS NOT NULL;

COMMENT ON INDEX idx_conversations_delivery_status IS 
'Filter conversations by delivery status for dashboard display and sync jobs';

-- Composite index for sync cron job (pending/sent messages within date range)
CREATE INDEX IF NOT EXISTS idx_conversations_status_sync 
ON conversations(delivery_status, created_at)
WHERE delivery_status IN ('pending', 'sent') AND created_at > NOW() - INTERVAL '7 days';

COMMENT ON INDEX idx_conversations_status_sync IS 
'Efficient queries for status sync cron job to find messages needing status check';

-- Index for lead lookup with pending/failed messages
CREATE INDEX IF NOT EXISTS idx_conversations_lead_delivery 
ON conversations(lead_id, delivery_status)
WHERE delivery_status IN ('pending', 'failed');

-- ============================================================================
-- 3. BACKFILL EXISTING DATA
-- ============================================================================

-- Set 'sent' for all existing agent WhatsApp messages (Meta confirmed receipt)
UPDATE conversations 
SET 
  delivery_status = 'sent',
  status_updated_at = created_at
WHERE 
  channel = 'whatsapp'
  AND sender = 'agent'
  AND delivery_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';

-- Set 'pending' for recent agent WhatsApp messages (might still be processing)
UPDATE conversations 
SET 
  delivery_status = 'pending',
  status_updated_at = created_at
WHERE 
  channel = 'whatsapp'
  AND sender = 'agent'
  AND delivery_status IS NULL
  AND created_at >= NOW() - INTERVAL '24 hours';

-- Customer messages are always 'read' from our perspective (we received them)
UPDATE conversations 
SET 
  delivery_status = 'read',
  status_updated_at = created_at
WHERE 
  channel = 'whatsapp'
  AND sender = 'customer'
  AND delivery_status IS NULL;

-- ============================================================================
-- 4. ENABLE REALTIME FOR STATUS UPDATES
-- ============================================================================

-- Add conversations table to realtime publication for live dashboard updates
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================================
-- 5. CREATE HELPER FUNCTION FOR STATUS UPDATES
-- ============================================================================

-- Function to update delivery status with proper validation
CREATE OR REPLACE FUNCTION update_message_delivery_status(
  p_conversation_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_valid_statuses TEXT[] := ARRAY['pending', 'sent', 'delivered', 'read', 'failed'];
BEGIN
  -- Validate status
  IF NOT (p_status = ANY(v_valid_statuses)) THEN
    RAISE EXCEPTION 'Invalid delivery status: %', p_status;
  END IF;
  
  -- Update conversation
  UPDATE conversations 
  SET 
    delivery_status = p_status,
    status_updated_at = NOW(),
    status_error = CASE WHEN p_status = 'failed' THEN p_error ELSE status_error END,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{delivery_status}',
      to_jsonb(p_status)
    )
  WHERE id = p_conversation_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_message_delivery_status IS 
'Atomically update message delivery status with validation and metadata sync';

-- ============================================================================
-- 6. ADD COOLDOWN COLUMN TO ALL_LEADS (for failed message handling)
-- ============================================================================

ALTER TABLE all_leads 
ADD COLUMN IF NOT EXISTS follow_up_cooldown_until TIMESTAMPTZ;

COMMENT ON COLUMN all_leads.follow_up_cooldown_until IS 
'When status is failed, cooldown until this time before sending follow-up (24h from failure)';

CREATE INDEX IF NOT EXISTS idx_all_leads_cooldown 
ON all_leads(follow_up_cooldown_until) 
WHERE follow_up_cooldown_until IS NOT NULL;

-- ============================================================================
-- 7. CREATE STATUS SYNC QUEUE TABLE (for race condition handling)
-- ============================================================================

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
ON status_sync_queue(created_at) 
WHERE processed_at IS NULL;

COMMENT ON TABLE status_sync_queue IS 
'Temporary queue for status webhooks that arrived before DB write (race condition handling)';

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_message_delivery_status TO authenticated, anon;
GRANT ALL ON status_sync_queue TO authenticated, anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Deploy code changes to webhook handlers
-- 2. Deploy dashboard UI updates
-- 3. Test end-to-end delivery status flow
-- ============================================================================

-- ===== migrations/020_unified_lead_status.sql =====
-- ============================================================================
-- Migration: Unified Lead Status System
-- Cleans up dead columns, consolidates override flags, adds stage transitions table
-- ============================================================================
-- Created: 2026-03-30
-- Purpose: Fix conflicting stage lists and redundant override columns
-- ============================================================================

-- ============================================================================
-- 1. CREATE STAGE_TRANSITIONS TABLE (for audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  from_sub_stage TEXT,
  to_sub_stage TEXT,
  reason TEXT, -- 'manual_override', 'auto_scoring', 'booking_made', 're_engagement', etc.
  triggered_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL, -- NULL for automatic
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_transitions_lead_id ON stage_transitions(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_created_at ON stage_transitions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_reason ON stage_transitions(reason);

COMMENT ON TABLE stage_transitions IS 
'Audit log of all lead stage changes, tracking whether changes were manual or automatic';

COMMENT ON COLUMN stage_transitions.reason IS 
'Type of transition: manual_override, auto_scoring, booking_made, re_engagement, system_cold, etc.';

-- ============================================================================
-- 2. ADD COMMENTS TO CLARIFY SUB_STAGE USAGE
-- ============================================================================

COMMENT ON COLUMN all_leads.sub_stage IS 
'Only used when lead_stage = ''High Intent''. Values: proposal, negotiation, on-hold. NULL for other stages.';

-- ============================================================================
-- 3. CREATE TRIGGER FUNCTION FOR STAGE TRANSITION LOGGING
-- ============================================================================

CREATE OR REPLACE FUNCTION log_stage_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_reason TEXT;
  v_triggered_by UUID;
BEGIN
  -- Determine reason based on context
  IF NEW.stage_override = TRUE AND OLD.stage_override = FALSE THEN
    v_reason := 'manual_override';
  ELSIF NEW.stage_override = FALSE AND OLD.stage_override = TRUE THEN
    v_reason := 'auto_scoring_resumed';
  ELSIF NEW.lead_stage = 'Booking Made' AND OLD.lead_stage != 'Booking Made' THEN
    v_reason := 'booking_made';
  ELSIF NEW.lead_stage = 'Cold' AND OLD.lead_stage != 'Cold' THEN
    v_reason := 'system_cold';
  ELSIF NEW.lead_stage = 'Engaged' AND OLD.lead_stage = 'Cold' THEN
    v_reason := 're_engagement';
  ELSIF NEW.lead_stage = 'In Sequence' AND OLD.lead_stage != 'In Sequence' THEN
    v_reason := 'entered_sequence';
  ELSE
    v_reason := 'auto_scoring';
  END IF;
  
  -- Get current user from session if available (for manual changes)
  v_triggered_by := current_setting('app.current_user_id', true)::UUID;
  
  -- Only log if stage actually changed
  IF OLD.lead_stage IS DISTINCT FROM NEW.lead_stage OR 
     OLD.sub_stage IS DISTINCT FROM NEW.sub_stage THEN
    INSERT INTO stage_transitions (
      lead_id, 
      from_stage, 
      to_stage, 
      from_sub_stage, 
      to_sub_stage,
      reason,
      triggered_by,
      metadata
    ) VALUES (
      NEW.id,
      OLD.lead_stage,
      NEW.lead_stage,
      OLD.sub_stage,
      NEW.sub_stage,
      v_reason,
      v_triggered_by,
      jsonb_build_object(
        'old_score', OLD.lead_score,
        'new_score', NEW.lead_score,
        'was_overridden', OLD.stage_override,
        'is_overridden', NEW.stage_override
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for stage transition logging
DROP TRIGGER IF EXISTS trigger_log_stage_transition ON all_leads;
CREATE TRIGGER trigger_log_stage_transition
  AFTER UPDATE OF lead_stage, sub_stage ON all_leads
  FOR EACH ROW EXECUTE FUNCTION log_stage_transition();

-- ============================================================================
-- 4. UPDATE TRIGGER TO REMOVE is_manual_override SYNC
-- ============================================================================

-- Drop the old sync trigger
DROP TRIGGER IF EXISTS trigger_sync_stage_override ON all_leads;

-- Drop the old sync function
DROP FUNCTION IF EXISTS sync_stage_override_columns();

-- Create new simplified function that only handles stage_override
CREATE OR REPLACE FUNCTION handle_stage_override()
RETURNS TRIGGER AS $$
BEGIN
  -- When stage is manually changed, set override flag
  IF TG_OP = 'UPDATE' THEN
    -- If lead_stage is being changed manually (not by scoring function)
    -- and override is not already set, mark it as overridden
    IF NEW.lead_stage IS DISTINCT FROM OLD.lead_stage 
       AND NEW.stage_override = FALSE
       AND (NEW.metadata->>'changed_by_scoring') IS NULL THEN
      NEW.stage_override := TRUE;
    END IF;
    
    -- Clear sub_stage if not High Intent
    IF NEW.lead_stage != 'High Intent' THEN
      NEW.sub_stage := NULL;
    END IF;
    
    -- Clear scoring flag from metadata
    IF NEW.metadata ? 'changed_by_scoring' THEN
      NEW.metadata := NEW.metadata - 'changed_by_scoring';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger
DROP TRIGGER IF EXISTS trigger_handle_stage_override ON all_leads;
CREATE TRIGGER trigger_handle_stage_override
  BEFORE UPDATE ON all_leads
  FOR EACH ROW EXECUTE FUNCTION handle_stage_override();

-- ============================================================================
-- 5. UPDATE SCORING FUNCTION TO RESPECT OVERRIDE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  new_score INTEGER;
  new_stage TEXT;
  old_stage TEXT;
  old_sub_stage TEXT;
  old_score INTEGER;
  has_booking BOOLEAN;
  _is_active_chat BOOLEAN;
  has_override BOOLEAN;
  days_inactive INTEGER;
BEGIN
  SELECT lead_stage, sub_stage, lead_score, stage_override, is_active_chat,
    EXISTS(SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid AND booking_status IN ('pending', 'confirmed'))
  INTO old_stage, old_sub_stage, old_score, has_override, _is_active_chat, has_booking
  FROM all_leads WHERE id = lead_uuid;

  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Lead not found'); END IF;

  -- Calculate new score
  new_score := calculate_lead_score(lead_uuid);
  
  -- Calculate days since last interaction
  SELECT COALESCE(EXTRACT(DAY FROM NOW() - last_interaction_at), 999)
  INTO days_inactive
  FROM all_leads WHERE id = lead_uuid;

  -- Determine new stage based on rules
  IF has_override THEN 
    -- Override is set: keep current stage unless specific business rules apply
    new_stage := old_stage;
    
    -- Business Rule 1: Booking always forces 'Booking Made' regardless of override
    IF has_booking AND old_stage != 'Booking Made' THEN
      new_stage := 'Booking Made';
      has_override := FALSE; -- Clear override for booking
    END IF;
    
    -- Business Rule 2: Re-engagement after 30+ days of Cold moves to Engaged
    IF old_stage = 'Cold' AND _is_active_chat THEN
      new_stage := 'Engaged';
      has_override := FALSE; -- Allow AI to take over
    END IF;
  ELSE
    -- No override: use automatic stage determination
    IF has_booking THEN 
      new_stage := 'Booking Made';
    ELSIF new_score >= 86 THEN 
      new_stage := 'Booking Made';
    ELSIF new_score >= 61 THEN 
      new_stage := 'High Intent';
    ELSIF new_score >= 31 THEN 
      new_stage := 'Qualified';
    ELSIF _is_active_chat THEN 
      new_stage := 'Engaged';
    ELSIF days_inactive > 30 AND old_stage = 'In Sequence' THEN
      -- Auto-transition to Cold after 30 days in sequence with no response
      new_stage := 'Cold';
    ELSIF new_score < 61 THEN 
      new_stage := 'In Sequence';
    ELSE 
      new_stage := 'New';
    END IF;
  END IF;

  -- Update lead with metadata flag to identify scoring changes
  UPDATE all_leads 
  SET 
    lead_score = new_score, 
    lead_stage = new_stage,
    stage_override = has_override,
    last_scored_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"changed_by_scoring": true}'::jsonb
  WHERE id = lead_uuid;

  -- Log to lead_stage_changes (legacy table)
  IF old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score THEN
    INSERT INTO lead_stage_changes (lead_id, old_stage, new_stage, old_sub_stage, new_sub_stage, old_score, new_score, changed_by, is_automatic, change_reason)
    VALUES (lead_uuid, old_stage, new_stage, old_sub_stage, NULL, old_score, new_score, user_uuid, NOT has_override,
      CASE 
        WHEN has_override AND NOT has_booking THEN 'Manual override maintained (except for booking)'
        WHEN has_booking AND old_stage != 'Booking Made' THEN 'Automatic: Booking made'
        WHEN old_stage = 'Cold' AND _is_active_chat THEN 'Automatic: Re-engagement after cold'
        ELSE 'Automatic score-based update' 
      END);
  END IF;

  RETURN jsonb_build_object('lead_id', lead_uuid, 'old_score', old_score, 'new_score', new_score, 'old_stage', old_stage, 'new_stage', new_stage, 'was_overridden', has_override, 'updated_at', NOW());
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNCTION TO CLEAR STAGE OVERRIDE (Reset to AI Mode)
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_stage_override(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Clear override flag
  UPDATE all_leads 
  SET 
    stage_override = FALSE,
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  -- Trigger recalculation
  result := update_lead_score_and_stage(lead_uuid, user_uuid);
  
  -- Log the override removal
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, result->>'old_stage', result->>'new_stage', 'override_cleared', user_uuid);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_stage_override IS 
'Remove manual stage override and recalculate stage based on current score. Returns the result of score recalculation.';

GRANT EXECUTE ON FUNCTION clear_stage_override TO authenticated, anon;

-- ============================================================================
-- 7. BACKFILL EXISTING DATA
-- ============================================================================

-- Migrate existing transitions from lead_stage_changes to new table
INSERT INTO stage_transitions (lead_id, from_stage, to_stage, from_sub_stage, to_sub_stage, reason, triggered_by, created_at)
SELECT 
  lead_id,
  old_stage,
  new_stage,
  old_sub_stage,
  new_sub_stage,
  CASE 
    WHEN is_automatic THEN 'auto_scoring'
    ELSE 'manual_override'
  END,
  changed_by,
  created_at
FROM lead_stage_changes
WHERE created_at > NOW() - INTERVAL '90 days' -- Only recent changes
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT ALL ON stage_transitions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION log_stage_transition TO authenticated;
GRANT EXECUTE ON FUNCTION handle_stage_override TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Note: status and is_manual_override columns will be dropped in a future
-- migration after code has been updated to stop referencing them.
-- For now, they remain but are ignored by the application logic.
-- ============================================================================

-- ===== migrations/021_add_flow_stages.sql =====
-- ============================================================================
-- Migration: Add Missing Flow Journey Stages
-- Adds No Show, Demo Taken, Proposal Sent to lead_stage enum
-- ============================================================================
-- Created: 2026-03-30
-- Purpose: Support complete flow builder with 9 journey stages
-- ============================================================================

-- ============================================================================
-- 1. UPDATE LEAD_STAGE CHECK CONSTRAINT
-- ============================================================================

-- First, drop the existing check constraint
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_lead_stage_check;

-- Add the updated check constraint with new stages
ALTER TABLE all_leads ADD CONSTRAINT all_leads_lead_stage_check 
CHECK (lead_stage IN (
  'New', 
  'Engaged', 
  'Qualified', 
  'High Intent', 
  'Booking Made',
  'No Show',           -- NEW: Booking missed
  'Demo Taken',        -- NEW: Demo completed  
  'Proposal Sent',     -- NEW: Proposal delivered
  'Converted', 
  'Closed Lost', 
  'In Sequence', 
  'Cold'
));

-- ============================================================================
-- 2. UPDATE determine_lead_stage() FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION determine_lead_stage(
  score INTEGER, 
  is_active_chat BOOLEAN, 
  has_booking BOOLEAN,
  booking_status TEXT DEFAULT NULL,
  demo_completed BOOLEAN DEFAULT FALSE,
  proposal_sent BOOLEAN DEFAULT FALSE
)
RETURNS TEXT AS $$
BEGIN
  -- Priority 1: Terminal/Outcome stages (manual or triggered)
  IF demo_completed THEN 
    RETURN 'Demo Taken';
  END IF;
  
  IF proposal_sent THEN 
    RETURN 'Proposal Sent';
  END IF;
  
  -- Priority 2: Booking-related stages
  IF has_booking OR booking_status IN ('confirmed', 'pending') THEN 
    RETURN 'Booking Made';
  END IF;
  
  -- Priority 3: Score-based stages
  IF score >= 86 THEN 
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

COMMENT ON FUNCTION determine_lead_stage IS 
'Determines lead stage based on score, activity, and milestone flags (demo_completed, proposal_sent)';

-- ============================================================================
-- 3. CREATE FUNCTION TO MARK BOOKING AS NO-SHOW
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_booking_no_show(lead_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  old_stage TEXT;
  result JSONB;
BEGIN
  -- Get current stage
  SELECT lead_stage INTO old_stage FROM all_leads WHERE id = lead_uuid;
  
  IF old_stage IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  -- Update to No Show
  UPDATE all_leads 
  SET 
    lead_stage = 'No Show',
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  -- Log transition
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, old_stage, 'No Show', 'booking_no_show', NULL);
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', lead_uuid,
    'old_stage', old_stage,
    'new_stage', 'No Show'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_booking_no_show IS 
'Marks a lead as No Show when they miss a scheduled booking';

GRANT EXECUTE ON FUNCTION mark_booking_no_show TO authenticated, anon;

-- ============================================================================
-- 4. CREATE FUNCTION TO MARK DEMO COMPLETED
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_demo_completed(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  old_stage TEXT;
  result JSONB;
BEGIN
  SELECT lead_stage INTO old_stage FROM all_leads WHERE id = lead_uuid;
  
  IF old_stage IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  UPDATE all_leads 
  SET 
    lead_stage = 'Demo Taken',
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, old_stage, 'Demo Taken', 'demo_completed', user_uuid);
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', lead_uuid,
    'old_stage', old_stage,
    'new_stage', 'Demo Taken'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_demo_completed IS 
'Marks a lead as Demo Taken after product demo is completed';

GRANT EXECUTE ON FUNCTION mark_demo_completed TO authenticated, anon;

-- ============================================================================
-- 5. CREATE FUNCTION TO MARK PROPOSAL SENT
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_proposal_sent(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  old_stage TEXT;
  result JSONB;
BEGIN
  SELECT lead_stage INTO old_stage FROM all_leads WHERE id = lead_uuid;
  
  IF old_stage IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  UPDATE all_leads 
  SET 
    lead_stage = 'Proposal Sent',
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, old_stage, 'Proposal Sent', 'proposal_delivered', user_uuid);
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', lead_uuid,
    'old_stage', old_stage,
    'new_stage', 'Proposal Sent'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_proposal_sent IS 
'Marks a lead as Proposal Sent when pricing/proposal is delivered';

GRANT EXECUTE ON FUNCTION mark_proposal_sent TO authenticated, anon;

-- ============================================================================
-- 6. UPDATE EXISTING STAGE NAMES TO MATCH FLOW JOURNEY
-- ============================================================================

-- Map existing stages to flow journey equivalents if needed
-- Note: 'New' maps to 'one_touch' journey stage conceptually
-- 'Engaged' maps to 'engaged'
-- 'High Intent' maps to 'high_intent'
-- etc.

-- Add metadata to track journey stage mapping
COMMENT ON COLUMN all_leads.lead_stage IS 
'Lead stage in customer journey: New, Engaged, Qualified, High Intent, Booking Made, No Show, Demo Taken, Proposal Sent, Converted, Closed Lost, In Sequence, Cold';

-- ============================================================================
-- 7. CREATE FOLLOW_UP_TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_templates (
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
  
  -- Unique constraint: one template per stage/day/channel/variant/brand
  UNIQUE(brand, stage, day, channel, variant)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_stage ON follow_up_templates(stage);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_day ON follow_up_templates(day);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_channel ON follow_up_templates(channel);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_meta_status ON follow_up_templates(meta_status);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_active ON follow_up_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_lookup ON follow_up_templates(brand, stage, day, channel, is_active);

COMMENT ON TABLE follow_up_templates IS 
'Templates for automated follow-up sequences at each journey stage/day/channel';

COMMENT ON COLUMN follow_up_templates.stage IS 
'Journey stage: one_touch, low_touch, engaged, high_intent, booking_made, no_show, demo_taken, proposal_sent, converted';

COMMENT ON COLUMN follow_up_templates.day IS 
'Day in sequence: 1, 3, 7, 30, 90';

COMMENT ON COLUMN follow_up_templates.current_variant IS 
'Which variant (A/B/C) will be sent next (for rotation)';

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_follow_up_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_follow_up_templates ON follow_up_templates;
CREATE TRIGGER trigger_update_follow_up_templates
  BEFORE UPDATE ON follow_up_templates
  FOR EACH ROW EXECUTE FUNCTION update_follow_up_templates_updated_at();

-- ============================================================================
-- 8. CREATE FUNCTION TO GET NEXT TEMPLATE VARIANT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_template_variant(
  p_brand TEXT,
  p_stage TEXT,
  p_day INTEGER,
  p_channel TEXT
)
RETURNS TABLE (
  template_id UUID,
  meta_template_name TEXT,
  content TEXT,
  variant TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fut.id,
    fut.meta_template_name,
    fut.content,
    fut.variant
  FROM follow_up_templates fut
  WHERE fut.brand = p_brand
    AND fut.stage = p_stage
    AND fut.day = p_day
    AND fut.channel = p_channel
    AND fut.is_active = TRUE
    AND fut.meta_status = 'approved'
    AND fut.variant = (
      -- Get the current_variant from the A variant record (or any variant)
      SELECT current_variant 
      FROM follow_up_templates 
      WHERE brand = p_brand 
        AND stage = p_stage 
        AND day = p_day 
        AND channel = p_channel
        AND variant = 'A'
      LIMIT 1
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_template_variant IS 
'Returns the next template variant (A/B/C) to send based on rotation logic';

GRANT EXECUTE ON FUNCTION get_next_template_variant TO authenticated, anon;

-- ============================================================================
-- 9. CREATE FUNCTION TO ROTATE VARIANT AFTER SEND
-- ============================================================================

CREATE OR REPLACE FUNCTION rotate_template_variant(
  p_brand TEXT,
  p_stage TEXT,
  p_day INTEGER,
  p_channel TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_current TEXT;
  v_next TEXT;
BEGIN
  -- Get current variant
  SELECT current_variant INTO v_current
  FROM follow_up_templates
  WHERE brand = p_brand 
    AND stage = p_stage 
    AND day = p_day 
    AND channel = p_channel
    AND variant = 'A'
  LIMIT 1;
  
  IF v_current IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Determine next variant (A->B->C->A)
  v_next := CASE v_current
    WHEN 'A' THEN 'B'
    WHEN 'B' THEN 'C'
    WHEN 'C' THEN 'A'
    ELSE 'A'
  END;
  
  -- Update all variants for this slot
  UPDATE follow_up_templates
  SET current_variant = v_next,
      send_count = send_count + CASE WHEN variant = v_current THEN 1 ELSE 0 END,
      last_sent_at = CASE WHEN variant = v_current THEN NOW() ELSE last_sent_at END
  WHERE brand = p_brand 
    AND stage = p_stage 
    AND day = p_day 
    AND channel = p_channel;
  
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rotate_template_variant IS 
'Rotates to next variant (A->B->C->A) after a template is sent';

GRANT EXECUTE ON FUNCTION rotate_template_variant TO authenticated, anon;

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT ALL ON follow_up_templates TO authenticated, anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
