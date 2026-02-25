-- Migration: Fix Lead Scoring Trigger
-- The trigger function calls update_lead_score_and_stage with only lead_id,
-- but the function requires user_uuid as well. This migration fixes the trigger.

-- Step 1: Fix the trigger function to handle missing user_uuid
CREATE OR REPLACE FUNCTION trigger_update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Update score when messages are added
  -- Use NULL for user_uuid since triggers don't have user context
  -- The function accepts NULL for user_uuid
  PERFORM update_lead_score_and_stage(NEW.lead_id, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Ensure the trigger exists and is properly attached
DROP TRIGGER IF EXISTS trigger_messages_update_score ON messages;
CREATE TRIGGER trigger_messages_update_score
  AFTER INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION trigger_update_lead_score();

-- Step 3: Verify update_lead_score_and_stage handles NULL user_uuid
-- Update the function to handle NULL user_uuid gracefully
CREATE OR REPLACE FUNCTION update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  new_score INTEGER;
  new_stage TEXT;
  old_stage TEXT;
  old_sub_stage TEXT;
  old_score INTEGER;
  has_override BOOLEAN;
  is_active_chat BOOLEAN;
  has_booking BOOLEAN;
  result JSONB;
BEGIN
  -- Get current state
  SELECT 
    lead_stage,
    sub_stage,
    lead_score,
    stage_override,
    is_active_chat,
    EXISTS(
      SELECT 1 FROM web_sessions 
      WHERE lead_id = lead_uuid 
      AND booking_status IN ('pending', 'confirmed')
    )
  INTO old_stage, old_sub_stage, old_score, has_override, is_active_chat, has_booking
  FROM all_leads
  WHERE id = lead_uuid;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  -- Calculate new score
  new_score := calculate_lead_score(lead_uuid);
  
  -- Determine new stage (only if no override)
  IF has_override THEN
    new_stage := old_stage; -- Keep current stage if overridden
  ELSE
    new_stage := determine_lead_stage(new_score, is_active_chat, has_booking);
  END IF;
  
  -- Update lead
  UPDATE all_leads
  SET 
    lead_score = new_score,
    lead_stage = new_stage,
    last_scored_at = NOW()
  WHERE id = lead_uuid;
  
  -- Log stage change if it changed (only if user_uuid is provided)
  IF (old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score) AND user_uuid IS NOT NULL THEN
    INSERT INTO lead_stage_changes (
      lead_id,
      old_stage,
      new_stage,
      old_sub_stage,
      new_sub_stage,
      old_score,
      new_score,
      changed_by,
      is_automatic,
      change_reason
    ) VALUES (
      lead_uuid,
      old_stage,
      new_stage,
      old_sub_stage,
      NULL,
      old_score,
      new_score,
      user_uuid,
      NOT has_override,
      CASE WHEN has_override THEN 'Manual override maintained' ELSE 'Automatic score-based update' END
    );
  END IF;
  
  RETURN jsonb_build_object(
    'lead_id', lead_uuid,
    'old_score', old_score,
    'new_score', new_score,
    'old_stage', old_stage,
    'new_stage', new_stage,
    'updated_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Migration complete!
-- This ensures:
-- 1. The trigger properly calls update_lead_score_and_stage with NULL user_uuid
-- 2. The trigger only fires when lead_id is NOT NULL
-- 3. The update function handles NULL user_uuid gracefully (doesn't log stage changes without user)

