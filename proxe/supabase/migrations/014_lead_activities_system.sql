-- Migration: Lead Activities System
-- Creates lead_activities table to track all lead interactions and activities

-- Step 1: Create lead_activities table
CREATE TABLE IF NOT EXISTS lead_activities (
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

-- Step 2: Create indexes for lead_activities
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_activity_type ON lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_by ON lead_activities(created_by);
CREATE INDEX IF NOT EXISTS idx_lead_activities_next_followup_date ON lead_activities(next_followup_date) WHERE next_followup_date IS NOT NULL;

-- Step 3: Enable RLS on lead_activities
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for lead_activities
CREATE POLICY "Authenticated users can view lead_activities"
  ON lead_activities FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert lead_activities"
  ON lead_activities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');


-- Migration complete!

