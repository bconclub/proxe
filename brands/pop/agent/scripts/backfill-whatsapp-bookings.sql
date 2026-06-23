-- ═══════════════════════════════════════════════════════════════════════════════
-- BCON - Backfill WhatsApp Bookings
--
-- Run this in Supabase SQL Editor.
-- Step 1: DRY RUN - shows what it found (SELECT only)
-- Step 2: APPLY - uncomment the UPDATE block at the bottom to write
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Find all WhatsApp booking confirmations in conversations ────────
-- Shows agent messages that confirm bookings + parsed date/time + lead info

WITH booking_messages AS (
  SELECT DISTINCT ON (c.lead_id)
    c.lead_id,
    c.content,
    c.created_at AS message_sent_at,
    -- Extract time: "6:00 PM", "3:00 PM", "11:00 AM" etc
    (regexp_match(c.content, '(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))', 'i'))[1] AS raw_time,
    -- Extract date: "March 4th", "March 5", "March 10th" etc
    (regexp_match(c.content, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?', 'i'))[1] AS raw_month,
    (regexp_match(c.content, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?', 'i'))[2] AS raw_day
  FROM conversations c
  WHERE c.channel = 'whatsapp'
    AND c.sender = 'agent'
    AND (
      c.content ILIKE '%locked in%'
      OR c.content ILIKE '%you''re booked%'
      OR c.content ILIKE '%booked!%'
      OR c.content ILIKE '%confirmed for%'
      OR c.content ILIKE '%you''re in%'
    )
    -- Must contain a time reference
    AND c.content ~ '\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)'
  ORDER BY c.lead_id, c.created_at DESC
),
parsed AS (
  SELECT
    bm.*,
    al.customer_name,
    al.phone,
    al.email,
    whs.id AS whatsapp_session_id,
    whs.booking_date AS existing_booking_date,
    whs.booking_time AS existing_booking_time,
    -- Parse the date
    CASE
      WHEN bm.raw_month IS NOT NULL AND bm.raw_day IS NOT NULL THEN
        (bm.raw_month || ' ' || bm.raw_day || ', ' || EXTRACT(YEAR FROM bm.message_sent_at)::TEXT)::DATE
      -- If "tomorrow" is in the text
      WHEN bm.content ILIKE '%tomorrow%' THEN
        (bm.message_sent_at::DATE + INTERVAL '1 day')::DATE
      ELSE NULL
    END AS parsed_date,
    -- Parse the time to HH:MM 24h format
    CASE
      WHEN bm.raw_time IS NOT NULL THEN
        -- Convert "6:00 PM" -> "18:00", "11:00 AM" -> "11:00"
        CASE
          WHEN bm.raw_time ILIKE '%PM%' AND split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT != 12
            THEN LPAD((split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT + 12)::TEXT, 2, '0')
                 || ':' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'P', 1), 2, '0')
          WHEN bm.raw_time ILIKE '%AM%' AND split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT = 12
            THEN '00:' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'A', 1), 2, '0')
          ELSE LPAD(split_part(split_part(bm.raw_time, ':', 1), ' ', 1), 2, '0')
               || ':' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'A', 1), 2, '0')
        END
      ELSE NULL
    END AS parsed_time
  FROM booking_messages bm
  JOIN all_leads al ON al.id = bm.lead_id
  LEFT JOIN whatsapp_sessions whs ON whs.lead_id = bm.lead_id
)
-- ─── DRY RUN: Preview what we found ─────────────────────────────────────────
SELECT
  customer_name,
  phone,
  email,
  parsed_date,
  parsed_time,
  raw_time AS original_time_text,
  existing_booking_date,
  existing_booking_time,
  CASE
    WHEN existing_booking_date IS NOT NULL THEN '⏭️ ALREADY HAS BOOKING'
    WHEN parsed_date IS NULL THEN '⚠️ COULD NOT PARSE DATE'
    WHEN parsed_time IS NULL THEN '⚠️ COULD NOT PARSE TIME'
    WHEN whatsapp_session_id IS NULL THEN '⚠️ NO WHATSAPP SESSION'
    ELSE '✅ READY TO BACKFILL'
  END AS status,
  LEFT(content, 150) AS message_preview,
  message_sent_at,
  lead_id,
  whatsapp_session_id
FROM parsed
ORDER BY message_sent_at DESC;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Step 2: APPLY - Uncomment the block below AFTER reviewing Step 1 results
-- ═══════════════════════════════════════════════════════════════════════════════

