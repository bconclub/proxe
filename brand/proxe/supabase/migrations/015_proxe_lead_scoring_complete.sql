-- Migration: PROXe Lead Scoring and Activity Tracking System
-- Complete implementation with AI scoring, activity tracking, and unified summary

-- Step 1: Ensure all required fields exist in all_leads table
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS sub_stage TEXT NULL,
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS days_inactive INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_touchpoints INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false;

-- Update existing rows to set last_interaction_at if null
UPDATE all_leads
SET last_interaction_at = COALESCE(last_interaction_at, created_at, NOW())
WHERE last_interaction_at IS NULL;

-- Step 2: Rename lead_activities to activities (if it exists as lead_activities)
-- First check if lead_activities exists, if so rename it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_activities') THEN
    ALTER TABLE lead_activities RENAME TO activities;
  END IF;
END $$;

-- Step 3: Create activities table if it doesn't exist (or ensure it has correct structure)
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'call',              -- Team logged call
    'meeting',           -- Team logged meeting
    'message',           -- Team logged message
    'note'               -- Team logged note
  )),
  note TEXT NOT NULL,
  duration_minutes INTEGER NULL,
  next_followup_date TIMESTAMP WITH TIME ZONE NULL,
  created_by UUID NOT NULL REFERENCES dashboard_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for activities
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_activity_type ON activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_activities_next_followup_date ON activities(next_followup_date) WHERE next_followup_date IS NOT NULL;

-- Enable RLS on activities
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for activities
DROP POLICY IF EXISTS "Authenticated users can view activities" ON activities;
CREATE POLICY "Authenticated users can view activities"
  ON activities FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert activities" ON activities;
CREATE POLICY "Authenticated users can insert activities"
  ON activities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 4: Ensure stage_history table exists with correct structure
CREATE TABLE IF NOT EXISTS stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  score_at_change INTEGER,
  changed_by TEXT NOT NULL, -- values: 'PROXe AI', 'system', or user_id
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for stage_history
CREATE INDEX IF NOT EXISTS idx_stage_history_lead_id ON stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_at ON stage_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_history_new_stage ON stage_history(new_stage);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_by ON stage_history(changed_by);

-- Enable RLS on stage_history
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for stage_history
DROP POLICY IF EXISTS "Authenticated users can view stage_history" ON stage_history;
CREATE POLICY "Authenticated users can view stage_history"
  ON stage_history FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert stage_history" ON stage_history;
CREATE POLICY "Authenticated users can insert stage_history"
  ON stage_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 5: Create function to update lead metrics (response_count, total_touchpoints, days_inactive)
CREATE OR REPLACE FUNCTION update_lead_metrics(lead_uuid UUID)
RETURNS void AS $$
DECLARE
  msg_count INTEGER;
  touchpoint_count INTEGER;
  last_interaction TIMESTAMP WITH TIME ZONE;
  days_inactive_calc INTEGER;
BEGIN
  -- Count messages from customer
  SELECT COUNT(*) INTO msg_count
  FROM messages
  WHERE lead_id = lead_uuid AND sender = 'customer';
  
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
  
  -- Get last interaction
  SELECT COALESCE(MAX(created_at), created_at) INTO last_interaction
  FROM messages
  WHERE lead_id = lead_uuid;
  
  -- Calculate days inactive
  IF last_interaction IS NOT NULL THEN
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  ELSE
    SELECT created_at INTO last_interaction FROM all_leads WHERE id = lead_uuid;
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  END IF;
  
  -- Update lead
  UPDATE all_leads
  SET 
    response_count = msg_count,
    total_touchpoints = touchpoint_count,
    days_inactive = GREATEST(0, days_inactive_calc),
    last_interaction_at = COALESCE(last_interaction, last_interaction_at, created_at)
  WHERE id = lead_uuid;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger function to update metrics when messages are inserted
CREATE OR REPLACE FUNCTION trigger_update_lead_metrics()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_lead_metrics(NEW.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_messages_update_metrics ON messages;

-- Create trigger on messages table
CREATE TRIGGER trigger_messages_update_metrics
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lead_metrics();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_lead_metrics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_update_lead_metrics() TO authenticated;

-- Step 7: Create function to trigger AI scoring (called from application code)
-- Note: This function can be called from application code when messages are inserted
-- For automatic triggering, set up a webhook or call /api/webhooks/message-created from your application
CREATE OR REPLACE FUNCTION trigger_ai_scoring(lead_uuid UUID)
RETURNS void AS $$
BEGIN
  -- This function is a placeholder - actual scoring is done via API endpoint
  -- Application code should call: POST /api/webhooks/message-created with { lead_id: lead_uuid }
  -- Or directly: POST /api/leads/score with { lead_id: lead_uuid }
  PERFORM 1; -- No-op, just to make function valid
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION trigger_ai_scoring(UUID) TO authenticated;

-- Migration complete!
-- 
-- SETUP INSTRUCTIONS:
-- 1. AI scoring is triggered via API endpoint: POST /api/leads/score
-- 2. Call this endpoint from your message insertion code, or set up a webhook
-- 3. For automatic scoring on message insert, call /api/webhooks/message-created from your application
-- 4. Set up daily cron job to call: POST /api/leads/rescore-all with Authorization: Bearer <CRON_SECRET>
-- 5. Ensure CLAUDE_API_KEY is set in your environment variables

