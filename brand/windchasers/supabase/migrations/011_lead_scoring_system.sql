-- Migration: Lead Scoring and Lifecycle System
-- Adds lead scoring, stage tracking, and auto-behaviors

-- Step 1: Add scoring and stage fields to all_leads table
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'New' CHECK (lead_stage IN (
  'New',
  'Engaged',
  'Qualified',
  'High Intent',
  'Booking Made',
  'Converted',
  'Closed Lost',
  'In Sequence',
  'Cold'
)),
ADD COLUMN IF NOT EXISTS sub_stage TEXT,
ADD COLUMN IF NOT EXISTS stage_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_active_chat BOOLEAN DEFAULT FALSE;

-- Step 2: Create indexes for scoring fields
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_score ON all_leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_stage ON all_leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_all_leads_sub_stage ON all_leads(sub_stage) WHERE sub_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_stage_override ON all_leads(stage_override) WHERE stage_override = TRUE;
CREATE INDEX IF NOT EXISTS idx_all_leads_is_active_chat ON all_leads(is_active_chat) WHERE is_active_chat = TRUE;

-- Step 3: Create lead_stage_changes table to log all stage transitions
CREATE TABLE IF NOT EXISTS lead_stage_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  old_sub_stage TEXT,
  new_sub_stage TEXT,
  old_score INTEGER,
  new_score INTEGER,
  changed_by UUID REFERENCES dashboard_users(id),
  change_reason TEXT,
  is_automatic BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Create indexes for lead_stage_changes
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_lead_id ON lead_stage_changes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_created_at ON lead_stage_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_new_stage ON lead_stage_changes(new_stage);

