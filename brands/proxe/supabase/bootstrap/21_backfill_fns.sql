-- Migration: Backfill all_leads from existing web_sessions
-- This script creates all_leads records for web_sessions that have phone/email but no lead_id
-- It's idempotent - can be run multiple times safely

-- Step 1: Create function to normalize phone numbers (same logic as in chatSessions.ts)
CREATE OR REPLACE FUNCTION normalize_phone_for_backfill(phone_number TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone_number IS NULL OR phone_number = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-digit characters
  DECLARE
    digits TEXT;
  BEGIN
    digits := regexp_replace(phone_number, '\D', '', 'g');
    
    -- Need at least 10 digits
    IF digits IS NULL OR length(digits) < 10 THEN
      RETURN NULL;
    END IF;
    
    -- Return last 10 digits for matching
    RETURN right(digits, 10);
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Backfill all_leads from web_sessions with phone/email but no lead_id
-- This handles sessions that have contact info but weren't linked to leads
DO $$
DECLARE
  session_record RECORD;
  normalized_phone TEXT;
  existing_lead_id UUID;
  new_lead_id UUID;
  sessions_processed INTEGER := 0;
  leads_created INTEGER := 0;
  leads_updated INTEGER := 0;
  sessions_linked INTEGER := 0;
BEGIN
  -- Process all web_sessions that have phone or email but no lead_id
  FOR session_record IN 
    SELECT 
      ws.id,
      ws.external_session_id,
      ws.customer_name,
      ws.customer_email,
      ws.customer_phone,
      ws.brand,
      ws.conversation_summary,
      ws.booking_status,
      ws.booking_date,
      ws.booking_time,
      ws.user_inputs_summary,
      ws.created_at,
      ws.updated_at
    FROM web_sessions ws
    WHERE ws.lead_id IS NULL
      AND (ws.customer_phone IS NOT NULL OR ws.customer_email IS NOT NULL)
  LOOP
    sessions_processed := sessions_processed + 1;
    
    -- Normalize phone number
    normalized_phone := normalize_phone_for_backfill(session_record.customer_phone);
    
    -- Try to find existing lead by normalized phone
    IF normalized_phone IS NOT NULL THEN
      SELECT id INTO existing_lead_id
      FROM all_leads
      WHERE customer_phone_normalized = normalized_phone
        AND brand = COALESCE(session_record.brand, 'proxe')
      LIMIT 1;
    END IF;
    
    -- If no existing lead found, try by email
    IF existing_lead_id IS NULL AND session_record.customer_email IS NOT NULL THEN
      SELECT id INTO existing_lead_id
      FROM all_leads
      WHERE email = session_record.customer_email
        AND brand = COALESCE(session_record.brand, 'proxe')
      LIMIT 1;
    END IF;
    
    -- Create or update lead
    IF existing_lead_id IS NOT NULL THEN
      -- Update existing lead
      UPDATE all_leads
      SET
        customer_name = COALESCE(session_record.customer_name, customer_name),
        email = COALESCE(session_record.customer_email, email),
        phone = COALESCE(session_record.customer_phone, phone),
        customer_phone_normalized = COALESCE(normalized_phone, customer_phone_normalized),
        last_touchpoint = 'web',
        last_interaction_at = GREATEST(
          COALESCE(last_interaction_at, '1970-01-01'::timestamp),
          COALESCE(session_record.updated_at, session_record.created_at)
        ),
        unified_context = COALESCE(
          jsonb_set(
            COALESCE(unified_context, '{}'::jsonb),
            '{web}',
            jsonb_build_object(
              'conversation_summary', session_record.conversation_summary,
              'booking_status', session_record.booking_status,
              'booking_date', session_record.booking_date,
              'booking_time', session_record.booking_time,
              'user_inputs', COALESCE(session_record.user_inputs_summary, '[]'::jsonb)
            )
          ),
          unified_context
        )
      WHERE id = existing_lead_id;
      
      leads_updated := leads_updated + 1;
      new_lead_id := existing_lead_id;
    ELSE
      -- Create new lead (need at least phone or email)
      IF normalized_phone IS NOT NULL OR session_record.customer_email IS NOT NULL THEN
        INSERT INTO all_leads (
          customer_name,
          email,
          phone,
          customer_phone_normalized,
          first_touchpoint,
          last_touchpoint,
          last_interaction_at,
          brand,
          unified_context
        )
        VALUES (
          session_record.customer_name,
          session_record.customer_email,
          session_record.customer_phone,
          normalized_phone,
          'web',
          'web',
          COALESCE(session_record.updated_at, session_record.created_at),
          COALESCE(session_record.brand, 'proxe'),
          jsonb_build_object(
            'web',
            jsonb_build_object(
              'conversation_summary', session_record.conversation_summary,
              'booking_status', session_record.booking_status,
              'booking_date', session_record.booking_date,
              'booking_time', session_record.booking_time,
              'user_inputs', COALESCE(session_record.user_inputs_summary, '[]'::jsonb)
            )
          )
        )
        ON CONFLICT (customer_phone_normalized, brand) 
        DO UPDATE SET
          customer_name = COALESCE(EXCLUDED.customer_name, all_leads.customer_name),
          email = COALESCE(EXCLUDED.email, all_leads.email),
          phone = COALESCE(EXCLUDED.phone, all_leads.phone),
          last_touchpoint = 'web',
          last_interaction_at = GREATEST(
            COALESCE(all_leads.last_interaction_at, '1970-01-01'::timestamp),
            EXCLUDED.last_interaction_at
          )
        RETURNING id INTO new_lead_id;
        
        -- If conflict happened, get the existing lead_id
        IF new_lead_id IS NULL THEN
          SELECT id INTO new_lead_id
          FROM all_leads
          WHERE customer_phone_normalized = normalized_phone
            AND brand = COALESCE(session_record.brand, 'proxe')
          LIMIT 1;
        END IF;
        
        leads_created := leads_created + 1;
      ELSE
        -- Skip sessions without phone or email
        CONTINUE;
      END IF;
    END IF;
    
    -- Link session to lead
    IF new_lead_id IS NOT NULL THEN
      UPDATE web_sessions
      SET lead_id = new_lead_id
      WHERE id = session_record.id;
      
      sessions_linked := sessions_linked + 1;
    END IF;
    
  END LOOP;
  
  -- Log results
  RAISE NOTICE 'Backfill complete: Processed % sessions, Created % leads, Updated % leads, Linked % sessions', 
    sessions_processed, leads_created, leads_updated, sessions_linked;
END $$;

-- Step 3: Create index on customer_phone_normalized if it doesn't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_all_leads_phone_normalized 
ON all_leads(customer_phone_normalized) 
WHERE customer_phone_normalized IS NOT NULL;

-- Step 4: Create index on email if it doesn't exist (for email-based lookups)
CREATE INDEX IF NOT EXISTS idx_all_leads_email 
ON all_leads(email) 
WHERE email IS NOT NULL;

-- Step 5: Verify results - show count of sessions still without lead_id
DO $$
DECLARE
  unlinked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unlinked_count
  FROM web_sessions
  WHERE lead_id IS NULL
    AND (customer_phone IS NOT NULL OR customer_email IS NOT NULL);
  
  IF unlinked_count > 0 THEN
    RAISE WARNING 'There are still % web_sessions with phone/email but no lead_id. These may have invalid phone/email formats.', unlinked_count;
  ELSE
    RAISE NOTICE 'All web_sessions with valid phone/email have been linked to leads.';
  END IF;
END $$;

-- Migration complete!
-- This script is idempotent and can be run multiple times safely.
-- It will only process sessions that don't have a lead_id yet.
