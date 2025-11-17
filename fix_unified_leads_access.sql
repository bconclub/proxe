-- Fix unified_leads View - First check your sessions table columns
-- Step 1: Run this to see your actual column names:
/*
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sessions'
ORDER BY ordinal_position;
*/

-- Step 2: After seeing the columns, drop and recreate the view
-- This version tries to handle different column name variations

DROP VIEW IF EXISTS unified_leads;

-- Recreate view with flexible column mapping
CREATE OR REPLACE VIEW unified_leads AS
SELECT 
  -- Try to find the primary key column
  COALESCE(
    s.id::text,
    s.session_id::text,
    s.uuid::text,
    gen_random_uuid()::text
  ) AS id,
  -- Name variations
  COALESCE(s.user_name, s.name, s.full_name, s.customer_name, '') AS name,
  -- Email
  COALESCE(s.email, '') AS email,
  -- Phone variations
  COALESCE(s.phone, s.phone_number, s.mobile, s.contact_phone, '') AS phone,
  -- Source/channel variations
  COALESCE(s.channel, s.source, s.source_channel, 'web') AS source,
  -- Timestamp variations
  COALESCE(s.created_at, s.timestamp, s.created_on, NOW()) AS timestamp,
  -- Status mapping
  CASE 
    WHEN s.booking_status = 'confirmed' THEN 'booked'
    WHEN s.booking_status = 'pending' THEN 'pending'
    WHEN s.booking_status = 'cancelled' THEN 'cancelled'
    WHEN s.status = 'booked' THEN 'booked'
    WHEN s.status = 'pending' THEN 'pending'
    WHEN s.status = 'cancelled' THEN 'cancelled'
    ELSE COALESCE(s.status, 'new')
  END AS status,
  s.booking_date,
  s.booking_time,
  COALESCE(s.channel, s.source, s.source_channel, 'web') AS lead_type,
  COALESCE(s.metadata, s.channel_data, '{}'::jsonb) AS metadata
FROM sessions s
WHERE (
  COALESCE(s.user_name, s.name, s.full_name, s.customer_name) IS NOT NULL 
  OR s.email IS NOT NULL 
  OR COALESCE(s.phone, s.phone_number, s.mobile, s.contact_phone) IS NOT NULL
);

-- Grant access
GRANT SELECT ON unified_leads TO authenticated;
GRANT SELECT ON unified_leads TO anon;

-- Ensure sessions table RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view sessions" ON sessions;

CREATE POLICY "Authenticated users can view sessions"
  ON sessions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Test
SELECT COUNT(*) as total_leads FROM unified_leads;

