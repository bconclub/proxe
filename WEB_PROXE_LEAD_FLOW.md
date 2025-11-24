# Web PROXe Lead Flow Documentation - CORRECTED

## Overview
This document explains how leads from Web PROXe are processed, stored, and displayed in the dashboard using the multi-touchpoint schema.

## Flow Diagram

```
Web PROXe System
    ↓
POST /api/integrations/web-agent
    ↓
Normalize phone number (remove non-digits)
    ↓
Check all_leads (by phone_normalized + brand)
    ↓
[New Lead] → Create all_leads (first_touchpoint='web')
[Existing] → Update all_leads (last_touchpoint='web')
    ↓
Create web_sessions (full customer data)
    ↓
Insert into messages table (audit trail)
    ↓
unified_leads view (for dashboard display)
    ↓
Dashboard UI
```

## 1. Entry Point: Webhook API

**File**: `src/app/api/integrations/web-agent/route.ts`

**Endpoint**: `POST /api/integrations/web-agent`

### Authentication
- Uses **service role key** (bypasses RLS, no auth required for webhooks)
- Allows external Web PROXe system to post leads without user authentication
- Environment variable: `SUPABASE_SERVICE_ROLE_KEY`

### Request Body (Expected Fields)

```json
{
  "name": "User Name",
  "phone": "+1234567890",
  "email": "user@example.com",
  "brand": "proxe",
  "booking_status": "pending",
  "booking_date": "2024-01-15",
  "booking_time": "14:30:00",
  "external_session_id": "web_xyz789",
  "chat_session_id": "chat_abc123",
  "website_url": "https://example.com",
  "conversation_summary": "Customer inquiry about pricing",
  "user_inputs_summary": {
    "questions": ["pricing", "service area"],
    "interests": ["premium_plan"]
  },
  "message_count": 15,
  "last_message_at": "2024-01-15T14:30:00Z"
}
```

### Required Fields
- `name` - Customer's name
- `phone` - Customer's phone (any format, will be normalized)

### Optional Fields
- `email` - Customer's email
- `brand` - 'proxe' (defaults to 'proxe')
- `booking_status` - 'pending', 'confirmed', 'cancelled'
- `booking_date` - Scheduled date (YYYY-MM-DD format)
- `booking_time` - Scheduled time (HH:MM:SS format)
- `external_session_id` - External session ID from Web PROXe (will be stored)
- `chat_session_id` - Chat session ID (will be stored)
- `website_url` - URL where session originated
- `conversation_summary` - AI summary of chat
- `user_inputs_summary` - JSONB object with user inputs
- `message_count` - Number of messages exchanged
- `last_message_at` - Timestamp of last message

### Processing Logic

**Step 1: Validate Required Fields**
```typescript
if (!phone || !name) {
  return error: 'Missing required fields: phone and name'
}
```

**Step 2: Normalize Phone Number**
```typescript
const normalizedPhone = normalizePhone(phone);
// "+91 98765-43210" → "919876543210"
// Removes all non-digit characters
```

**Step 3: Check for Existing Lead**
```typescript
const existingLead = await supabase
  .from('all_leads')
  .select('id')
  .eq('customer_phone_normalized', normalizedPhone)
  .eq('brand', brand)
  .maybeSingle();
```

Uses **deduplication key**: `(customer_phone_normalized, brand)`
- If found → Use existing lead_id, update last_touchpoint
- If not found → Create new lead with first_touchpoint='web'

**Step 4: Create or Update all_leads**

*If NEW lead:*
```typescript
const newLead = await supabase
  .from('all_leads')
  .insert({
    customer_name: name,
    email: email,
    phone: phone,
    customer_phone_normalized: normalizedPhone,
    first_touchpoint: 'web',        // Set on first contact
    last_touchpoint: 'web',
    last_interaction_at: NOW(),
    brand: brand
  })
  .select('id')
  .single();

leadId = newLead.data.id;
```

