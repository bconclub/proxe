-- Migration: Auto-create leads when web_sessions are updated with phone numbers
-- This trigger ensures leads are automatically created when sessions get phone numbers
-- Works as a backup to the application-level ensureAllLeads function

-- Step 1: Create function to normalize phone (reuse from backfill migration)
CREATE OR REPLACE FUNCTION normalize_phone_trigger(phone_number TEXT)
RETURNS TEXT AS $$
DECLARE
  digits TEXT;
  cleaned_digits TEXT;
BEGIN
  IF phone_number IS NULL OR phone_number = '' THEN
    RETURN NULL;
  END IF;
  
  -- Remove all non-digit characters
  digits := regexp_replace(phone_number, '\D', '', 'g');
  
  -- Need at least 10 digits
  IF digits IS NULL OR length(digits) < 10 THEN
    RETURN NULL;
  END IF;
  
  cleaned_digits := digits;
  
  -- Remove India country code (+91)
  IF cleaned_digits LIKE '91%' AND length(cleaned_digits) > 10 THEN
    cleaned_digits := substring(cleaned_digits FROM 3);
  END IF;
  
  -- Remove US/Canada country code (+1)
  IF cleaned_digits LIKE '1%' AND length(cleaned_digits) = 11 THEN
    cleaned_digits := substring(cleaned_digits FROM 2);
  END IF;
  
  -- Remove leading zeros
  cleaned_digits := regexp_replace(cleaned_digits, '^0+', '');
  
  -- Need at least 10 digits after cleaning
  IF cleaned_digits IS NULL OR length(cleaned_digits) < 10 THEN
    RETURN NULL;
  END IF;
  
  -- Always return last 10 digits for matching
  RETURN right(cleaned_digits, 10);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Create function to auto-create/update lead when session is updated
CREATE OR REPLACE FUNCTION auto_create_lead_from_session()
RETURNS TRIGGER AS $$
DECLARE
  normalized_phone TEXT;
  existing_lead_id UUID;
  new_lead_id UUID;
