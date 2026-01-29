# Debug Guide: Lead Creation Not Working

## Issue
Web sessions are being updated but leads are not being created in `all_leads` table.

## What to Check

### 1. Check Server Logs
Look for these log messages in order:

**Step 1: Profile Data Received**
```
[Chat API] Profile data received from client: { hasUserProfile: true, userName: ..., email: ..., phone: ... }
```

**Step 2: Update Session Profile**
```
[Chat API] Updating session profile with client data: { hasPhone: true, ... }
[updateSessionProfile] Called
[updateSessionProfile] Updates to apply
```

**Step 3: Lead Creation Attempt**
```
[updateSessionProfile] Calling ensureAllLeads with profile data: { hasPhone: true, ... }
[ensureAllLeads] Called: { hasPhone: true, ... }
[normalizePhone] Normalized phone: { normalized: '9876543210' }
```

**Step 4: Lead Creation Result**
```
[ensureAllLeads] Creating new lead: { hasPhone: true, hasNormalizedPhone: true }
[ensureAllLeads] About to insert into all_leads
[ensureAllLeads] Insert result: { hasData: true, createdId: '...' }
[updateSessionProfile] Successfully updated web_sessions with lead_id
```

### 2. Common Issues to Check

#### Issue A: Phone Number Not Provided
**Symptoms:**
- Log shows: `[Chat API] Cannot create lead - phone number is required but missing`
- Session has email but no phone

**Solution:** User must provide phone number

#### Issue B: Phone Normalization Failed
**Symptoms:**
- Log shows: `[normalizePhone] Phone number too short after cleaning`
- Phone number format is invalid

**Solution:** Check phone format - needs at least 10 digits

#### Issue C: RLS/Permission Error
**Symptoms:**
- Log shows: `[ensureAllLeads] Permission/RLS error creating all_leads`
- Error code: `42501`

**Solution:** Check Supabase RLS policies on `all_leads` table - anon role needs INSERT permission

#### Issue D: Supabase Client Not Available
**Symptoms:**
- Log shows: `[ensureAllLeads] Supabase client not available`

**Solution:** Check environment variables:
- `NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL`
- `NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY`

#### Issue E: Table Doesn't Exist
**Symptoms:**
- Log shows: `[ensureAllLeads] all_leads table not found`
- Error code: `42P01`

**Solution:** Run migrations to create `all_leads` table

### 3. SQL Queries to Debug

**Check if sessions have phone numbers:**
```sql
SELECT 
  external_session_id,
  customer_name,
  customer_email,
  customer_phone,
  lead_id,
  created_at
FROM web_sessions
WHERE brand = 'windchasers'
  AND customer_phone IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

**Check if leads exist:**
```sql
SELECT 
  id,
  customer_name,
  email,
  phone,
  customer_phone_normalized,
  brand,
  created_at
FROM all_leads
WHERE brand = 'windchasers'
ORDER BY created_at DESC
LIMIT 10;
```

**Check sessions without leads (should be empty after fix):**
```sql
SELECT 
  ws.external_session_id,
  ws.customer_name,
  ws.customer_email,
  ws.customer_phone,
  ws.lead_id,
  CASE 
    WHEN ws.lead_id IS NOT NULL THEN '✅ Has Lead'
    WHEN ws.customer_phone IS NOT NULL THEN '⚠️ Has Phone But No Lead'
    WHEN ws.customer_email IS NOT NULL THEN '⚠️ Has Email But No Lead'
    ELSE '❌ No Contact Info'
  END as status
FROM web_sessions ws
WHERE ws.brand = 'windchasers'
ORDER BY ws.created_at DESC
LIMIT 20;
```

**Check RLS policies:**
```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'all_leads';
```

### 4. Test Flow

1. **Open new chat session** (incognito window)
2. **Send message with phone**: "My phone is 9876543210"
3. **Check logs** for lead creation flow
4. **Run SQL query** to verify lead was created
5. **Check if session has lead_id** linked

### 5. Expected Behavior

✅ **Working Flow:**
- User provides phone → Session updated → Lead created → Session linked to lead
- Logs show successful lead creation
- SQL query shows `lead_id` in `web_sessions`
- SQL query shows new record in `all_leads`

❌ **Not Working:**
- User provides phone → Session updated → No lead created
- Logs show error or missing phone
- SQL query shows `lead_id` is NULL
- SQL query shows no new record in `all_leads`

## Next Steps

1. Check server logs for the exact error
2. Run SQL queries to verify data state
3. Check RLS policies if permission errors
4. Verify environment variables are set
5. Test with a new session providing phone number
