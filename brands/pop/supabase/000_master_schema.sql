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
