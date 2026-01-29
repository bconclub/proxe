# Verify Message Logging - Step by Step Guide

## Critical: Test with a NEW conversation after the fix

The fix was just deployed. You need to test with a **brand new conversation** to see if messages are being logged.

## Step 1: Check Server Logs

Look for these log messages in your server logs when a message is sent:

### Expected Flow:

1. **Profile Update:**
   ```
   [Chat API] ✓ Updating session profile with client data: { hasPhone: true, ... }
   [Chat API] updateSessionProfile completed { hasResult: true, leadId: 'c5338c60...' }
   [Chat API] ✓ Got leadId from updateSessionProfile: c5338c60...
   ```

2. **Message Logging:**
   ```
   [Chat API] ✓ Lead ID exists: c5338c60...
   [Chat API] About to call logMessage() for customer message...
   [logMessage] Called with: { leadId: 'c5338c60...', ... }
   [logMessage] ✓ Using service role client (bypasses RLS)
   [logMessage] ✓ Lead exists, proceeding with insert
   [logMessage] ✓ Message logged successfully to "conversations" table
   ```

### If leadId is NULL:

Look for:
```
[Chat API] ✗✗✗ CRITICAL: leadId is NULL when trying to log customer message
```

This means `updateSessionProfile` didn't return a leadId.

## Step 2: Test with New Conversation

1. **Start a fresh conversation** (new browser session)
2. **Provide name, email, and phone** when prompted
3. **Send a message**
4. **Check server logs** for the flow above
5. **Run SQL query:**

```sql
-- Get the latest session
SELECT 
  external_session_id,
  lead_id,
  customer_name,
  customer_phone,
  customer_email,
  created_at
FROM web_sessions
WHERE brand = 'windchasers'
ORDER BY created_at DESC
LIMIT 1;

-- Check messages for that lead
SELECT 
  COUNT(*) as message_count,
  MIN(created_at) as first_message,
  MAX(created_at) as last_message
FROM conversations
WHERE lead_id = (
  SELECT lead_id FROM web_sessions 
  WHERE brand = 'windchasers' 
  ORDER BY created_at DESC 
  LIMIT 1
);
```

## Step 3: Manual Test Insert

If messages still aren't logging, test if inserts work manually:

```sql
-- Test insert (replace with actual lead_id from step 2)
INSERT INTO conversations (
  lead_id,
  channel,
  sender,
  content,
  message_type
) VALUES (
  'c5338c60-5aac-4555-bf2f-e949ee776aca',  -- Replace with actual lead_id
  'web',
  'customer',
  'Manual test message',
  'text'
)
RETURNING id, created_at;

-- Verify it was inserted
SELECT * FROM conversations 
WHERE lead_id = 'c5338c60-5aac-4555-bf2f-e949ee776aca'
ORDER BY created_at DESC;
```

If manual insert works but code doesn't, the issue is in the application code.

## Step 4: Check Common Issues

### Issue 1: updateSessionProfile not returning leadId

**Check logs for:**
```
[updateSessionProfile] ensureAllLeads returned: null
```

**Possible causes:**
- Phone normalization failing
- Service client not available
- RLS blocking lead creation

### Issue 2: Service client not available

**Check logs for:**
```
[logMessage] Service role client not available, falling back to anon client
```

**Fix:** Ensure `SUPABASE_SERVICE_ROLE_KEY` or `WINDCHASERS_SUPABASE_SERVICE_KEY` is set.

### Issue 3: Lead doesn't exist when logging

**Check logs for:**
```
[logMessage] ✗ Lead does not exist in all_leads table
```

**Fix:** Ensure lead is created before messages are logged.

## Step 5: Debug Specific Lead

For your existing lead (`c5338c60-5aac-4555-bf2f-e949ee776aca`):

```sql
-- Check if lead exists
SELECT id, customer_name, phone, email, brand, created_at
FROM all_leads
WHERE id = 'c5338c60-5aac-4555-bf2f-e949ee776aca';

-- Check session
SELECT external_session_id, lead_id, customer_phone, customer_email
FROM web_sessions
WHERE lead_id = 'c5338c60-5aac-4555-bf2f-e949ee776aca';

-- Try manual insert for this lead
INSERT INTO conversations (lead_id, channel, sender, content, message_type)
VALUES ('c5338c60-5aac-4555-bf2f-e949ee776aca', 'web', 'customer', 'Test', 'text')
RETURNING id;
```

## Next Steps

1. **Test with NEW conversation** (most important!)
2. **Check server logs** for the flow above
3. **Share logs** if messages still aren't logging
4. **Run manual insert test** to verify database permissions

The fix should work, but we need to verify with a fresh test.
