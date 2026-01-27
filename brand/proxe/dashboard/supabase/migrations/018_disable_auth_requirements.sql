-- Migration: Disable Authentication Requirements for RLS
-- Since authentication is disabled, update all RLS policies to allow access without auth

-- Step 1: Update all_leads RLS policies
DROP POLICY IF EXISTS "Authenticated users can view all_leads" ON all_leads;
        DROP POLICY IF EXISTS "Allow all users to view all_leads" ON all_leads;
CREATE POLICY "Allow all users to view all_leads"
  ON all_leads FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert all_leads" ON all_leads;
DROP POLICY IF EXISTS "Allow all users to insert all_leads" ON all_leads;
CREATE POLICY "Allow all users to insert all_leads"
  ON all_leads FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update all_leads" ON all_leads;
DROP POLICY IF EXISTS "Allow all users to update all_leads" ON all_leads;
CREATE POLICY "Allow all users to update all_leads"
  ON all_leads FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Step 2: Update conversations RLS policies (messages table renamed to conversations)
DROP POLICY IF EXISTS "Authenticated users can view messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to view messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all users to view conversations" ON conversations;
CREATE POLICY "Allow all users to view conversations"
  ON conversations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert conversations" ON conversations;
CREATE POLICY "Allow all users to insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

-- Step 3: Update web_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view web_sessions" ON web_sessions;
DROP POLICY IF EXISTS "Allow all users to view web_sessions" ON web_sessions;
CREATE POLICY "Allow all users to view web_sessions"
  ON web_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert web_sessions" ON web_sessions;
DROP POLICY IF EXISTS "Allow all users to insert web_sessions" ON web_sessions;
CREATE POLICY "Allow all users to insert web_sessions"
  ON web_sessions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update web_sessions" ON web_sessions;
DROP POLICY IF EXISTS "Allow all users to update web_sessions" ON web_sessions;
CREATE POLICY "Allow all users to update web_sessions"
  ON web_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Step 4: Update whatsapp_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Allow all users to view whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Allow all users to view whatsapp_sessions"
  ON whatsapp_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert whatsapp_sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Allow all users to insert whatsapp_sessions" ON whatsapp_sessions;
CREATE POLICY "Allow all users to insert whatsapp_sessions"
  ON whatsapp_sessions FOR INSERT
  WITH CHECK (true);

-- Step 5: Update voice_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view voice_sessions" ON voice_sessions;
DROP POLICY IF EXISTS "Allow all users to view voice_sessions" ON voice_sessions;
CREATE POLICY "Allow all users to view voice_sessions"
  ON voice_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert voice_sessions" ON voice_sessions;
DROP POLICY IF EXISTS "Allow all users to insert voice_sessions" ON voice_sessions;
CREATE POLICY "Allow all users to insert voice_sessions"
  ON voice_sessions FOR INSERT
  WITH CHECK (true);

-- Step 6: Update social_sessions RLS policies
DROP POLICY IF EXISTS "Authenticated users can view social_sessions" ON social_sessions;
DROP POLICY IF EXISTS "Allow all users to view social_sessions" ON social_sessions;
CREATE POLICY "Allow all users to view social_sessions"
  ON social_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert social_sessions" ON social_sessions;
DROP POLICY IF EXISTS "Allow all users to insert social_sessions" ON social_sessions;
CREATE POLICY "Allow all users to insert social_sessions"
  ON social_sessions FOR INSERT
  WITH CHECK (true);

