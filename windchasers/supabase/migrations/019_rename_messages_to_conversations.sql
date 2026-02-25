-- Migration: Rename messages table to conversations
-- This migration renames the messages table to conversations for better clarity

-- Step 1: Rename the table (only if it still exists as messages)
-- Use EXECUTE to prevent parsing errors when table doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations') THEN
    EXECUTE 'ALTER TABLE messages RENAME TO conversations';
  END IF;
END $$;

-- Step 2: Rename indexes (only if they still exist with old names)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_lead_id') THEN
    ALTER INDEX idx_messages_lead_id RENAME TO idx_conversations_lead_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_channel') THEN
    ALTER INDEX idx_messages_channel RENAME TO idx_conversations_channel;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_created_at') THEN
    ALTER INDEX idx_messages_created_at RENAME TO idx_conversations_created_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_messages_lead_channel') THEN
    ALTER INDEX idx_messages_lead_channel RENAME TO idx_conversations_lead_channel;
  END IF;
END $$;

-- Step 3: Update RLS policies (drop old, create new with same permissions)
-- Drop all possible policy names (old and new) before creating
DROP POLICY IF EXISTS "Allow all users to view messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can view messages" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON conversations;
DROP POLICY IF EXISTS "Allow all users to view conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all users to insert conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON conversations;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON conversations;

-- Create new policies with updated names
CREATE POLICY "Allow all users to view conversations"
  ON conversations FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

-- Step 4: Update triggers that reference messages table
-- Drop old trigger if it exists, create new one
DROP TRIGGER IF EXISTS trigger_messages_update_score ON conversations;
DROP TRIGGER IF EXISTS trigger_conversations_update_score ON conversations;
CREATE TRIGGER trigger_conversations_update_score
  AFTER INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lead_score();

-- Step 5: Update Realtime publication
-- Remove messages from realtime, add conversations (if not already added)
DO $$
BEGIN
  -- Remove old table from realtime
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  END IF;
  
  -- Add new table to realtime (only if not already added)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $$;

-- Step 6: Update functions that reference messages table
-- Update calculate_lead_score function to use conversations table
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  msg_count INTEGER;
  touchpoint_count INTEGER;
  last_interaction TIMESTAMP WITH TIME ZONE;
  days_inactive_calc INTEGER;
BEGIN
  -- Count messages from customer
  SELECT COUNT(*) INTO msg_count
  FROM conversations
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
  FROM conversations
  WHERE lead_id = lead_uuid;
  
  -- Calculate days inactive
  IF last_interaction IS NOT NULL THEN
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  ELSE
    SELECT created_at INTO last_interaction FROM all_leads WHERE id = lead_uuid;
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  END IF;
  
  -- Scoring logic (same as before, just using conversations table)
  -- Message count: 10 points per message (max 50)
  score := score + LEAST(msg_count * 10, 50);
  
  -- Touchpoints: 15 points per touchpoint (max 60)
  score := score + LEAST(touchpoint_count * 15, 60);
  
  -- Recency: 20 points if active in last 24h, 10 if last 7 days, 0 otherwise
  IF days_inactive_calc <= 1 THEN
    score := score + 20;
  ELSIF days_inactive_calc <= 7 THEN
    score := score + 10;
  END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Migration complete!
-- All references to 'messages' table should now use 'conversations'

