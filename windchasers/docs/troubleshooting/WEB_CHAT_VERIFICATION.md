# Windchasers Web Chat Database Update Verification

## Current Implementation Analysis

### File: `windchasers/build/src/app/api/integrations/web-agent/route.ts`

## ✅ FIXES IMPLEMENTED

### New Features Added:
1. ✅ **`updateWebContext()` function** - Similar to `updateWhatsAppContext()`, updates `unified_context.web` and `unified_context.windchasers`
2. ✅ **Action-based routing** - Supports `action` parameter: `'open'`, `'message'`, `'profile'`, `'button'`, `'summary'`
3. ✅ **Chat open without profile** - Can create session without name/phone
4. ✅ **Message tracking** - Updates `web_sessions.message_count` and `last_message_at` on message send
5. ✅ **Conversations table** - Inserts all messages (customer, agent, system, button clicks)
6. ✅ **unified_context updates** - Updates `unified_context.web` and `unified_context.windchasers` on all operations

## ❌ PREVIOUS ISSUES (NOW FIXED)

### 1. WHEN CHAT OPENS (action: 'open')
**Fixed Behavior:**
- ✅ Creates `web_sessions` record even without name/phone
- ✅ Stores `external_session_id` for session tracking
- ✅ Updates `unified_context.web` if metadata provided
- ✅ Returns `session_id` and `external_session_id` for subsequent requests

**Expected:**
```sql
-- Should create web_sessions even without name/phone
-- Should update unified_context.web with session data
```

### 2. WHEN USER SENDS MESSAGE (action: 'message')
**Fixed Behavior:**
- ✅ **FIXED**: `web_sessions.message_count` incremented
- ✅ **FIXED**: `web_sessions.last_message_at` updated
- ✅ **FIXED**: Message inserted to `conversations` table
- ✅ **FIXED**: `unified_context.web.message_count` and `last_interaction` updated
- ✅ Triggers AI scoring webhook

**Expected:**
```sql
-- Should UPDATE web_sessions:
--   message_count = message_count + 1
--   last_message_at = NOW()
-- Should INSERT into conversations table
-- Should UPDATE unified_context.web.message_count
```

### 3. WHEN PROFILE COLLECTED (action: 'profile' or when name/phone provided)
**Fixed Behavior:**
- ✅ Creates/updates `all_leads` with customer data
- ✅ Creates/updates `web_sessions` with customer data
- ✅ **FIXED**: `unified_context.windchasers` populated with aviation fields
- ✅ **FIXED**: `unified_context.web` updated with profile data
- ✅ Inserts system message about profile collection

**Expected:**
```sql
-- Should UPDATE all_leads.unified_context.windchasers with:
--   user_type, course_interest, timeline, etc.
-- Should UPDATE all_leads.unified_context.web with profile data
```

### 4. WHEN BUTTON CLICKED (action: 'button')
**Fixed Behavior:**
- ✅ `user_inputs_summary` stored in `web_sessions`
- ✅ **FIXED**: `unified_context.web.user_inputs_summary` updated
- ✅ **FIXED**: Button clicks tracked in `conversations` table as system messages
- ✅ Updates `unified_context.windchasers` if aviation data provided

**Expected:**
```sql
-- Should UPDATE unified_context.web.user_inputs_summary
-- Should INSERT button click as system message in conversations
```

### 5. CONVERSATION SUMMARY (action: 'summary')
**Fixed Behavior:**
- ✅ `conversation_summary` stored in `web_sessions`
- ✅ **FIXED**: `unified_context.web.conversation_summary` updated
- ✅ **FIXED**: `updateWebContext()` function created (similar to `updateWhatsAppContext()`)
- ✅ Updates booking data in both `web_sessions` and `unified_context`

**Expected:**
```sql
-- Should UPDATE unified_context.web.conversation_summary
-- Should have updateWebContext() function similar to updateWhatsAppContext()
```

## Comparison with WhatsApp Implementation

### WhatsApp Route (`whatsapp/route.ts`)
✅ Has `updateWhatsAppContext()` function
✅ Updates `unified_context.whatsapp` on every operation
✅ Updates `whatsapp_sessions` message_count and last_message_at
✅ Inserts all messages to `conversations` table

### Web Agent Route (`web-agent/route.ts`)
❌ No `updateWebContext()` function
❌ Does NOT update `unified_context.web`
❌ Does NOT update `web_sessions` on message send
❌ Only inserts system message, not user messages

## Required Fixes

1. **Create `updateWebContext()` function** (similar to `updateWhatsAppContext()`)
2. **Update web_sessions on message send** (increment message_count, update last_message_at)
3. **Insert user messages to conversations table**
4. **Update unified_context.web on all operations**
5. **Update unified_context.windchasers when profile collected**
6. **Handle chat open without name/phone** (create session with minimal data)

