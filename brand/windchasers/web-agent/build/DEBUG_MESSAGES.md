# Debug Message Logging

## Test Query for Specific Lead

Use this SQL query in Supabase SQL Editor to check if messages exist for a specific lead:

```sql
-- Check messages for a specific lead_id
SELECT 
  id,
  lead_id,
  channel,
  sender,
  content,
  message_type,
  created_at,
  metadata
FROM conversations
WHERE lead_id = 'c5338c60-5aac-4555-bf2f-e949ee776aca'
ORDER BY created_at ASC;

-- Check all recent messages
SELECT 
  c.id,
  c.lead_id,
  c.channel,
  c.sender,
  LEFT(c.content, 50) as content_preview,
  c.created_at,
  al.customer_name,
  al.phone
FROM conversations c
LEFT JOIN all_leads al ON c.lead_id = al.id
WHERE al.brand = 'windchasers'
ORDER BY c.created_at DESC
LIMIT 20;

-- Check if lead exists
SELECT 
  id,
  customer_name,
  phone,
  email,
  brand,
  created_at
FROM all_leads
WHERE id = 'c5338c60-5aac-4555-bf2f-e949ee776aca';

-- Check session details
SELECT 
  external_session_id,
  lead_id,
  customer_name,
  customer_phone,
  customer_email,
  created_at,
  updated_at
FROM web_sessions
WHERE external_session_id = '1c2cd816-2d0c-4a8d-b88b-e1f75e2868d5';
```

## Server Logs to Check

Look for these log messages in your server logs:

1. **Before message logging:**
   - `[Chat API] Checking if lead_id exists for customer message logging...`
   - `[Chat API] ✓ Lead ID exists: c5338c60-5aac-4555-bf2f-e949ee776aca`

2. **During message logging:**
   - `[logMessage] Called with:`
   - `[logMessage] ✓ Using service role client (bypasses RLS)`
   - `[logMessage] Executing Supabase insert to "conversations" table...`

3. **After message logging:**
   - `[logMessage] ✓ Message logged successfully to "conversations" table:`
   - `[Chat API] Insert result (customer): ✓ Success`

## Common Issues

1. **leadId is null when logging:**
   - Check if leadId is being fetched correctly
   - Verify session has lead_id set

2. **Service client not available:**
   - Check environment variable: `SUPABASE_SERVICE_ROLE_KEY` or `WINDCHASERS_SUPABASE_SERVICE_KEY`
   - Should see: `[logMessage] ✓ Using service role client`

3. **RLS blocking inserts:**
   - Service client should bypass RLS
   - Check error logs for RLS-related errors

4. **Messages inserted but not visible:**
   - Check if fetchConversations is filtering correctly
   - Verify lead_id matches between conversations and all_leads

## Manual Test

To manually test message insertion:

```sql
-- Insert a test message
INSERT INTO conversations (
  lead_id,
  channel,
  sender,
  content,
  message_type,
  metadata
) VALUES (
  'c5338c60-5aac-4555-bf2f-e949ee776aca',
  'web',
  'customer',
  'Test message',
  'text',
  '{"test": true}'::jsonb
);

-- Verify it was inserted
SELECT * FROM conversations WHERE lead_id = 'c5338c60-5aac-4555-bf2f-e949ee776aca' ORDER BY created_at DESC LIMIT 1;
```
