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
