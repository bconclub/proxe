-- Create unified_leads view matching your exact sessions table schema
-- Your sessions table has: id, user_name, email, phone, channel, created_at, booking_status, etc.

DROP VIEW IF EXISTS unified_leads;

CREATE OR REPLACE VIEW unified_leads AS
SELECT 
  s.id,
  s.user_name AS name,
  s.email,
  s.phone,
  s.channel AS source,
  s.created_at AS timestamp,
  -- Use status column (defaults to 'New Lead' or 'Call Booked' based on booking_status)
  COALESCE(s.status, 
    CASE 
      WHEN s.booking_status = 'confirmed' THEN 'Call Booked'
      ELSE 'New Lead'
    END
  ) AS status,
  s.booking_date,
  s.booking_time,
  s.channel AS lead_type,
  -- Combine all metadata fields
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
      'external_session_id', s.external_session_id
    ),
    '{}'::jsonb
  ) AS metadata
FROM sessions s
WHERE (
  s.user_name IS NOT NULL 
  OR s.email IS NOT NULL 
  OR s.phone IS NOT NULL
);

-- Grant access to authenticated users
GRANT SELECT ON unified_leads TO authenticated;
GRANT SELECT ON unified_leads TO anon;

-- Ensure sessions table has RLS policy
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view sessions" ON sessions;

CREATE POLICY "Authenticated users can view sessions"
  ON sessions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Test the view
SELECT COUNT(*) as total_leads FROM unified_leads;

-- Test query with actual data
SELECT id, name, email, phone, source, timestamp, status 
FROM unified_leads 
ORDER BY timestamp DESC 
LIMIT 5;