/*
-- Update whatsapp_sessions with recovered booking data
WITH booking_messages AS (
  SELECT DISTINCT ON (c.lead_id)
    c.lead_id,
    c.content,
    c.created_at AS message_sent_at,
    (regexp_match(c.content, '(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))', 'i'))[1] AS raw_time,
    (regexp_match(c.content, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?', 'i'))[1] AS raw_month,
    (regexp_match(c.content, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?', 'i'))[2] AS raw_day
  FROM conversations c
  WHERE c.channel = 'whatsapp'
    AND c.sender = 'agent'
    AND (
      c.content ILIKE '%locked in%'
      OR c.content ILIKE '%you''re booked%'
      OR c.content ILIKE '%booked!%'
      OR c.content ILIKE '%confirmed for%'
      OR c.content ILIKE '%you''re in%'
    )
    AND c.content ~ '\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)'
  ORDER BY c.lead_id, c.created_at DESC
),
parsed AS (
  SELECT
    bm.lead_id,
    bm.message_sent_at,
    CASE
      WHEN bm.raw_month IS NOT NULL AND bm.raw_day IS NOT NULL THEN
        (bm.raw_month || ' ' || bm.raw_day || ', ' || EXTRACT(YEAR FROM bm.message_sent_at)::TEXT)::DATE
      WHEN bm.content ILIKE '%tomorrow%' THEN
        (bm.message_sent_at::DATE + INTERVAL '1 day')::DATE
      ELSE NULL
    END AS parsed_date,
    CASE
      WHEN bm.raw_time IS NOT NULL THEN
        CASE
          WHEN bm.raw_time ILIKE '%PM%' AND split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT != 12
            THEN LPAD((split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT + 12)::TEXT, 2, '0')
                 || ':' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'P', 1), 2, '0')
          WHEN bm.raw_time ILIKE '%AM%' AND split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT = 12
            THEN '00:' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'A', 1), 2, '0')
          ELSE LPAD(split_part(split_part(bm.raw_time, ':', 1), ' ', 1), 2, '0')
               || ':' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'A', 1), 2, '0')
        END
      ELSE NULL
    END AS parsed_time
  FROM booking_messages bm
)
UPDATE whatsapp_sessions whs
SET
  booking_date = p.parsed_date,
  booking_time = p.parsed_time::TIME,
  booking_status = 'Call Booked',
  booking_created_at = p.message_sent_at
FROM parsed p
WHERE whs.lead_id = p.lead_id
  AND whs.booking_date IS NULL       -- don't overwrite existing bookings
  AND p.parsed_date IS NOT NULL       -- only if we successfully parsed
  AND p.parsed_time IS NOT NULL;

-- Also update all_leads.unified_context for these leads
WITH booking_messages AS (
  SELECT DISTINCT ON (c.lead_id)
    c.lead_id,
    c.content,
    c.created_at AS message_sent_at,
    (regexp_match(c.content, '(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))', 'i'))[1] AS raw_time,
    (regexp_match(c.content, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?', 'i'))[1] AS raw_month,
    (regexp_match(c.content, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?', 'i'))[2] AS raw_day
  FROM conversations c
  WHERE c.channel = 'whatsapp'
    AND c.sender = 'agent'
    AND (
      c.content ILIKE '%locked in%'
      OR c.content ILIKE '%you''re booked%'
      OR c.content ILIKE '%booked!%'
      OR c.content ILIKE '%confirmed for%'
      OR c.content ILIKE '%you''re in%'
    )
    AND c.content ~ '\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)'
  ORDER BY c.lead_id, c.created_at DESC
),
parsed AS (
  SELECT
    bm.lead_id,
    CASE
      WHEN bm.raw_month IS NOT NULL AND bm.raw_day IS NOT NULL THEN
        (bm.raw_month || ' ' || bm.raw_day || ', ' || EXTRACT(YEAR FROM bm.message_sent_at)::TEXT)::TEXT
      WHEN bm.content ILIKE '%tomorrow%' THEN
        (bm.message_sent_at::DATE + INTERVAL '1 day')::TEXT
      ELSE NULL
    END AS parsed_date,
    CASE
      WHEN bm.raw_time IS NOT NULL THEN
        CASE
          WHEN bm.raw_time ILIKE '%PM%' AND split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT != 12
            THEN LPAD((split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT + 12)::TEXT, 2, '0')
                 || ':' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'P', 1), 2, '0')
          WHEN bm.raw_time ILIKE '%AM%' AND split_part(split_part(bm.raw_time, ':', 1), ' ', 1)::INT = 12
            THEN '00:' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'A', 1), 2, '0')
          ELSE LPAD(split_part(split_part(bm.raw_time, ':', 1), ' ', 1), 2, '0')
               || ':' || LPAD(split_part(split_part(split_part(bm.raw_time, ':', 2), ' ', 1), 'A', 1), 2, '0')
        END
      ELSE NULL
    END AS parsed_time
  FROM booking_messages bm
)
UPDATE all_leads al
SET unified_context = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(al.unified_context, '{}'::jsonb),
      '{whatsapp,booking_status}',
      '"Call Booked"'
    ),
    '{whatsapp,booking_date}',
    to_jsonb(p.parsed_date)
  ),
  '{whatsapp,booking_time}',
  to_jsonb(p.parsed_time)
)
FROM parsed p
WHERE al.id = p.lead_id
  AND p.parsed_date IS NOT NULL
  AND p.parsed_time IS NOT NULL;
*/
