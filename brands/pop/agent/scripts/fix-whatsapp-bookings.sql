-- Fix WhatsApp bookings not being stored or displayed
--
-- Problem: whatsapp_sessions table was created without booking columns that
-- web_sessions has. When someone books via WhatsApp, storeBooking() tries to
-- write booking_date, booking_time, etc. to whatsapp_sessions and fails (error 42703).
-- The unified_leads view also only pulls booking data from web_sessions,
-- so WhatsApp bookings never appear in the dashboard.
--
-- Fix:
--   1. Add missing columns to whatsapp_sessions
--   2. Rebuild unified_leads view to pull bookings from BOTH web + whatsapp sessions

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 1: Add missing columns to whatsapp_sessions
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS external_session_id TEXT,
  ADD COLUMN IF NOT EXISTS session_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS booking_status TEXT,
  ADD COLUMN IF NOT EXISTS booking_date DATE,
  ADD COLUMN IF NOT EXISTS booking_time TIME,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS booking_created_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Index for external_session_id lookups (critical for storeBooking)
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_external_session_id
  ON whatsapp_sessions(external_session_id) WHERE external_session_id IS NOT NULL;

-- Index for booking_date queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_booking_date
  ON whatsapp_sessions(booking_date) WHERE booking_date IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 2: Add UPDATE RLS policy for whatsapp_sessions (needed for storeBooking)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Allow all users to update whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Allow all users to update whatsapp_sessions"
  ON whatsapp_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 3: Rebuild unified_leads view - pull bookings from BOTH channels
-- ═══════════════════════════════════════════════════════════════════════════════

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
  -- Lead scoring fields
  COALESCE(al.lead_score, 0) AS lead_score,
  COALESCE(al.lead_stage, 'New') AS lead_stage,
  al.sub_stage,
  COALESCE(al.stage_override, FALSE) AS stage_override,
  al.last_scored_at,
  al.is_active_chat,
  -- Status: prefer web booking_status, then whatsapp, then 'new'
  COALESCE(
    (SELECT ws.booking_status FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1),
    (SELECT whs.booking_status FROM whatsapp_sessions whs WHERE whs.lead_id = al.id AND whs.booking_status IS NOT NULL ORDER BY whs.created_at DESC LIMIT 1),
    'new'
  ) AS status,
  -- Booking date: prefer web, fallback to whatsapp
  COALESCE(
    (SELECT ws.booking_date FROM web_sessions ws WHERE ws.lead_id = al.id AND ws.booking_date IS NOT NULL ORDER BY ws.created_at DESC LIMIT 1),
    (SELECT whs.booking_date FROM whatsapp_sessions whs WHERE whs.lead_id = al.id AND whs.booking_date IS NOT NULL ORDER BY whs.created_at DESC LIMIT 1)
  ) AS booking_date,
  -- Booking time: prefer web, fallback to whatsapp
  COALESCE(
    (SELECT ws.booking_time FROM web_sessions ws WHERE ws.lead_id = al.id AND ws.booking_time IS NOT NULL ORDER BY ws.created_at DESC LIMIT 1),
    (SELECT whs.booking_time FROM whatsapp_sessions whs WHERE whs.lead_id = al.id AND whs.booking_time IS NOT NULL ORDER BY whs.created_at DESC LIMIT 1)
  ) AS booking_time,
  -- Metadata with all channel data (now includes whatsapp booking fields)
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
        'overall_sentiment', whs.overall_sentiment,
        'booking_status', whs.booking_status,
        'booking_date', whs.booking_date,
        'booking_time', whs.booking_time
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

-- Grant access
GRANT SELECT ON unified_leads TO authenticated;
GRANT SELECT ON unified_leads TO anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 4: Backfill - try to recover booking data from unified_context JSON
--         (May be empty if storeBooking never reached the all_leads update)
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE whatsapp_sessions whs
SET
  booking_date = (al.unified_context->'whatsapp'->>'booking_date')::DATE,
  booking_time = (al.unified_context->'whatsapp'->>'booking_time')::TIME,
  booking_status = COALESCE(al.unified_context->'whatsapp'->>'booking_status', 'Call Booked')
FROM all_leads al
WHERE whs.lead_id = al.id
  AND whs.booking_date IS NULL
  AND al.unified_context->'whatsapp'->>'booking_date' IS NOT NULL;

-- NOTE: If all_leads.unified_context is also empty (the storeBooking bug caused
-- it to return early before writing there), then past WhatsApp bookings can only
-- be found in the conversations table as message text. Those would need to be
-- manually re-booked or recovered with a custom script parsing conversation content.
