-- Migration: Backfill windchasers data from web_sessions to all_leads.unified_context.windchasers
-- This script extracts user_type, course_interest, timeline from web_sessions.user_inputs_summary
-- and updates all_leads.unified_context.windchasers for existing leads

DO $$
DECLARE
  lead_record RECORD;
  session_record RECORD;
  user_inputs JSONB;
  windchasers_data JSONB;
  updated_count INTEGER := 0;
BEGIN
  -- Loop through all leads that have linked web_sessions
  FOR lead_record IN 
    SELECT DISTINCT al.id, al.unified_context, al.brand
    FROM all_leads al
    INNER JOIN web_sessions ws ON ws.lead_id = al.id
    WHERE al.brand = 'windchasers'
      AND ws.user_inputs_summary IS NOT NULL
      AND jsonb_array_length(ws.user_inputs_summary) > 0
  LOOP
    -- Get the most recent web_session for this lead with user_inputs_summary
    SELECT ws.user_inputs_summary INTO user_inputs
    FROM web_sessions ws
    WHERE ws.lead_id = lead_record.id
      AND ws.user_inputs_summary IS NOT NULL
      AND jsonb_array_length(ws.user_inputs_summary) > 0
    ORDER BY ws.created_at DESC
    LIMIT 1;

    IF user_inputs IS NOT NULL THEN
      -- Extract windchasers data from user_inputs_summary
      windchasers_data := '{}'::jsonb;
      
      -- Loop through user_inputs to find windchasers fields
      FOR session_record IN 
        SELECT * FROM jsonb_array_elements(user_inputs) AS input
      LOOP
        IF (session_record.input->>'user_type') IS NOT NULL THEN
          windchasers_data := windchasers_data || jsonb_build_object('user_type', session_record.input->>'user_type');
        END IF;
        
        IF (session_record.input->>'course_interest') IS NOT NULL THEN
          windchasers_data := windchasers_data || jsonb_build_object('course_interest', session_record.input->>'course_interest');
        END IF;
        
        IF (session_record.input->>'timeline') IS NOT NULL THEN
          windchasers_data := windchasers_data || jsonb_build_object(
            'timeline', session_record.input->>'timeline',
            'plan_to_fly', session_record.input->>'timeline'
          );
        END IF;
        
        IF (session_record.input->>'education') IS NOT NULL THEN
          windchasers_data := windchasers_data || jsonb_build_object('education', session_record.input->>'education');
        END IF;
      END LOOP;

      -- Only update if we found windchasers data
      IF jsonb_object_keys(windchasers_data) IS NOT NULL THEN
        -- Merge with existing unified_context
        UPDATE all_leads
        SET unified_context = COALESCE(unified_context, '{}'::jsonb) || 
            jsonb_build_object(
              'windchasers', 
              COALESCE(unified_context->'windchasers', '{}'::jsonb) || windchasers_data
            ),
            updated_at = NOW()
        WHERE id = lead_record.id;
        
        updated_count := updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfilled windchasers data for % leads', updated_count;
END $$;

-- Also update leads when web_sessions are updated (trigger for future updates)
CREATE OR REPLACE FUNCTION sync_windchasers_data_from_session()
RETURNS TRIGGER AS $$
DECLARE
  windchasers_data JSONB;
  input_record RECORD;
BEGIN
  -- Only process if user_inputs_summary exists and has data
  IF NEW.user_inputs_summary IS NOT NULL AND jsonb_array_length(NEW.user_inputs_summary) > 0 AND NEW.lead_id IS NOT NULL THEN
    windchasers_data := '{}'::jsonb;
    
    -- Extract windchasers data from user_inputs_summary
    FOR input_record IN 
      SELECT * FROM jsonb_array_elements(NEW.user_inputs_summary) AS input
    LOOP
      IF (input_record.input->>'user_type') IS NOT NULL THEN
        windchasers_data := windchasers_data || jsonb_build_object('user_type', input_record.input->>'user_type');
      END IF;
      
      IF (input_record.input->>'course_interest') IS NOT NULL THEN
        windchasers_data := windchasers_data || jsonb_build_object('course_interest', input_record.input->>'course_interest');
      END IF;
      
      IF (input_record.input->>'timeline') IS NOT NULL THEN
        windchasers_data := windchasers_data || jsonb_build_object(
          'timeline', input_record.input->>'timeline',
          'plan_to_fly', input_record.input->>'timeline'
        );
      END IF;
      
      IF (input_record.input->>'education') IS NOT NULL THEN
        windchasers_data := windchasers_data || jsonb_build_object('education', input_record.input->>'education');
      END IF;
    END LOOP;

    -- Update all_leads if we found windchasers data
    IF jsonb_object_keys(windchasers_data) IS NOT NULL THEN
      UPDATE all_leads
      SET unified_context = COALESCE(unified_context, '{}'::jsonb) || 
          jsonb_build_object(
            'windchasers', 
            COALESCE(unified_context->'windchasers', '{}'::jsonb) || windchasers_data
          ),
          updated_at = NOW()
      WHERE id = NEW.lead_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync windchasers data when web_sessions are updated
DROP TRIGGER IF EXISTS trigger_sync_windchasers_data ON web_sessions;
CREATE TRIGGER trigger_sync_windchasers_data
  AFTER INSERT OR UPDATE OF user_inputs_summary, lead_id ON web_sessions
  FOR EACH ROW
  WHEN (NEW.user_inputs_summary IS NOT NULL AND NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION sync_windchasers_data_from_session();
