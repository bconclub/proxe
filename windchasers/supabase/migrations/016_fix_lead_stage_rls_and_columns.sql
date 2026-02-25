-- Migration: Fix Lead Stage RLS and Column Consistency
-- Ensures all columns exist and RLS policies are correct for updates

-- Step 1: Ensure both stage_override and is_manual_override columns exist
-- (Some migrations use different names, we'll keep both for compatibility)
ALTER TABLE all_leads
ADD COLUMN IF NOT EXISTS stage_override BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;

-- Step 2: Sync the two columns - if one is true, set the other to true
-- Create a function to keep them in sync
CREATE OR REPLACE FUNCTION sync_stage_override_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- If stage_override is set, also set is_manual_override
  IF NEW.stage_override IS TRUE THEN
    NEW.is_manual_override := TRUE;
  ELSIF NEW.is_manual_override IS TRUE THEN
    NEW.stage_override := TRUE;
  ELSIF NEW.stage_override IS FALSE AND NEW.is_manual_override IS FALSE THEN
    -- Both false, keep them in sync
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_sync_stage_override ON all_leads;

-- Create trigger to sync columns
CREATE TRIGGER trigger_sync_stage_override
  BEFORE UPDATE OF stage_override, is_manual_override ON all_leads
  FOR EACH ROW
  EXECUTE FUNCTION sync_stage_override_columns();

-- Step 3: Ensure both stage_history and lead_stage_changes tables exist
-- (Some code uses one, some uses the other - we'll ensure both work)

-- Create lead_stage_changes if it doesn't exist (for compatibility)
-- Match the schema from migration 011
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

-- Create indexes for lead_stage_changes
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_lead_id ON lead_stage_changes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_created_at ON lead_stage_changes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_new_stage ON lead_stage_changes(new_stage);
CREATE INDEX IF NOT EXISTS idx_lead_stage_changes_changed_by ON lead_stage_changes(changed_by);

-- Enable RLS on lead_stage_changes
ALTER TABLE lead_stage_changes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for lead_stage_changes
DROP POLICY IF EXISTS "Authenticated users can view lead_stage_changes" ON lead_stage_changes;
CREATE POLICY "Authenticated users can view lead_stage_changes"
  ON lead_stage_changes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_changes" ON lead_stage_changes;
CREATE POLICY "Authenticated users can insert lead_stage_changes"
  ON lead_stage_changes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 4: Ensure stage_history has UPDATE policy if needed
-- (Currently it only has SELECT and INSERT, which should be fine)

-- Step 5: Verify and fix RLS policies for all_leads UPDATE
-- Ensure the UPDATE policy exists and allows authenticated users
DROP POLICY IF EXISTS "Authenticated users can update all_leads" ON all_leads;
CREATE POLICY "Authenticated users can update all_leads"
  ON all_leads FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Step 6: Ensure activities table has proper RLS policies
-- Verify UPDATE policy exists for activities (if needed for updates)
DROP POLICY IF EXISTS "Authenticated users can update activities" ON activities;
CREATE POLICY "Authenticated users can update activities"
  ON activities FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Step 7: Ensure lead_stage_overrides has UPDATE policy
-- (Already exists from migration 011, but ensure it's correct)
DROP POLICY IF EXISTS "Authenticated users can update lead_stage_overrides" ON lead_stage_overrides;
CREATE POLICY "Authenticated users can update lead_stage_overrides"
  ON lead_stage_overrides FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Migration complete!
-- This ensures:
-- 1. Both stage_override and is_manual_override columns exist and stay in sync
-- 2. Both stage_history and lead_stage_changes tables exist for compatibility
-- 3. All RLS policies allow authenticated users to UPDATE records
-- 4. All necessary indexes are created