BEGIN
  -- Only process if phone number is present and lead_id is NULL
  -- Phone is REQUIRED for lead creation
  IF NEW.customer_phone IS NULL OR NEW.lead_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Only process windchasers brand
  IF NEW.brand != 'windchasers' THEN
    RETURN NEW;
  END IF;
  
  -- Normalize phone number
  normalized_phone := normalize_phone_trigger(NEW.customer_phone);
  
  IF normalized_phone IS NULL THEN
    -- Phone normalization failed, can't create lead
    RETURN NEW;
  END IF;
  
  -- Try to find existing lead by normalized phone
  SELECT id INTO existing_lead_id
  FROM all_leads
  WHERE customer_phone_normalized = normalized_phone
    AND brand = 'windchasers'
  LIMIT 1;
  
  -- If not found by phone, try by email
  IF existing_lead_id IS NULL AND NEW.customer_email IS NOT NULL THEN
    SELECT id INTO existing_lead_id
    FROM all_leads
    WHERE email = NEW.customer_email
      AND brand = 'windchasers'
    LIMIT 1;
  END IF;
  
  -- Create or update lead
  IF existing_lead_id IS NOT NULL THEN
    -- Update existing lead
    UPDATE all_leads
    SET
      customer_name = COALESCE(NEW.customer_name, customer_name),
      email = COALESCE(NEW.customer_email, email),
      phone = COALESCE(NEW.customer_phone, phone),
      customer_phone_normalized = COALESCE(normalized_phone, customer_phone_normalized),
      last_touchpoint = 'web',
      last_interaction_at = GREATEST(
        COALESCE(last_interaction_at, '1970-01-01'::timestamp),
        COALESCE(NEW.updated_at, NEW.created_at)
      ),
      unified_context = COALESCE(
        jsonb_set(
          COALESCE(unified_context, '{}'::jsonb),
          '{web}',
          jsonb_build_object(
            'conversation_summary', NEW.conversation_summary,
            'booking_status', NEW.booking_status,
            'booking_date', NEW.booking_date,
            'booking_time', NEW.booking_time,
            'user_inputs', COALESCE(NEW.user_inputs_summary, '[]'::jsonb)
          )
        ),
        unified_context
      )
    WHERE id = existing_lead_id;
    
    new_lead_id := existing_lead_id;
  ELSE
    -- Create new lead
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
      NEW.customer_name,
      NEW.customer_email,
      NEW.customer_phone,
      normalized_phone,
      'web',
      'web',
      COALESCE(NEW.updated_at, NEW.created_at),
      'windchasers',
      jsonb_build_object(
        'web',
        jsonb_build_object(
          'conversation_summary', NEW.conversation_summary,
          'booking_status', NEW.booking_status,
          'booking_date', NEW.booking_date,
          'booking_time', NEW.booking_time,
          'user_inputs', COALESCE(NEW.user_inputs_summary, '[]'::jsonb)
        )
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_lead_id;
    
    -- If conflict happened, fetch existing lead
    IF new_lead_id IS NULL THEN
      SELECT id INTO new_lead_id
      FROM all_leads
      WHERE customer_phone_normalized = normalized_phone
        AND brand = 'windchasers'
      LIMIT 1;
    END IF;
  END IF;
  
  -- Link session to lead
  IF new_lead_id IS NOT NULL THEN
    NEW.lead_id := new_lead_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger that runs BEFORE UPDATE on web_sessions
-- This ensures lead is created and linked BEFORE the session is updated
DROP TRIGGER IF EXISTS trigger_auto_create_lead_from_session ON web_sessions;

CREATE TRIGGER trigger_auto_create_lead_from_session
  BEFORE UPDATE ON web_sessions
  FOR EACH ROW
  WHEN (
    -- Only trigger when phone is being set/updated and lead_id is NULL
    (NEW.customer_phone IS NOT NULL AND NEW.lead_id IS NULL)
    OR
    -- Or when phone exists but lead_id is still NULL (in case of previous failures)
    (NEW.customer_phone IS NOT NULL AND OLD.customer_phone IS NOT NULL AND NEW.lead_id IS NULL)
  )
  EXECUTE FUNCTION auto_create_lead_from_session();

-- Step 4: Also create trigger for INSERT (for new sessions with phone)
CREATE TRIGGER trigger_auto_create_lead_on_insert
  BEFORE INSERT ON web_sessions
  FOR EACH ROW
  WHEN (NEW.customer_phone IS NOT NULL AND NEW.brand = 'windchasers')
  EXECUTE FUNCTION auto_create_lead_from_session();

-- Step 5: Backfill existing sessions (one-time, automatic)
-- This automatically creates leads for existing sessions that have phone but no lead_id
-- Runs automatically when migration is executed - no manual steps needed
DO $$
DECLARE
  session_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Update sessions to trigger the trigger (automatic backfill)
  FOR session_record IN 
    SELECT external_session_id
    FROM web_sessions
    WHERE brand = 'windchasers'
      AND customer_phone IS NOT NULL
      AND lead_id IS NULL
  LOOP
    -- Trigger update to fire the trigger (automatic)
    UPDATE web_sessions
    SET updated_at = updated_at  -- Touch the record to trigger
    WHERE external_session_id = session_record.external_session_id;
    
    updated_count := updated_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Automatically created leads for % existing sessions', updated_count;
END $$;

-- Migration complete!
-- The trigger is now fully automatic:
-- 1. Automatically fires on INSERT when new session has phone
-- 2. Automatically fires on UPDATE when session gets phone number
-- 3. Automatically creates leads without any manual intervention
-- 4. Works as backup to application-level ensureAllLeads function
-- 5. One-time backfill of existing sessions happens automatically when migration runs
