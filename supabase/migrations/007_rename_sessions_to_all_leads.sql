-- Migration: Multi-Touchpoint Schema
-- Renames sessions to all_leads and creates channel-specific tables
-- This migration implements the multi-touchpoint architecture

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
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe', 'windchasers')),
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
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe', 'windchasers')),
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
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe', 'windchasers')),
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
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe', 'windchasers')),
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
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe', 'windchasers')),
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
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'voice', 'social')),
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

-- Step 15: Migrate existing sessions data to all_leads and web_sessions
-- Only migrate web sessions (channel = 'web')
INSERT INTO all_leads (
  id,
  customer_name,
  email,
  phone,
  customer_phone_normalized,
  first_touchpoint,
  last_touchpoint,
  last_interaction_at,
  brand,
  created_at,
  updated_at
)
SELECT 
  id,
  user_name,
  email,
  phone,
  normalize_phone(phone) AS customer_phone_normalized,
  'web' AS first_touchpoint,
  'web' AS last_touchpoint,
  COALESCE(last_message_at, updated_at, created_at) AS last_interaction_at,
  COALESCE(brand, 'proxe') AS brand,
  created_at,
  updated_at
FROM sessions
WHERE (phone IS NOT NULL OR email IS NOT NULL)
  AND channel = 'web'
ON CONFLICT (customer_phone_normalized, brand) DO NOTHING;

-- Step 16: Migrate to web_sessions
INSERT INTO web_sessions (
  lead_id,
  brand,
  customer_name,
  customer_email,
  customer_phone,
  customer_phone_normalized,
  external_session_id,
  chat_session_id,
  website_url,
  booking_status,
  booking_date,
  booking_time,
  google_event_id,
  booking_created_at,
  conversation_summary,
  user_inputs_summary,
  message_count,
  last_message_at,
  session_status,
  channel_data,
  created_at,
  updated_at
)
SELECT 
  s.id AS lead_id,
  COALESCE(s.brand, 'proxe') AS brand,
  s.user_name,
  s.email,
  s.phone,
  normalize_phone(s.phone) AS customer_phone_normalized,
  s.external_session_id,
  s.channel_data->>'chat_session_id' AS chat_session_id,
  s.website_url,
  s.booking_status,
  s.booking_date,
  s.booking_time,
  s.google_event_id,
  s.booking_created_at,
  s.conversation_summary,
  s.user_inputs_summary,
  COALESCE(s.message_count, 0) AS message_count,
  s.last_message_at,
  CASE 
    WHEN s.message_count > 0 THEN 'completed'
    ELSE 'active'
  END AS session_status,
  COALESCE(s.channel_data, '{}'::jsonb) AS channel_data,
  s.created_at,
  s.updated_at
FROM sessions s
WHERE s.channel = 'web'
  AND EXISTS (SELECT 1 FROM all_leads al WHERE al.id = s.id);

-- Step 17: Create unified_leads view
DROP VIEW IF EXISTS unified_leads;

CREATE OR REPLACE VIEW unified_leads AS
SELECT 
  al.id,
  al.first_touchpoint,
  al.last_touchpoint,
  al.customer_name AS name,
  al.email,
  al.phone,
  al.brand,
  al.created_at AS timestamp,
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
        'session_status', ws.session_status
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
  al.last_interaction_at,
  al.unified_context
FROM all_leads al
WHERE (
  al.customer_name IS NOT NULL 
  OR al.email IS NOT NULL 
  OR al.phone IS NOT NULL
);

-- Step 18: Grant access to unified_leads view
GRANT SELECT ON unified_leads TO authenticated;

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