*If EXISTING lead:*
```typescript
await supabase
  .from('all_leads')
  .update({
    last_touchpoint: 'web',         // Update to current channel
    last_interaction_at: NOW()
  })
  .eq('id', leadId);
```

**Step 5: Create web_sessions Record**
```typescript
await supabase
  .from('web_sessions')
  .insert({
    lead_id: leadId,
    brand: brand,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    customer_phone_normalized: normalizedPhone,
    external_session_id: external_session_id,
    chat_session_id: chat_session_id,
    website_url: website_url,
    booking_status: booking_status,
    booking_date: booking_date,
    booking_time: booking_time,
    conversation_summary: conversation_summary,
    user_inputs_summary: user_inputs_summary,
    message_count: message_count,
    last_message_at: last_message_at,
    session_status: 'active'
  });
```

**Step 6: Insert Message (Audit Trail)**
```typescript
await supabase
  .from('messages')
  .insert({
    lead_id: leadId,
    channel: 'web',
    sender: 'system',
    content: `Web inquiry from ${name}`,
    message_type: 'text',
    metadata: {
      booking_requested: !!booking_date,
      booking_date: booking_date
    }
  });
```

**Step 7: Return Response**
```json
{
  "success": true,
  "lead_id": "7c2c7107-dbdb-4ee2-bdfb-9b3c1a4d80b8",
  "message": "Lead created successfully"
}
```

## 2. Database Tables

### Primary Table: `all_leads`

**Purpose**: Minimal unifier - one record per unique customer (phone + brand combo)

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `customer_name` | TEXT | Customer's name |
| `email` | TEXT | Customer's email |
| `phone` | TEXT | Original phone format |
| `customer_phone_normalized` | TEXT | Normalized phone (digits only, for dedup) |
| `first_touchpoint` | TEXT | First channel: 'web', 'whatsapp', 'voice', 'social' |
| `last_touchpoint` | TEXT | Most recent channel |
| `last_interaction_at` | TIMESTAMP | When they last interacted |
| `brand` | TEXT | 'proxe' |
| `unified_context` | JSONB | Orchestrator-populated insights |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time (auto-updated) |

**Deduplication**: Uses unique constraint on `(customer_phone_normalized, brand)`

### Web Sessions Table: `web_sessions`

**Purpose**: Self-contained Web PROXe data - all fields needed even if customer only uses Web

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | Foreign key to all_leads.id |
| `brand` | TEXT | 'proxe' |
| `customer_name` | TEXT | Customer name (duplicated for independence) |
| `customer_email` | TEXT | Customer email (duplicated) |
| `customer_phone` | TEXT | Original phone (duplicated) |
| `customer_phone_normalized` | TEXT | Normalized phone (duplicated) |
| `external_session_id` | TEXT | External Web PROXe session ID |
| `chat_session_id` | TEXT | Chat session ID from Web PROXe |
| `website_url` | TEXT | Website where session originated |
| `booking_status` | TEXT | 'pending', 'confirmed', 'cancelled' |
| `booking_date` | DATE | Scheduled booking date |
| `booking_time` | TIME | Scheduled booking time |
| `google_event_id` | TEXT | Google Calendar event ID (if synced) |
| `booking_created_at` | TIMESTAMP | When booking was created |
| `conversation_summary` | TEXT | AI summary of conversation |
| `user_inputs_summary` | JSONB | Summary of user inputs |
| `message_count` | INTEGER | Number of messages |
| `last_message_at` | TIMESTAMP | When last message was sent |
| `session_status` | TEXT | 'active', 'completed', 'abandoned' |
| `channel_data` | JSONB | Additional metadata |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time (auto-updated) |

**Independence**: This table is completely self-contained. If a customer only uses Web, all their data is here.

### Messages Table: `messages`

