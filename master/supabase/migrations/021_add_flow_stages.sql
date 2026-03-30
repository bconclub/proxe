-- ============================================================================
-- Migration: Add Missing Flow Journey Stages
-- Adds No Show, Demo Taken, Proposal Sent to lead_stage enum
-- ============================================================================
-- Created: 2026-03-30
-- Purpose: Support complete flow builder with 9 journey stages
-- ============================================================================

-- ============================================================================
-- 1. UPDATE LEAD_STAGE CHECK CONSTRAINT
-- ============================================================================

-- First, drop the existing check constraint
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_lead_stage_check;

-- Add the updated check constraint with new stages
ALTER TABLE all_leads ADD CONSTRAINT all_leads_lead_stage_check 
CHECK (lead_stage IN (
  'New', 
  'Engaged', 
  'Qualified', 
  'High Intent', 
  'Booking Made',
  'No Show',           -- NEW: Booking missed
  'Demo Taken',        -- NEW: Demo completed  
  'Proposal Sent',     -- NEW: Proposal delivered
  'Converted', 
  'Closed Lost', 
  'In Sequence', 
  'Cold'
));

-- ============================================================================
-- 2. UPDATE determine_lead_stage() FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION determine_lead_stage(
  score INTEGER, 
  is_active_chat BOOLEAN, 
  has_booking BOOLEAN,
  booking_status TEXT DEFAULT NULL,
  demo_completed BOOLEAN DEFAULT FALSE,
  proposal_sent BOOLEAN DEFAULT FALSE
)
RETURNS TEXT AS $$
BEGIN
  -- Priority 1: Terminal/Outcome stages (manual or triggered)
  IF demo_completed THEN 
    RETURN 'Demo Taken';
  END IF;
  
  IF proposal_sent THEN 
    RETURN 'Proposal Sent';
  END IF;
  
  -- Priority 2: Booking-related stages
  IF has_booking OR booking_status IN ('confirmed', 'pending') THEN 
    RETURN 'Booking Made';
  END IF;
  
  -- Priority 3: Score-based stages
  IF score >= 86 THEN 
    RETURN 'Booking Made';
  ELSIF score >= 61 THEN 
    RETURN 'High Intent';
  ELSIF score >= 31 THEN 
    RETURN 'Qualified';
  ELSIF is_active_chat THEN 
    RETURN 'Engaged';
  ELSIF score < 61 THEN 
    RETURN 'In Sequence';
  ELSE 
    RETURN 'New';
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION determine_lead_stage IS 
'Determines lead stage based on score, activity, and milestone flags (demo_completed, proposal_sent)';

-- ============================================================================
-- 3. CREATE FUNCTION TO MARK BOOKING AS NO-SHOW
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_booking_no_show(lead_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  old_stage TEXT;
  result JSONB;
BEGIN
  -- Get current stage
  SELECT lead_stage INTO old_stage FROM all_leads WHERE id = lead_uuid;
  
  IF old_stage IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  -- Update to No Show
  UPDATE all_leads 
  SET 
    lead_stage = 'No Show',
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  -- Log transition
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, old_stage, 'No Show', 'booking_no_show', NULL);
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', lead_uuid,
    'old_stage', old_stage,
    'new_stage', 'No Show'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_booking_no_show IS 
'Marks a lead as No Show when they miss a scheduled booking';

GRANT EXECUTE ON FUNCTION mark_booking_no_show TO authenticated, anon;

-- ============================================================================
-- 4. CREATE FUNCTION TO MARK DEMO COMPLETED
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_demo_completed(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  old_stage TEXT;
  result JSONB;
BEGIN
  SELECT lead_stage INTO old_stage FROM all_leads WHERE id = lead_uuid;
  
  IF old_stage IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  UPDATE all_leads 
  SET 
    lead_stage = 'Demo Taken',
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, old_stage, 'Demo Taken', 'demo_completed', user_uuid);
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', lead_uuid,
    'old_stage', old_stage,
    'new_stage', 'Demo Taken'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_demo_completed IS 
'Marks a lead as Demo Taken after product demo is completed';

GRANT EXECUTE ON FUNCTION mark_demo_completed TO authenticated, anon;