-- Step 5: Create lead_stage_overrides table to track manual overrides
CREATE TABLE IF NOT EXISTS lead_stage_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  overridden_stage TEXT NOT NULL,
  overridden_sub_stage TEXT,
  overridden_by UUID NOT NULL REFERENCES dashboard_users(id),
  override_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  removed_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Step 6: Create indexes for lead_stage_overrides
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_lead_id ON lead_stage_overrides(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_is_active ON lead_stage_overrides(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_lead_stage_overrides_created_at ON lead_stage_overrides(created_at DESC);

-- Step 7: Enable RLS on new tables
ALTER TABLE lead_stage_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_overrides ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies for lead_stage_changes
CREATE POLICY "Authenticated users can view lead_stage_changes"
  ON lead_stage_changes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert lead_stage_changes"
  ON lead_stage_changes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 9: Create RLS policies for lead_stage_overrides
CREATE POLICY "Authenticated users can view lead_stage_overrides"
  ON lead_stage_overrides FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert lead_stage_overrides"
  ON lead_stage_overrides FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update lead_stage_overrides"
  ON lead_stage_overrides FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Step 10: Create function to calculate lead score
-- Scoring Algorithm:
-- AI Analysis (60%): Engagement quality (20%), Intent signals (20%), Question depth (20%)
-- Activity (30%): Response rate, Days inactive, Touchpoints
-- Business (10%): Booking made (+50), Re-engaged (+20)
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  ai_score INTEGER := 0;
  activity_score INTEGER := 0;
  business_score INTEGER := 0;
  final_score INTEGER := 0;
  
  -- AI Analysis components
  engagement_quality_score INTEGER := 0;
  intent_signals_score INTEGER := 0;
  question_depth_score INTEGER := 0;
  
  -- Activity metrics
  response_rate NUMERIC := 0;
  days_inactive INTEGER := 0;
  touchpoint_count INTEGER := 0;
  
  -- Business metrics
  has_booking BOOLEAN := FALSE;
  is_reengaged BOOLEAN := FALSE;
  
  -- Lead data
  lead_data RECORD;
  last_interaction TIMESTAMP WITH TIME ZONE;
  message_count INTEGER := 0;
  conversation_summary TEXT;
  unified_context JSONB;
BEGIN
  -- Get lead data
  SELECT 
    al.*,
    COALESCE(ws.message_count, 0) + COALESCE(whs.message_count, 0) + COALESCE(vs.call_duration_seconds, 0) / 60 AS total_interactions,
    COALESCE(ws.conversation_summary, whs.conversation_summary, vs.call_summary) AS summary,
    al.unified_context
  INTO lead_data
  FROM all_leads al
  LEFT JOIN web_sessions ws ON ws.lead_id = al.id
  LEFT JOIN whatsapp_sessions whs ON whs.lead_id = al.id
  LEFT JOIN voice_sessions vs ON vs.lead_id = al.id
  WHERE al.id = lead_uuid;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  last_interaction := COALESCE(lead_data.last_interaction_at, lead_data.created_at);
  message_count := COALESCE(lead_data.total_interactions, 0);
  conversation_summary := lead_data.summary;
  unified_context := COALESCE(lead_data.unified_context, '{}'::jsonb);
  
  -- Calculate days inactive
  days_inactive := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  
  -- Count touchpoints (sessions across channels)
  SELECT COUNT(*) INTO touchpoint_count
  FROM (
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM voice_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM social_sessions WHERE lead_id = lead_uuid
  ) AS touchpoints;
  
  -- Check for booking
  SELECT EXISTS(
    SELECT 1 FROM web_sessions 
    WHERE lead_id = lead_uuid 
    AND booking_status IN ('pending', 'confirmed')
  ) INTO has_booking;
  
  -- AI Analysis (60% of total score = 60 points max)
  -- Engagement Quality (20% = 20 points max)
  IF message_count > 10 THEN
    engagement_quality_score := 20;
  ELSIF message_count > 5 THEN
    engagement_quality_score := 15;
  ELSIF message_count > 2 THEN
    engagement_quality_score := 10;
  ELSIF message_count > 0 THEN
    engagement_quality_score := 5;
  END IF;
  
  -- Intent Signals (20% = 20 points max)
  -- Check unified_context for intent keywords
  IF unified_context IS NOT NULL AND unified_context ? 'intent_signals' THEN
    intent_signals_score := LEAST(20, (unified_context->>'intent_signals')::INTEGER);
  ELSIF conversation_summary IS NOT NULL THEN
    -- Simple keyword matching for intent
    IF conversation_summary ILIKE '%interested%' OR 
       conversation_summary ILIKE '%want%' OR 
       conversation_summary ILIKE '%need%' OR
       conversation_summary ILIKE '%book%' OR
       conversation_summary ILIKE '%schedule%' THEN
      intent_signals_score := 15;
    ELSIF conversation_summary ILIKE '%price%' OR 
           conversation_summary ILIKE '%cost%' OR
           conversation_summary ILIKE '%information%' THEN
      intent_signals_score := 10;
    ELSE
      intent_signals_score := 5;
    END IF;
  END IF;
  
  -- Question Depth (20% = 20 points max)
  IF unified_context IS NOT NULL AND unified_context ? 'question_depth' THEN
    question_depth_score := LEAST(20, (unified_context->>'question_depth')::INTEGER);
  ELSIF message_count > 5 THEN
    question_depth_score := 15;
  ELSIF message_count > 2 THEN
    question_depth_score := 10;
  ELSE
    question_depth_score := 5;
  END IF;
  
  ai_score := engagement_quality_score + intent_signals_score + question_depth_score;
  
  -- Activity Score (30% of total = 30 points max)
  -- Response rate (based on message count and recency)
  IF days_inactive = 0 THEN
    response_rate := 1.0;
  ELSIF days_inactive <= 1 THEN
    response_rate := 0.8;
  ELSIF days_inactive <= 3 THEN
    response_rate := 0.6;
  ELSIF days_inactive <= 7 THEN
    response_rate := 0.4;
  ELSE
    response_rate := 0.2;
  END IF;
  
  -- Activity points: response rate (15 points) + touchpoints (10 points) - inactivity penalty (5 points)
  activity_score := ROUND((response_rate * 15) + LEAST(touchpoint_count * 2, 10) - LEAST(days_inactive / 7, 5));
  activity_score := GREATEST(0, activity_score);
  
  -- Business Score (10% of total, but can boost beyond 100)
  IF has_booking THEN
    business_score := 50; -- Major boost
  ELSIF days_inactive > 7 AND days_inactive <= 30 AND message_count > 0 THEN
    business_score := 20; -- Re-engaged
  END IF;
  
  -- Calculate final score (capped at 100, but business_score can push it over)
  final_score := ai_score + activity_score + business_score;
  final_score := LEAST(100, final_score);
  
  RETURN final_score;
END;
$$ LANGUAGE plpgsql;

-- Step 11: Create function to determine stage from score
CREATE OR REPLACE FUNCTION determine_lead_stage(score INTEGER, is_active_chat BOOLEAN, has_booking BOOLEAN)
RETURNS TEXT AS $$
BEGIN
  -- Manual stages (Converted, Closed Lost) are set manually, not by score
  -- This function only handles automatic stage assignment
  
  IF has_booking THEN
    RETURN 'Booking Made';
  ELSIF score >= 86 THEN
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

-- Step 12: Create function to update lead score and stage
CREATE OR REPLACE FUNCTION update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  new_score INTEGER;
  new_stage TEXT;
  old_stage TEXT;
  old_sub_stage TEXT;
  old_score INTEGER;
  has_booking BOOLEAN;
  is_active_chat BOOLEAN;
  has_override BOOLEAN;
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
  
  -- Log stage change if it changed
  IF old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score THEN
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

-- Step 13: Create trigger to auto-update score after interaction
CREATE OR REPLACE FUNCTION trigger_update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Update score when messages are added or sessions are updated
  PERFORM update_lead_score_and_stage(NEW.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to messages table
DROP TRIGGER IF EXISTS trigger_messages_update_score ON messages;
CREATE TRIGGER trigger_messages_update_score
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lead_score();

-- Step 14: Create function to check for no response (24 hours)
CREATE OR REPLACE FUNCTION check_no_response_leads()
RETURNS void AS $$
BEGIN
  -- Update leads with no response in 24 hours to "No Response" status
  UPDATE all_leads
  SET status = 'RNR (No Response)'
  WHERE last_interaction_at < NOW() - INTERVAL '24 hours'
    AND is_active_chat = FALSE
    AND status != 'RNR (No Response)'
    AND status != 'Closed'
    AND status != 'Converted';
END;
$$ LANGUAGE plpgsql;

-- Step 15: Create function to push low-score leads to sequence
CREATE OR REPLACE FUNCTION push_low_score_to_sequence()
RETURNS void AS $$
BEGIN
  -- Push leads with score < 61 to "In Sequence" stage
  UPDATE all_leads
  SET lead_stage = 'In Sequence'
  WHERE lead_score < 61
    AND lead_stage NOT IN ('In Sequence', 'Cold', 'Converted', 'Closed Lost')
    AND stage_override = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Step 16: Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_lead_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION determine_lead_stage(INTEGER, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION update_lead_score_and_stage(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_no_response_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION push_low_score_to_sequence() TO authenticated;

-- Migration complete!