**Purpose**: Universal append-only audit trail for all channels

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | Foreign key to all_leads.id |
| `channel` | TEXT | 'web', 'whatsapp', 'voice', 'social' |
| `sender` | TEXT | 'customer', 'agent', 'system' |
| `content` | TEXT | Message content |
| `message_type` | TEXT | 'text', 'image', 'audio', 'transcription' |
| `metadata` | JSONB | Additional context (sentiment, intent, model_used, etc.) |
| `created_at` | TIMESTAMP | When message was created |

**Append-Only**: Never update or delete. Complete audit trail.

## 3. Unified Leads View

**Purpose**: Dashboard display - aggregates all customer data from all channels

### View SQL (Actual Implementation)

```sql
CREATE OR REPLACE VIEW unified_leads AS
SELECT 
  al.id,
  al.first_touchpoint,
  al.last_touchpoint,
  al.customer_name AS name,
  al.email,
  al.phone,
  al.brand,
  al.created_at AS timestamp,
  JSONB_BUILD_OBJECT(
    'web_data', (
      SELECT JSONB_BUILD_OBJECT(
        'customer_name', ws.customer_name,
        'booking_status', ws.booking_status,
        'booking_date', ws.booking_date,
        'booking_time', ws.booking_time,
        'conversation_summary', ws.conversation_summary,
        'message_count', ws.message_count,
        'last_message_at', ws.last_message_at
      )
      FROM web_sessions ws WHERE ws.lead_id = al.id ORDER BY ws.created_at DESC LIMIT 1
    ),
    'whatsapp_data', (
      SELECT JSONB_BUILD_OBJECT(
        'message_count', whs.message_count,
        'last_message_at', whs.last_message_at,
        'conversation_status', whs.conversation_status,
        'overall_sentiment', whs.overall_sentiment
      )
      FROM whatsapp_sessions whs WHERE whs.lead_id = al.id ORDER BY whs.created_at DESC LIMIT 1
    ),
    'voice_data', (
      SELECT JSONB_BUILD_OBJECT(
        'call_duration', vs.call_duration_seconds,
        'call_status', vs.call_status,
        'sentiment', vs.sentiment
      )
      FROM voice_sessions vs WHERE vs.lead_id = al.id ORDER BY vs.created_at DESC LIMIT 1
    ),
    'social_data', (
      SELECT JSONB_AGG(JSONB_BUILD_OBJECT('platform', ss.platform, 'engagement_type', ss.engagement_type))
      FROM social_sessions ss WHERE ss.lead_id = al.id
    )
  ) AS metadata,
  al.last_interaction_at,
  al.unified_context
FROM all_leads al
ORDER BY al.last_interaction_at DESC;
```

### What It Returns

For a Web-only customer:
```json
{
  "id": "lead-123",
  "first_touchpoint": "web",
  "last_touchpoint": "web",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+919876543210",
  "brand": "proxe",
  "timestamp": "2024-11-20T10:00:00Z",
  "metadata": {
    "web_data": {
      "booking_status": "confirmed",
      "booking_date": "2024-11-25",
      "conversation_summary": "Customer booked call"
    },
    "whatsapp_data": null,
    "voice_data": null,
    "social_data": null
  },
  "last_interaction_at": "2024-11-20T14:30:00Z"
}
```

For a multi-channel customer (Web → WhatsApp → Voice):
```json
{
  "id": "lead-456",
  "first_touchpoint": "web",
  "last_touchpoint": "voice",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+919876543211",
  "brand": "proxe",
  "timestamp": "2024-11-15T10:00:00Z",
  "metadata": {
    "web_data": {
      "booking_status": "pending",
      "message_count": 5
    },
    "whatsapp_data": {
      "message_count": 8,
      "overall_sentiment": "positive"
    },
    "voice_data": {
      "call_duration": 240,
      "sentiment": "positive"
    },
    "social_data": null
  },
  "last_interaction_at": "2024-11-20T16:00:00Z"
}
```

## 4. Dashboard Display

### API Endpoint: GET /api/integrations/web-agent

