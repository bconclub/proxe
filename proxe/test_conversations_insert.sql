-- Test script to manually insert into conversations table
-- This will help diagnose if it's an RLS issue or backend issue

-- Step 1: Get a lead_id from all_leads (or create a test lead)
-- Option A: Use an existing lead
SELECT id, customer_name FROM all_leads LIMIT 1;

-- Option B: Create a test lead first (if no leads exist)
-- INSERT INTO all_leads (customer_name, phone, customer_phone_normalized, first_touchpoint, last_touchpoint, brand)
-- VALUES ('Test User', '1234567890', '1234567890', 'web', 'web', 'proxe')
-- RETURNING id;

-- Step 2: Insert a test conversation (replace 'YOUR_LEAD_ID_HERE' with actual lead_id from Step 1)
INSERT INTO conversations (
  lead_id,
  channel,
  sender,
  content,
  message_type,
  metadata
) VALUES (
  'YOUR_LEAD_ID_HERE'::uuid,  -- Replace with actual lead_id
  'web',
  'customer',
  'This is a test message to verify conversations table works',
  'text',
  '{"test": true}'::jsonb
)
RETURNING id, lead_id, channel, sender, content, created_at;

-- Step 3: Verify the insert worked
SELECT * FROM conversations 
WHERE content LIKE '%test message%' 
ORDER BY created_at DESC 
LIMIT 5;

-- If the INSERT works → RLS is fine, issue is in backend code
-- If the INSERT fails → RLS policy issue, check migration 018