-- ============================================================================
-- 5. CREATE FUNCTION TO MARK PROPOSAL SENT
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_proposal_sent(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  old_stage TEXT;
  result JSONB;
BEGIN
  SELECT lead_stage INTO old_stage FROM all_leads WHERE id = lead_uuid;
  
  IF old_stage IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;
  
  UPDATE all_leads 
  SET 
    lead_stage = 'Proposal Sent',
    updated_at = NOW()
  WHERE id = lead_uuid;
  
  INSERT INTO stage_transitions (lead_id, from_stage, to_stage, reason, triggered_by)
  VALUES (lead_uuid, old_stage, 'Proposal Sent', 'proposal_delivered', user_uuid);
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', lead_uuid,
    'old_stage', old_stage,
    'new_stage', 'Proposal Sent'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_proposal_sent IS 
'Marks a lead as Proposal Sent when pricing/proposal is delivered';

GRANT EXECUTE ON FUNCTION mark_proposal_sent TO authenticated, anon;

-- ============================================================================
-- 6. UPDATE EXISTING STAGE NAMES TO MATCH FLOW JOURNEY
-- ============================================================================

-- Map existing stages to flow journey equivalents if needed
-- Note: 'New' maps to 'one_touch' journey stage conceptually
-- 'Engaged' maps to 'engaged'
-- 'High Intent' maps to 'high_intent'
-- etc.

-- Add metadata to track journey stage mapping
COMMENT ON COLUMN all_leads.lead_stage IS 
'Lead stage in customer journey: New, Engaged, Qualified, High Intent, Booking Made, No Show, Demo Taken, Proposal Sent, Converted, Closed Lost, In Sequence, Cold';

-- ============================================================================
-- 7. CREATE FOLLOW_UP_TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'default',
  
  -- Stage and timing
  stage TEXT NOT NULL CHECK (stage IN (
    'one_touch', 'low_touch', 'engaged', 'high_intent', 
    'booking_made', 'no_show', 'demo_taken', 'proposal_sent', 'converted'
  )),
  day INTEGER NOT NULL CHECK (day IN (1, 3, 7, 30, 90)),
  
  -- Channel and variant
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'voice', 'sms', 'email')),
  variant TEXT NOT NULL DEFAULT 'A' CHECK (variant IN ('A', 'B', 'C')),
  
  -- Meta template info
  meta_template_name TEXT,
  meta_template_id TEXT,
  meta_status TEXT DEFAULT 'pending' CHECK (meta_status IN ('pending', 'approved', 'rejected')),
  meta_rejection_reason TEXT,
  
  -- Content
  content TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  
  -- Template rotation tracking
  current_variant TEXT DEFAULT 'A' CHECK (current_variant IN ('A', 'B', 'C')),
  send_count INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  
  -- Unique constraint: one template per stage/day/channel/variant/brand
  UNIQUE(brand, stage, day, channel, variant)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_stage ON follow_up_templates(stage);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_day ON follow_up_templates(day);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_channel ON follow_up_templates(channel);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_meta_status ON follow_up_templates(meta_status);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_active ON follow_up_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_lookup ON follow_up_templates(brand, stage, day, channel, is_active);

COMMENT ON TABLE follow_up_templates IS 
'Templates for automated follow-up sequences at each journey stage/day/channel';

COMMENT ON COLUMN follow_up_templates.stage IS 
'Journey stage: one_touch, low_touch, engaged, high_intent, booking_made, no_show, demo_taken, proposal_sent, converted';

COMMENT ON COLUMN follow_up_templates.day IS 
'Day in sequence: 1, 3, 7, 30, 90';

COMMENT ON COLUMN follow_up_templates.current_variant IS 
'Which variant (A/B/C) will be sent next (for rotation)';

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_follow_up_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_follow_up_templates ON follow_up_templates;
CREATE TRIGGER trigger_update_follow_up_templates
  BEFORE UPDATE ON follow_up_templates
  FOR EACH ROW EXECUTE FUNCTION update_follow_up_templates_updated_at();

-- ============================================================================
-- 8. CREATE FUNCTION TO GET NEXT TEMPLATE VARIANT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_template_variant(
  p_brand TEXT,
  p_stage TEXT,
  p_day INTEGER,
  p_channel TEXT
)
RETURNS TABLE (
  template_id UUID,
  meta_template_name TEXT,
  content TEXT,
  variant TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fut.id,
    fut.meta_template_name,
    fut.content,
    fut.variant
  FROM follow_up_templates fut
  WHERE fut.brand = p_brand
    AND fut.stage = p_stage
    AND fut.day = p_day
    AND fut.channel = p_channel
    AND fut.is_active = TRUE
    AND fut.meta_status = 'approved'
    AND fut.variant = (
      -- Get the current_variant from the A variant record (or any variant)
      SELECT current_variant 
      FROM follow_up_templates 
      WHERE brand = p_brand 
        AND stage = p_stage 
        AND day = p_day 
        AND channel = p_channel
        AND variant = 'A'
      LIMIT 1
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_template_variant IS 
'Returns the next template variant (A/B/C) to send based on rotation logic';

GRANT EXECUTE ON FUNCTION get_next_template_variant TO authenticated, anon;

-- ============================================================================
-- 9. CREATE FUNCTION TO ROTATE VARIANT AFTER SEND
-- ============================================================================

CREATE OR REPLACE FUNCTION rotate_template_variant(
  p_brand TEXT,
  p_stage TEXT,
  p_day INTEGER,
  p_channel TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_current TEXT;
  v_next TEXT;
BEGIN
  -- Get current variant
  SELECT current_variant INTO v_current
  FROM follow_up_templates
  WHERE brand = p_brand 
    AND stage = p_stage 
    AND day = p_day 
    AND channel = p_channel
    AND variant = 'A'
  LIMIT 1;
  
  IF v_current IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Determine next variant (A->B->C->A)
  v_next := CASE v_current
    WHEN 'A' THEN 'B'
    WHEN 'B' THEN 'C'
    WHEN 'C' THEN 'A'
    ELSE 'A'
  END;
  
  -- Update all variants for this slot
  UPDATE follow_up_templates
  SET current_variant = v_next,
      send_count = send_count + CASE WHEN variant = v_current THEN 1 ELSE 0 END,
      last_sent_at = CASE WHEN variant = v_current THEN NOW() ELSE last_sent_at END
  WHERE brand = p_brand 
    AND stage = p_stage 
    AND day = p_day 
    AND channel = p_channel;
  
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION rotate_template_variant IS 
'Rotates to next variant (A->B->C->A) after a template is sent';

GRANT EXECUTE ON FUNCTION rotate_template_variant TO authenticated, anon;

-- ============================================================================
-- 10. GRANTS
-- ============================================================================

GRANT ALL ON follow_up_templates TO authenticated, anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