**File**: `src/app/api/integrations/web-agent/route.ts` (GET handler)

**Query**:
```typescript
const leads = await supabase
  .from('unified_leads')
  .select('*')
  .order('last_interaction_at', { ascending: false })
  .limit(100);
```

Returns all leads with:
- `first_touchpoint`: Shows which channel customer started on
- `last_touchpoint`: Shows most recent channel
- `metadata`: Contains data from all channels customer has used

## 5. Real-time Updates

**File**: `src/hooks/useRealtimeLeads.ts`

**Process**:
1. Subscribes to Supabase Realtime changes on `all_leads` table
2. Listens for INSERT and UPDATE events
3. On change: Refetch from `unified_leads` view
4. Frontend receives updated lead data in real-time

## 6. Data Flow Summary

### Creating a Web PROXe Lead

```
1. POST /api/integrations/web-agent
   ↓
2. Validate: name + phone required
   ↓
3. Normalize phone: "+91 98765-43210" → "919876543210"
   ↓
4. Query all_leads by (phone_normalized, brand)
   ↓
5. NEW LEAD?
     → Create all_leads (first_touchpoint='web')
   EXISTING?
     → Update all_leads (last_touchpoint='web', last_interaction_at=now)
   ↓
6. Create web_sessions (with all customer + booking data)
   ↓
7. Insert message (audit trail)
   ↓
8. Return: { success: true, lead_id: "..." }
```

### Querying Leads (Dashboard)

```
1. GET /api/integrations/web-agent
   ↓
2. SELECT * FROM unified_leads
   ↓
3. Returns: All leads with aggregated channel data
```

## 7. Multi-Channel Example

### Scenario: Customer uses Web → WhatsApp → Voice

**Time 1: Web inquiry**
```
POST /api/integrations/web-agent
{
  "name": "Alice",
  "phone": "+919876543210",
  "brand": "proxe",
  "booking_status": "pending"
}

Result:
- all_leads created: first_touchpoint='web'
- web_sessions created: booking_status='pending'
- messages created: channel='web'
```

**Time 2: Customer messages on WhatsApp**
```
POST /api/integrations/whatsapp (in future)
{
  "phone": "+919876543210",
  "brand": "proxe",
  "message": "Hi, interested in service"
}

Result:
- all_leads updated: last_touchpoint='whatsapp'
- whatsapp_sessions created: (new row, same lead_id)
- messages created: channel='whatsapp'
```

**Time 3: Customer calls**
```
Call arrives for +919876543210

Result:
- all_leads updated: last_touchpoint='voice'
- voice_sessions created: (new row, same lead_id)
- messages created: channel='voice'
```

**unified_leads now shows:**
```json
{
  "first_touchpoint": "web",
  "last_touchpoint": "voice",
  "metadata": {
    "web_data": { ... },
    "whatsapp_data": { ... },
    "voice_data": { ... }
  }
}
```

## 8. Key Design Principles

1. **Independence**: Each session table is complete (can work standalone)
2. **Linking**: lead_id connects all tables for same customer
3. **Deduplication**: Uses (phone_normalized, brand) to prevent duplicates
4. **Immutability**: first_touchpoint never changes after creation
5. **Tracking**: last_touchpoint always updates to most recent channel
6. **Audit Trail**: messages table never updates, only inserts

## 9. Security

### Authentication
- **Webhooks (POST)**: Service role key (no auth required)
- **Dashboard (GET)**: Authenticated user required

### Row Level Security
- All tables have RLS enabled
- Authenticated users can view all leads
- Can be refined later for per-user/organization access

## 10. Indexes for Performance

**all_leads**:
- phone_normalized (deduplication lookups)
- first_touchpoint (filtering by origin channel)
- last_interaction_at (sorting by recency)

**web_sessions**:
- lead_id (joining to all_leads)
- booking_status (filtering bookings)
- created_at (sorting)

**messages**:
- lead_id + channel (quick context lookups)
- created_at (conversation history)