-- Step 7: Update lead_activities RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_activities') THEN
    DROP POLICY IF EXISTS "Authenticated users can view lead_activities" ON lead_activities;
    DROP POLICY IF EXISTS "Allow all users to view lead_activities" ON lead_activities;
    CREATE POLICY "Allow all users to view lead_activities"
      ON lead_activities FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert lead_activities" ON lead_activities;
    DROP POLICY IF EXISTS "Allow all users to insert lead_activities" ON lead_activities;
    CREATE POLICY "Allow all users to insert lead_activities"
      ON lead_activities FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Step 8: Update lead_stage_changes RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_stage_changes') THEN
    DROP POLICY IF EXISTS "Authenticated users can view lead_stage_changes" ON lead_stage_changes;
    DROP POLICY IF EXISTS "Allow all users to view lead_stage_changes" ON lead_stage_changes;
    CREATE POLICY "Allow all users to view lead_stage_changes"
      ON lead_stage_changes FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_changes" ON lead_stage_changes;
    DROP POLICY IF EXISTS "Allow all users to insert lead_stage_changes" ON lead_stage_changes;
    CREATE POLICY "Allow all users to insert lead_stage_changes"
      ON lead_stage_changes FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Step 9: Update activities RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activities') THEN
    DROP POLICY IF EXISTS "Authenticated users can view activities" ON activities;
    DROP POLICY IF EXISTS "Allow all users to view activities" ON activities;
    CREATE POLICY "Allow all users to view activities"
      ON activities FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert activities" ON activities;
    DROP POLICY IF EXISTS "Allow all users to insert activities" ON activities;
    CREATE POLICY "Allow all users to insert activities"
      ON activities FOR INSERT
      WITH CHECK (true);

    DROP POLICY IF EXISTS "Authenticated users can update activities" ON activities;
    DROP POLICY IF EXISTS "Allow all users to update activities" ON activities;
    CREATE POLICY "Allow all users to update activities"
      ON activities FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Step 10: Update lead_stage_overrides RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_stage_overrides') THEN
    DROP POLICY IF EXISTS "Authenticated users can view lead_stage_overrides" ON lead_stage_overrides;
    DROP POLICY IF EXISTS "Allow all users to view lead_stage_overrides" ON lead_stage_overrides;
    CREATE POLICY "Allow all users to view lead_stage_overrides"
      ON lead_stage_overrides FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert lead_stage_overrides" ON lead_stage_overrides;
    DROP POLICY IF EXISTS "Allow all users to insert lead_stage_overrides" ON lead_stage_overrides;
    CREATE POLICY "Allow all users to insert lead_stage_overrides"
      ON lead_stage_overrides FOR INSERT
      WITH CHECK (true);

    DROP POLICY IF EXISTS "Authenticated users can update lead_stage_overrides" ON lead_stage_overrides;
    DROP POLICY IF EXISTS "Allow all users to update lead_stage_overrides" ON lead_stage_overrides;
    CREATE POLICY "Allow all users to update lead_stage_overrides"
      ON lead_stage_overrides FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Step 11: Update stage_history RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stage_history') THEN
    DROP POLICY IF EXISTS "Authenticated users can view stage_history" ON stage_history;
    DROP POLICY IF EXISTS "Allow all users to view stage_history" ON stage_history;
    CREATE POLICY "Allow all users to view stage_history"
      ON stage_history FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert stage_history" ON stage_history;
    DROP POLICY IF EXISTS "Allow all users to insert stage_history" ON stage_history;
    CREATE POLICY "Allow all users to insert stage_history"
      ON stage_history FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Step 12: Update dashboard_leads RLS policies (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dashboard_leads') THEN
    DROP POLICY IF EXISTS "Authenticated users can view dashboard_leads" ON dashboard_leads;
    DROP POLICY IF EXISTS "Allow all users to view dashboard_leads" ON dashboard_leads;
    CREATE POLICY "Allow all users to view dashboard_leads"
      ON dashboard_leads FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert dashboard_leads" ON dashboard_leads;
    DROP POLICY IF EXISTS "Allow all users to insert dashboard_leads" ON dashboard_leads;
    CREATE POLICY "Allow all users to insert dashboard_leads"
      ON dashboard_leads FOR INSERT
      WITH CHECK (true);

    DROP POLICY IF EXISTS "Authenticated users can update dashboard_leads" ON dashboard_leads;
    DROP POLICY IF EXISTS "Allow all users to update dashboard_leads" ON dashboard_leads;
    CREATE POLICY "Allow all users to update dashboard_leads"
      ON dashboard_leads FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Step 13: Grant SELECT on unified_leads view to anon role (for unauthenticated access)
GRANT SELECT ON unified_leads TO anon;
GRANT SELECT ON unified_leads TO authenticated;

-- Migration complete!

