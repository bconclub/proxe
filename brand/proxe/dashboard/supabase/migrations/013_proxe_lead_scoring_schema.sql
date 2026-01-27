-- Migration: PROXe Lead Scoring Database Schema
-- Sets up lead scoring columns, stage_history table, and triggers
-- Note: Using 'all_leads' table (the main leads table in this system)

-- Step 1: ALTER all_leads table - add lead scoring columns
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS sub_stage TEXT NULL,
ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS no_response_since TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS days_inactive INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_touchpoints INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sequence_id TEXT NULL,
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS override_by TEXT NULL,
ADD COLUMN IF NOT EXISTS override_at TIMESTAMP WITH TIME ZONE NULL;

-- Note: last_interaction_at already exists in all_leads, but we ensure it's set correctly
-- Update existing rows to set last_interaction_at if null
UPDATE all_leads
SET last_interaction_at = COALESCE(last_interaction_at, created_at, NOW())
WHERE last_interaction_at IS NULL;

-- Step 2: CREATE stage_history table
CREATE TABLE IF NOT EXISTS stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  score_at_change INTEGER,
  changed_by TEXT NOT NULL, -- values: 'system' or user_id
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT NULL
);

-- Step 3: CREATE indexes for query performance
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_stage ON all_leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_all_leads_lead_score ON all_leads(lead_score);
CREATE INDEX IF NOT EXISTS idx_all_leads_last_interaction_at ON all_leads(last_interaction_at DESC);

-- Additional useful indexes
CREATE INDEX IF NOT EXISTS idx_all_leads_sequence_id ON all_leads(sequence_id) WHERE sequence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_is_manual_override ON all_leads(is_manual_override) WHERE is_manual_override = true;
CREATE INDEX IF NOT EXISTS idx_all_leads_days_inactive ON all_leads(days_inactive);

-- Indexes for stage_history table
CREATE INDEX IF NOT EXISTS idx_stage_history_lead_id ON stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_at ON stage_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_history_new_stage ON stage_history(new_stage);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_by ON stage_history(changed_by);

-- Step 4: CREATE database trigger function
-- This function will be called when lead_stage is updated
CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only insert into stage_history if the stage actually changed
  IF OLD.lead_stage IS DISTINCT FROM NEW.lead_stage THEN
    INSERT INTO stage_history (
      lead_id,
      old_stage,
      new_stage,
      score_at_change,
      changed_by,
      changed_at,
      reason
    ) VALUES (
      NEW.id,
      OLD.lead_stage,
      NEW.lead_stage,
      NEW.lead_score,
      COALESCE(NEW.override_by, 'system'),
      NOW(),
      CASE 
        WHEN NEW.is_manual_override THEN 'Manual override'
        ELSE 'System update'
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: CREATE trigger on all_leads.lead_stage UPDATE
DROP TRIGGER IF EXISTS trigger_log_stage_change ON all_leads;
CREATE TRIGGER trigger_log_stage_change
  AFTER UPDATE OF lead_stage ON all_leads
  FOR EACH ROW
  WHEN (OLD.lead_stage IS DISTINCT FROM NEW.lead_stage)
  EXECUTE FUNCTION log_stage_change();

-- Step 6: Enable RLS on stage_history table
ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for stage_history
CREATE POLICY "Authenticated users can view stage_history"
  ON stage_history FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert stage_history"
  ON stage_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Grant access to authenticated users
GRANT SELECT, INSERT ON stage_history TO authenticated;

-- Migration complete!
-- The trigger will automatically log all stage changes to stage_history table


