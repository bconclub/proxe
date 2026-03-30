-- ============================================================================
-- Migration: Unified Lead Status System
-- Cleans up dead columns, consolidates override flags, adds stage transitions table
-- ============================================================================
-- Created: 2026-03-30
-- Purpose: Fix conflicting stage lists and redundant override columns
-- ============================================================================

-- ============================================================================
-- 1. CREATE STAGE_TRANSITIONS TABLE (for audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  from_sub_stage TEXT,
  to_sub_stage TEXT,
  reason TEXT, -- 'manual_override', 'auto_scoring', 'booking_made', 're_engagement', etc.
  triggered_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL, -- NULL for automatic
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_transitions_lead_id ON stage_transitions(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_created_at ON stage_transitions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_reason ON stage_transitions(reason);

COMMENT ON TABLE stage_transitions IS 
'Audit log of all lead stage changes, tracking whether changes were manual or automatic';

COMMENT ON COLUMN stage_transitions.reason IS 
'Type of transition: manual_override, auto_scoring, booking_made, re_engagement, system_cold, etc.';

-- ============================================================================
-- 2. ADD COMMENTS TO CLARIFY SUB_STAGE USAGE
-- ============================================================================

COMMENT ON COLUMN all_leads.sub_stage IS 
'Only used when lead_stage = ''High Intent''. Values: proposal, negotiation, on-hold. NULL for other stages.';

-- ============================================================================
-- 3. CREATE TRIGGER FUNCTION FOR STAGE TRANSITION LOGGING
-- ============================================================================

CREATE OR REPLACE FUNCTION log_stage_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_reason TEXT;
  v_triggered_by UUID;
BEGIN
  -- Determine reason based on context
  IF NEW.stage_override = TRUE AND OLD.stage_override = FALSE THEN
    v_reason := 'manual_override';
  ELSIF NEW.stage_override = FALSE AND OLD.stage_override = TRUE THEN
    v_reason := 'auto_scoring_resumed';
  ELSIF NEW.lead_stage = 'Booking Made' AND OLD.lead_stage != 'Booking Made' THEN
    v_reason := 'booking_made';
  ELSIF NEW.lead_stage = 'Cold' AND OLD.lead_stage != 'Cold' THEN
    v_reason := 'system_cold';
  ELSIF NEW.lead_stage = 'Engaged' AND OLD.lead_stage = 'Cold' THEN
    v_reason := 're_engagement';
  ELSIF NEW.lead_stage = 'In Sequence' AND OLD.lead_stage != 'In Sequence' THEN
    v_reason := 'entered_sequence';
  ELSE
    v_reason := 'auto_scoring';
  END IF;
  
  -- Get current user from session if available (for manual changes)
  v_triggered_by := current_setting('app.current_user_id', true)::UUID;
  
  -- Only log if stage actually changed
  IF OLD.lead_stage IS DISTINCT FROM NEW.lead_stage OR 
     OLD.sub_stage IS DISTINCT FROM NEW.sub_stage THEN
    INSERT INTO stage_transitions (
      lead_id, 
      from_stage, 
      to_stage, 
      from_sub_stage, 
      to_sub_stage,
      reason,
      triggered_by,
      metadata
    ) VALUES (
      NEW.id,
      OLD.lead_stage,
      NEW.lead_stage,
      OLD.sub_stage,
      NEW.sub_stage,
      v_reason,
      v_triggered_by,
      jsonb_build_object(
        'old_score', OLD.lead_score,
        'new_score', NEW.lead_score,
        'was_overridden', OLD.stage_override,
        'is_overridden', NEW.stage_override
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for stage transition logging
DROP TRIGGER IF EXISTS trigger_log_stage_transition ON all_leads;
CREATE TRIGGER trigger_log_stage_transition
  AFTER UPDATE OF lead_stage, sub_stage ON all_leads
  FOR EACH ROW EXECUTE FUNCTION log_stage_transition();

-- ============================================================================
-- 4. UPDATE TRIGGER TO REMOVE is_manual_override SYNC
-- ============================================================================

-- Drop the old sync trigger
DROP TRIGGER IF EXISTS trigger_sync_stage_override ON all_leads;

-- Drop the old sync function
DROP FUNCTION IF EXISTS sync_stage_override_columns();

-- Create new simplified function that only handles stage_override
CREATE OR REPLACE FUNCTION handle_stage_override()
RETURNS TRIGGER AS $$
BEGIN
  -- When stage is manually changed, set override flag
  IF TG_OP = 'UPDATE' THEN
    -- If lead_stage is being changed manually (not by scoring function)
    -- and override is not already set, mark it as overridden
    IF NEW.lead_stage IS DISTINCT FROM OLD.lead_stage 
       AND NEW.stage_override = FALSE
       AND (NEW.metadata->>'changed_by_scoring') IS NULL THEN
      NEW.stage_override := TRUE;
    END IF;
    
    -- Clear sub_stage if not High Intent
    IF NEW.lead_stage != 'High Intent' THEN
      NEW.sub_stage := NULL;
    END IF;
    
    -- Clear scoring flag from metadata
    IF NEW.metadata ? 'changed_by_scoring' THEN
      NEW.metadata := NEW.metadata - 'changed_by_scoring';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger
DROP TRIGGER IF EXISTS trigger_handle_stage_override ON all_leads;
CREATE TRIGGER trigger_handle_stage_override
  BEFORE UPDATE ON all_leads
  FOR EACH ROW EXECUTE FUNCTION handle_stage_override();

-- ============================================================================
-- 5. UPDATE SCORING FUNCTION TO RESPECT OVERRIDE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  new_score INTEGER;
  new_stage TEXT;
  old_stage TEXT;
  old_sub_stage TEXT;
  old_score INTEGER;
  has_booking BOOLEAN;
  _is_active_chat BOOLEAN;
  has_override BOOLEAN;
  days_inactive INTEGER;
BEGIN
  SELECT lead_stage, sub_stage, lead_score, stage_override, is_active_chat,
    EXISTS(SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid AND booking_status IN ('pending', 'confirmed'))
  INTO old_stage, old_sub_stage, old_score, has_override, _is_active_chat, has_booking
  FROM all_leads WHERE id = lead_uuid;

  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Lead not found'); END IF;

  -- Calculate new score
  new_score := calculate_lead_score(lead_uuid);
  
  -- Calculate days since last interaction
  SELECT COALESCE(EXTRACT(DAY FROM NOW() - last_interaction_at), 999)
  INTO days_inactive
  FROM all_leads WHERE id = lead_uuid;

  -- Determine new stage based on rules
  IF has_override THEN 
    -- Override is set: keep current stage unless specific business rules apply
    new_stage := old_stage;
    
    -- Business Rule 1: Booking always forces 'Booking Made' regardless of override
    IF has_booking AND old_stage != 'Booking Made' THEN
      new_stage := 'Booking Made';
      has_override := FALSE; -- Clear override for booking
    END IF;
    
    -- Business Rule 2: Re-engagement after 30+ days of Cold moves to Engaged
    IF old_stage = 'Cold' AND _is_active_chat THEN
      new_stage := 'Engaged';
      has_override := FALSE; -- Allow AI to take over
    END IF;
  ELSE
    -- No override: use automatic stage determination
    IF has_booking THEN 
      new_stage := 'Booking Made';
    ELSIF new_score >= 86 THEN 
      new_stage := 'Booking Made';
    ELSIF new_score >= 61 THEN 
      new_stage := 'High Intent';
    ELSIF new_score >= 31 THEN 
      new_stage := 'Qualified';
    ELSIF _is_active_chat THEN 
      new_stage := 'Engaged';
    ELSIF days_inactive > 30 AND old_stage = 'In Sequence' THEN
      -- Auto-transition to Cold after 30 days in sequence with no response
      new_stage := 'Cold';
    ELSIF new_score < 61 THEN 
      new_stage := 'In Sequence';
    ELSE 
      new_stage := 'New';
    END IF;
  END IF;

  -- Update lead with metadata flag to identify scoring changes
  UPDATE all_leads 
  SET 
    lead_score = new_score, 
    lead_stage = new_stage,
    stage_override = has_override,
    last_scored_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"changed_by_scoring": true}'::jsonb
  WHERE id = lead_uuid;

  -- Log to lead_stage_changes (legacy table)
  IF old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score THEN
    INSERT INTO lead_stage_changes (lead_id, old_stage, new_stage, old_sub_stage, new_sub_stage, old_score, new_score, changed_by, is_automatic, change_reason)
    VALUES (lead_uuid, old_stage, new_stage, old_sub_stage, NULL, old_score, new_score, user_uuid, NOT has_override,
      CASE 
        WHEN has_override AND NOT has_booking THEN 'Manual override maintained (except for booking)'
        WHEN has_booking AND old_stage != 'Booking Made' THEN 'Automatic: Booking made'
        WHEN old_stage = 'Cold' AND _is_active_chat THEN 'Automatic: Re-engagement after cold'
        ELSE 'Automatic score-based update' 
      END);
  END IF;

  RETURN jsonb_build_object('lead_id', lead_uuid, 'old_score', old_score, 'new_score', new_score, 'old_stage', old_stage, 'new_stage', new_stage, 'was_overridden', has_override, 'updated_at', NOW());
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNCTION TO CLEAR STAGE OVERRIDE (Reset to AI Mode)
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_stage_override(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  -- Clear override flag
  UPDATE all_leads 
  SET 
    stage_override = FALSE,
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  -- Trigger recalculation
  result := update_lead_score_and_stage(lead_uuid, user_uuid);
  
  -- Log the override removal
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, result->>'old_stage', result->>'new_stage', 'override_cleared', user_uuid);
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_stage_override IS 
'Remove manual stage override and recalculate stage based on current score. Returns the result of score recalculation.';

GRANT EXECUTE ON FUNCTION clear_stage_override TO authenticated, anon;

-- ============================================================================
-- 7. BACKFILL EXISTING DATA
-- ============================================================================

-- Migrate existing transitions from lead_stage_changes to new table
INSERT INTO stage_transitions (lead_id, from_stage, to_stage, from_sub_stage, to_sub_stage, reason, triggered_by, created_at)
SELECT 
  lead_id,
  old_stage,
  new_stage,
  old_sub_stage,
  new_sub_stage,
  CASE 
    WHEN is_automatic THEN 'auto_scoring'
    ELSE 'manual_override'
  END,
  changed_by,
  created_at
FROM lead_stage_changes
WHERE created_at > NOW() - INTERVAL '90 days' -- Only recent changes
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT ALL ON stage_transitions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION log_stage_transition TO authenticated;
GRANT EXECUTE ON FUNCTION handle_stage_override TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Note: status and is_manual_override columns will be dropped in a future
-- migration after code has been updated to stop referencing them.
-- For now, they remain but are ignored by the application logic.
-- ============================================================================
