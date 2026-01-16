-- Update unified_leads view to match the new schema
-- This ensures the view has all columns expected by the application

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
  al.last_interaction_at,
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

-- Grant access to authenticated users
GRANT SELECT ON unified_leads TO authenticated;

