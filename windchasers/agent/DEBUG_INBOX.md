# Debug Inbox Messages Not Showing

## Issue
Messages exist in database (8 messages confirmed) but not showing in dashboard inbox.

## Steps to Debug

### Step 1: Check Browser Console
Open browser DevTools (F12) and check console logs when:
1. Opening inbox page
2. Clicking on a lead/conversation

Look for:
- `Fetching conversations...`
- `Fetched messages: X messages`
- Any RLS/permission errors

### Step 2: Verify Lead Selection
1. **Click on a lead** in the left sidebar
2. Check if `selectedLeadId` is set
3. Check console for: `Fetching messages for lead: c5338c60...`

### Step 3: Test Direct Query
Run this in browser console (on inbox page):

```javascript
// Test fetching messages directly
const { data, error } = await supabase
  .from('conversations')
  .select('*')
  .eq('lead_id', 'c5338c60-5aac-4555-bf2f-e949ee776aca')
  .order('created_at', { ascending: true })

console.log('Messages:', data?.length || 0)
console.log('Error:', error)
```

### Step 4: Check RLS Policies
Run in Supabase SQL Editor:

```sql
-- Check RLS policies on conversations
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
WHERE tablename = 'conversations';

-- Test if anon user can read
SET ROLE anon;
SELECT COUNT(*) FROM conversations WHERE lead_id = 'c5338c60-5aac-4555-bf2f-e949ee776aca';
RESET ROLE;
```

### Step 5: Verify Lead ID Format
Check if lead_id is UUID format:

```sql
-- Check lead_id format
SELECT 
  lead_id,
  pg_typeof(lead_id) as type,
  lead_id::text as as_text
FROM conversations
WHERE lead_id = 'c5338c60-5aac-4555-bf2f-e949ee776aca'
LIMIT 1;
```

### Step 6: Check if Conversation Appears in List
The inbox shows conversations grouped by lead_id. Check:
1. Does the lead appear in the left sidebar?
2. What does it show for "last_message"?
3. Click on it - do messages appear?

## Common Issues

### Issue 1: Lead Not Selected
**Symptom:** Messages exist but nothing shows when clicking lead
**Fix:** Ensure `selectedLeadId` is set when clicking a conversation

### Issue 2: RLS Blocking Reads
**Symptom:** Console shows permission errors
**Fix:** Check migration `018_disable_auth_requirements.sql` has been run

### Issue 3: Channel Filter
**Symptom:** Messages exist but filtered out
**Fix:** Check `selectedChannel` - should be 'web' or null

### Issue 4: UUID Format Mismatch
**Symptom:** Query returns 0 results even though messages exist
**Fix:** Ensure lead_id is compared as UUID, not string

## Quick Test

Run this in browser console on inbox page:

```javascript
// 1. Check if conversations are loaded
console.log('Conversations:', conversations.length)

// 2. Find your lead
const yourLead = conversations.find(c => 
  c.lead_id === 'c5338c60-5aac-4555-bf2f-e949ee776aca'
)
console.log('Your lead:', yourLead)

// 3. Select it
if (yourLead) {
  setSelectedLeadId(yourLead.lead_id)
  console.log('Selected lead:', yourLead.lead_id)
}

// 4. Check messages
console.log('Messages:', messages.length)
```

## Expected Behavior

1. **Inbox loads** → Shows list of conversations (grouped by lead_id)
2. **Click conversation** → Sets `selectedLeadId`
3. **Messages fetch** → Calls `fetchMessages(leadId)`
4. **Messages display** → Shows in right panel

If step 1-3 work but step 4 doesn't, check:
- RLS policies
- Browser console errors
- Network tab for failed requests
