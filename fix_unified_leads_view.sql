-- Fix unified_leads View - Adjust column names to match your sessions table
-- Run the check_sessions_columns.sql first to see your actual column names
-- Then adjust this script accordingly

-- Drop the existing view
DROP VIEW IF EXISTS unified_leads;

-- Recreate the view with flexible column mapping
-- Adjust column names below to match your actual sessions table structure
CREATE OR REPLACE VIEW unified_leads AS
SELECT 
  s.id,
  -- Try different possible column names for name
  COALESCE(s.user_name, s.name, s.full_name, s.customer_name) AS name,
  -- Email should be straightforward
  s.email,
  -- Try different possible column names for phone
  COALESCE(s.phone, s.phone_number, s.mobile, s.contact_phone) AS phone,
  -- Try different possible column names for channel/source
  COALESCE(s.channel, s.source, s.source_channel, 'web') AS source,
  -- Timestamp
  COALESCE(s.created_at, s.timestamp, s.created_on) AS timestamp,
  -- Map booking_status to status
  CASE 
    WHEN s.booking_status = 'confirmed' THEN 'booked'
    WHEN s.booking_status = 'pending' THEN 'pending'
    WHEN s.booking_status = 'cancelled' THEN 'cancelled'
    WHEN s.status = 'booked' THEN 'booked'
    WHEN s.status = 'pending' THEN 'pending'
    WHEN s.status = 'cancelled' THEN 'cancelled'
    ELSE COALESCE(s.status, NULL)
  END AS status,
  s.booking_date,
  s.booking_time,
  COALESCE(s.channel, s.source, s.source_channel, 'web') AS lead_type,
  -- Combine metadata
  COALESCE(
    jsonb_build_object(
      'conversation_summary', s.conversation_summary,
      'user_inputs_summary', s.user_inputs_summary,
      'message_count', s.message_count,
      'last_message_at', s.last_message_at,
      'google_event_id', s.google_event_id,
      'booking_created_at', s.booking_created_at,
      'brand', s.brand,
      'website_url', s.website_url,
      'channel_data', s.channel_data,
      'metadata', s.metadata
    ),
    '{}'::jsonb
  ) AS metadata
FROM sessions s
WHERE (
  COALESCE(s.user_name, s.name, s.full_name, s.customer_name) IS NOT NULL 
  OR s.email IS NOT NULL 
  OR COALESCE(s.phone, s.phone_number, s.mobile, s.contact_phone) IS NOT NULL
);

-- Grant access
GRANT SELECT ON unified_leads TO authenticated;
GRANT SELECT ON unified_leads TO anon;

-- Verify it works
SELECT COUNT(*) as total_leads FROM unified_leads;