## Database Tables Updated (After Fixes)

| Event | all_leads | web_sessions | conversations | unified_context |
|-------|-----------|-------------|--------------|-----------------|
| Chat Opens | ✅ | ✅ | ✅ | ✅ |
| User Sends Message | ✅ | ✅ | ✅ | ✅ |
| Profile Collected | ✅ | ✅ | ✅ | ✅ |
| Button Clicked | ✅ | ✅ | ✅ | ✅ |
| Summary Generated | ✅ | ✅ | ✅ | ✅ |

## SQL Verification Queries

### 1. Check web_sessions creation
```sql
SELECT * FROM web_sessions 
WHERE brand = 'windchasers' 
ORDER BY created_at DESC 
LIMIT 5;
```

### 2. Check message_count updates
```sql
SELECT 
  id,
  external_session_id,
  message_count,
  last_message_at,
  updated_at
FROM web_sessions
WHERE brand = 'windchasers'
ORDER BY updated_at DESC
LIMIT 10;
```

### 3. Check conversations table
```sql
SELECT 
  c.id,
  c.lead_id,
  c.channel,
  c.sender,
  c.content,
  c.created_at,
  al.customer_name
FROM conversations c
JOIN all_leads al ON c.lead_id = al.id
WHERE c.channel = 'web' 
  AND al.brand = 'windchasers'
ORDER BY c.created_at DESC
LIMIT 20;
```

### 4. Check unified_context.web updates
```sql
SELECT 
  id,
  customer_name,
  unified_context->'web' as web_context,
  unified_context->'windchasers' as windchasers_context
FROM all_leads
WHERE brand = 'windchasers'
  AND unified_context->'web' IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;
```

### 5. Check lead_id linkage
```sql
SELECT 
  ws.id as session_id,
  ws.external_session_id,
  ws.lead_id,
  ws.message_count,
  ws.last_message_at,
  al.customer_name,
  COUNT(c.id) as actual_message_count
FROM web_sessions ws
LEFT JOIN all_leads al ON ws.lead_id = al.id
LEFT JOIN conversations c ON c.lead_id = al.id AND c.channel = 'web'
WHERE ws.brand = 'windchasers'
GROUP BY ws.id, ws.external_session_id, ws.lead_id, ws.message_count, ws.last_message_at, al.customer_name
ORDER BY ws.updated_at DESC
LIMIT 10;
```

## API Usage Examples

### 1. Open Chat (No Profile Required)
```javascript
POST /api/integrations/web-agent
{
  "action": "open",
  "external_session_id": "web_1234567890_abc123",
  "chat_session_id": "chat_xyz",
  "website_url": "https://windchasers.com",
  "brand": "windchasers"
}
```

### 2. Send Message
```javascript
POST /api/integrations/web-agent
{
  "action": "message",
  "external_session_id": "web_1234567890_abc123",
  "message": "Hello, I'm interested in flight training",
  "message_sender": "customer",
  "message_type": "text",
  "brand": "windchasers"
}
```

### 3. Collect Profile
```javascript
POST /api/integrations/web-agent
{
  "action": "profile",
  "external_session_id": "web_1234567890_abc123",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "windchasers_data": {
    "user_type": "student",
    "course_interest": "Flight",
    "timeline": "1-3mo",
    "city": "Bangalore"
  },
  "brand": "windchasers"
}
```

### 4. Button Click
```javascript
POST /api/integrations/web-agent
{
  "action": "button",
  "external_session_id": "web_1234567890_abc123",
  "user_inputs_summary": {
    "button_clicked": "book_demo",
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "windchasers_data": {
    "course_interest": "DGCA"
  },
  "brand": "windchasers"
}
```

### 5. Update Summary
```javascript
POST /api/integrations/web-agent
{
  "action": "summary",
  "external_session_id": "web_1234567890_abc123",
  "conversation_summary": "Customer interested in DGCA course, wants to start in 1-3 months",
  "booking_status": "pending",
  "booking_date": "2024-02-15",
  "booking_time": "10:00",
  "brand": "windchasers"
}
```

## Summary

✅ **All database tables are now properly updated:**
- `web_sessions` - Created on chat open, updated on messages/profile/buttons/summary
- `all_leads` - Created/updated when profile collected
- `conversations` - All messages (customer, agent, system, buttons) inserted
- `unified_context.web` - Updated on all operations
- `unified_context.windchasers` - Updated when aviation data provided

✅ **Functions created:**
- `updateWebContext()` - Updates unified_context similar to WhatsApp implementation

✅ **Action-based routing:**
- `action: 'open'` - Chat opens without profile
- `action: 'message'` - User sends message
- `action: 'profile'` - Profile collected
- `action: 'button'` - Button clicked
- `action: 'summary'` - Conversation summary generated

✅ **Backward compatibility:**
- Legacy API format (name + phone required) still supported
