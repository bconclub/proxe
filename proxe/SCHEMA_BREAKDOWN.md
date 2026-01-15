# PROXe Command Center - Complete Database Schema Breakdown

**Generated from:** Migration files and Dashboard.md documentation  
**Last Updated:** Based on migrations 001-021

---

## 1. TABLE INVENTORY

### Core Tables (Dashboard)

| Table Name | Primary Purpose | Build Usage |
|------------|----------------|-------------|
| `dashboard_users` | User accounts with roles (admin/viewer) | Dashboard only |
| `user_invitations` | Invitation tokens for adding new users | Dashboard only |
| `dashboard_settings` | Dashboard configuration (key-value JSONB) | Dashboard only |
| `dashboard_leads` | Legacy leads table (deprecated, use `all_leads`) | Dashboard only |

### Multi-Touchpoint Tables (All Builds)

| Table Name | Primary Purpose | Build Usage |
|------------|----------------|-------------|
| `all_leads` | **Core unifier** - One record per unique customer (deduplication by phone+brand) | Website, Dashboard, WhatsApp |
| `web_sessions` | Self-contained Web PROXe session data | Website, Dashboard |
| `whatsapp_sessions` | Self-contained WhatsApp session data | WhatsApp, Dashboard |
| `voice_sessions` | Self-contained Voice session data | Voice, Dashboard |
| `social_sessions` | Self-contained Social session data | Social, Dashboard |
| `conversations` | Universal append-only message log (all channels) | All builds |

### Lead Intelligence Tables (Dashboard)

| Table Name | Primary Purpose | Build Usage |
|------------|----------------|-------------|
| `lead_stage_changes` | Logs all stage transitions (automatic and manual) | Dashboard only |
| `lead_stage_overrides` | Tracks manual stage overrides | Dashboard only |
| `lead_activities` | Team actions: calls, meetings, messages, notes | Dashboard only |
| `stage_history` | Historical stage change tracking | Dashboard only |

### Views

| View Name | Primary Purpose | Build Usage |
|-----------|----------------|-------------|
| `unified_leads` | Dashboard display view - aggregates all customer data from all_leads + channel tables | Dashboard only |

---

## 2. DETAILED FIELD BREAKDOWN

### `all_leads` Table

**Purpose:** Minimal unifier - one record per unique customer (deduplication by `customer_phone_normalized` + `brand`)

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** - Unique lead identifier |
| `customer_name` | TEXT | NULL | **Optional** - Customer's name |
| `email` | TEXT | NULL | **Optional** - Customer's email |
| `phone` | TEXT | NULL | **Optional** - Customer's phone (any format) |
| `customer_phone_normalized` | TEXT | NULL, INDEXED | **Core** - Normalized phone (digits only) for deduplication |
| `first_touchpoint` | TEXT | NOT NULL, CHECK ('web','whatsapp','voice','social') | **Core** - First channel where lead originated |
| `last_touchpoint` | TEXT | NOT NULL, CHECK ('web','whatsapp','voice','social') | **Core** - Most recent channel used |
| `last_interaction_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** - Last interaction timestamp |
| `brand` | TEXT | DEFAULT 'proxe', CHECK ('proxe') | **Brand-specific** - Currently only 'proxe' |
| `unified_context` | JSONB | DEFAULT '{}' | **JSONB** - Cross-channel conversation data, summaries, intent signals |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** - Lead creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | **Core** - Last update timestamp (auto-updated via trigger) |
| `lead_score` | INTEGER | DEFAULT 0, CHECK (0-100), INDEXED | **Core** - Auto-calculated score (0-100) |
| `lead_stage` | TEXT | DEFAULT 'New', CHECK (valid stages), INDEXED | **Core** - Current stage (New, Engaged, Qualified, etc.) |
| `sub_stage` | TEXT | NULL, INDEXED | **Optional** - Sub-stage classification |
| `stage_override` | BOOLEAN | DEFAULT FALSE, INDEXED | **Core** - Flag for manual stage override |
| `last_scored_at` | TIMESTAMPTZ | NULL | **Optional** - Timestamp of last score calculation |
| `is_active_chat` | BOOLEAN | DEFAULT FALSE, INDEXED | **Core** - Flag for active conversation |
| `status` | TEXT | NULL | **Optional** - Lead status (New Lead, Follow Up, etc.) |
| `booking_date` | DATE | NULL, INDEXED | **Optional** - Scheduled booking date |
| `booking_time` | TIME | NULL | **Optional** - Scheduled booking time |

**Unique Constraint:** `(customer_phone_normalized, brand)` - Ensures one lead per phone per brand

**Indexes:**
- `idx_all_leads_phone_brand` - Deduplication lookup
- `idx_all_leads_first_touchpoint` - Filter by first channel
- `idx_all_leads_last_touchpoint` - Filter by last channel
- `idx_all_leads_last_interaction_at` - Sort by recency
- `idx_all_leads_brand` - Brand filtering
- `idx_all_leads_created_at` - Sort by creation date
- `idx_all_leads_lead_score` - Sort by score
- `idx_all_leads_lead_stage` - Filter by stage
- `idx_all_leads_sub_stage` - Filter by sub-stage
- `idx_all_leads_stage_override` - Find overridden leads
- `idx_all_leads_is_active_chat` - Find active chats
- `idx_all_leads_booking_date` - Find bookings

---

### `web_sessions` Table

**Purpose:** Self-contained Web PROXe session data (all web-specific fields)

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** - Unique session identifier |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** - Links to all_leads |
| `brand` | TEXT | DEFAULT 'proxe', CHECK ('proxe') | **Brand-specific** |
| `customer_name` | TEXT | NULL | **Optional** - Customer name (may differ from all_leads) |
| `customer_email` | TEXT | NULL | **Optional** - Customer email |
| `customer_phone` | TEXT | NULL | **Optional** - Customer phone |
| `customer_phone_normalized` | TEXT | NULL | **Optional** - Normalized phone |
| `external_session_id` | TEXT | NULL, INDEXED | **Optional** - External system session ID |
| `chat_session_id` | TEXT | NULL | **Optional** - Chat widget session ID |
| `website_url` | TEXT | NULL | **Optional** - URL where session originated |
| `booking_status` | TEXT | CHECK ('pending','confirmed','cancelled') | **Optional** - Booking status |
| `booking_date` | DATE | NULL, INDEXED | **Optional** - Scheduled booking date |
| `booking_time` | TIME | NULL | **Optional** - Scheduled booking time |
| `google_event_id` | TEXT | NULL | **Optional** - Google Calendar event ID |
| `booking_created_at` | TIMESTAMPTZ | NULL | **Optional** - Booking creation timestamp |
| `conversation_summary` | TEXT | NULL | **Optional** - AI-generated conversation summary |
| `user_inputs_summary` | JSONB | NULL | **JSONB** - Structured user inputs |
| `message_count` | INTEGER | DEFAULT 0 | **Core** - Number of messages in session |
| `last_message_at` | TIMESTAMPTZ | NULL | **Optional** - Last message timestamp |
| `session_status` | TEXT | DEFAULT 'active', CHECK ('active','completed','abandoned') | **Core** - Session status |
| `channel_data` | JSONB | DEFAULT '{}' | **JSONB** - Additional channel-specific data |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** - Session creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | **Core** - Last update timestamp (auto-updated) |

**Indexes:**
- `idx_web_sessions_lead_id` - Join to all_leads
- `idx_web_sessions_booking_date` - Find bookings
- `idx_web_sessions_created_at` - Sort by creation
- `idx_web_sessions_external_session_id` - Lookup by external ID

---

### `whatsapp_sessions` Table

**Purpose:** Self-contained WhatsApp session data

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** |
| `brand` | TEXT | DEFAULT 'proxe', CHECK ('proxe') | **Brand-specific** |
| `customer_name` | TEXT | NULL | **Optional** |
| `customer_email` | TEXT | NULL | **Optional** |
| `customer_phone` | TEXT | NULL | **Optional** |
| `customer_phone_normalized` | TEXT | NULL | **Optional** |
| `whatsapp_business_account_id` | TEXT | NULL | **Optional** - WhatsApp Business account ID |
| `whatsapp_contact_id` | TEXT | NULL | **Optional** - WhatsApp contact ID |
| `conversation_summary` | TEXT | NULL | **Optional** - AI-generated summary |
| `conversation_context` | JSONB | NULL | **JSONB** - Conversation context data |
| `user_inputs_summary` | JSONB | NULL | **JSONB** - Structured user inputs |
| `message_count` | INTEGER | DEFAULT 0 | **Core** |
| `last_message_at` | TIMESTAMPTZ | NULL | **Optional** |
| `last_message_from` | TEXT | NULL | **Optional** - Last message sender |
| `last_message_preview` | TEXT | NULL | **Optional** - Last message preview |
| `conversation_status` | TEXT | NULL | **Optional** - Conversation status |
| `response_time_avg_seconds` | INTEGER | NULL | **Optional** - Average response time |
| `overall_sentiment` | TEXT | NULL | **Optional** - Sentiment analysis |
| `channel_data` | JSONB | DEFAULT '{}' | **JSONB** |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | **Core** |

**Indexes:**
- `idx_whatsapp_sessions_lead_id` - Join to all_leads
- `idx_whatsapp_sessions_created_at` - Sort by creation

---

### `voice_sessions` Table

**Purpose:** Self-contained Voice session data

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** |
| `brand` | TEXT | DEFAULT 'proxe', CHECK ('proxe') | **Brand-specific** |
| `customer_name` | TEXT | NULL | **Optional** |
| `customer_email` | TEXT | NULL | **Optional** |
| `customer_phone` | TEXT | NULL | **Optional** |
| `customer_phone_normalized` | TEXT | NULL | **Optional** |
| `call_sid` | TEXT | NULL | **Optional** - Call SID from provider |
| `phone_number` | TEXT | NULL | **Optional** - Phone number used |
| `call_duration_seconds` | INTEGER | NULL | **Optional** - Call duration |
| `call_status` | TEXT | NULL | **Optional** - Call status |
| `call_direction` | TEXT | NULL | **Optional** - Inbound/outbound |
| `recording_url` | TEXT | NULL | **Optional** - Call recording URL |
| `transcription` | TEXT | NULL | **Optional** - Call transcription |
| `call_summary` | TEXT | NULL | **Optional** - AI-generated summary |
| `sentiment` | TEXT | NULL | **Optional** - Sentiment analysis |
| `conversation_context` | JSONB | NULL | **JSONB** |
| `user_inputs_summary` | JSONB | NULL | **JSONB** |
| `audio_quality` | TEXT | NULL | **Optional** - Audio quality metrics |
| `channel_data` | JSONB | DEFAULT '{}' | **JSONB** |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | **Core** |

**Indexes:**
- `idx_voice_sessions_lead_id` - Join to all_leads
- `idx_voice_sessions_created_at` - Sort by creation

---

### `social_sessions` Table

**Purpose:** Self-contained Social session data (Instagram/FB DMs)

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** |
| `brand` | TEXT | DEFAULT 'proxe', CHECK ('proxe') | **Brand-specific** |
| `customer_name` | TEXT | NULL | **Optional** |
| `customer_email` | TEXT | NULL | **Optional** |
| `customer_phone` | TEXT | NULL | **Optional** |
| `customer_phone_normalized` | TEXT | NULL | **Optional** |
| `platform` | TEXT | NULL | **Optional** - Instagram, Facebook, etc. |
| `platform_user_id` | TEXT | NULL | **Optional** - Platform user ID |
| `platform_username` | TEXT | NULL | **Optional** - Platform username |
| `engagement_type` | TEXT | NULL | **Optional** - DM, comment, etc. |
| `content_id` | TEXT | NULL | **Optional** - Related content ID |
| `engagement_preview` | TEXT | NULL | **Optional** - Engagement preview |
| `last_engagement_at` | TIMESTAMPTZ | NULL | **Optional** - Last engagement timestamp |
| `engagement_count` | INTEGER | DEFAULT 0 | **Core** - Number of engagements |
| `conversation_summary` | TEXT | NULL | **Optional** - AI-generated summary |
| `conversation_context` | JSONB | NULL | **JSONB** |
| `user_inputs_summary` | JSONB | NULL | **JSONB** |
| `sentiment` | TEXT | NULL | **Optional** |
| `engagement_quality` | TEXT | NULL | **Optional** - Quality metrics |
| `channel_data` | JSONB | DEFAULT '{}' | **JSONB** |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | **Core** |

**Indexes:**
- `idx_social_sessions_lead_id` - Join to all_leads
- `idx_social_sessions_created_at` - Sort by creation

---

### `conversations` Table (formerly `messages`)

**Purpose:** Universal append-only message log (all channels)

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** - Unique message identifier |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** - Links to lead |
| `channel` | TEXT | NOT NULL, CHECK ('web','whatsapp','voice','social'), INDEXED | **Core** - Channel source |
| `sender` | TEXT | NOT NULL, CHECK ('customer','agent','system') | **Core** - Message sender |
| `content` | TEXT | NOT NULL | **Core** - Message content |
| `message_type` | TEXT | DEFAULT 'text' | **Optional** - text, image, file, system |
| `metadata` | JSONB | DEFAULT '{}' | **JSONB** - Additional message metadata |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** - Message timestamp |

**Indexes:**
- `idx_conversations_lead_id` - Get all messages for a lead
- `idx_conversations_channel` - Filter by channel
- `idx_conversations_created_at` - Sort chronologically
- `idx_conversations_lead_channel` - Composite index for lead+channel queries

---

### `dashboard_users` Table

**Purpose:** User accounts with roles (extends Supabase auth.users)

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, FK → auth.users(id), ON DELETE CASCADE | **Core** - References Supabase auth user |
| `email` | TEXT | NOT NULL | **Core** - User email |
| `full_name` | TEXT | NULL | **Optional** - User's full name |
| `role` | TEXT | NOT NULL, DEFAULT 'viewer', CHECK ('admin','viewer') | **Core** - User role |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | **Core** |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | **Core** |
| `last_login` | TIMESTAMPTZ | NULL | **Optional** - Last login timestamp |
| `is_active` | BOOLEAN | DEFAULT TRUE | **Core** - Active status |

---

### `lead_activities` Table

**Purpose:** Team actions: calls, meetings, messages, notes

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** |
| `activity_type` | TEXT | NOT NULL, CHECK ('call','meeting','message','note') | **Core** - Activity type |
| `note` | TEXT | NOT NULL | **Core** - Activity note/description |
| `duration_minutes` | INTEGER | NULL | **Optional** - Duration for calls/meetings |
| `next_followup_date` | TIMESTAMPTZ | NULL, INDEXED | **Optional** - Scheduled follow-up |
| `created_by` | UUID | FK → dashboard_users(id), NOT NULL, INDEXED | **Core** - User who created activity |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** |

**Indexes:**
- `idx_lead_activities_lead_id` - Get all activities for a lead
- `idx_lead_activities_created_at` - Sort chronologically
- `idx_lead_activities_activity_type` - Filter by type
- `idx_lead_activities_created_by` - Filter by user
- `idx_lead_activities_next_followup_date` - Find scheduled follow-ups

---

### `lead_stage_changes` Table

**Purpose:** Logs all stage transitions (automatic and manual)

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** |
| `old_stage` | TEXT | NULL | **Optional** - Previous stage |
| `new_stage` | TEXT | NOT NULL, INDEXED | **Core** - New stage |
| `old_sub_stage` | TEXT | NULL | **Optional** - Previous sub-stage |
| `new_sub_stage` | TEXT | NULL | **Optional** - New sub-stage |
| `old_score` | INTEGER | NULL | **Optional** - Previous score |
| `new_score` | INTEGER | NULL | **Optional** - New score |
| `changed_by` | UUID | FK → dashboard_users(id), NULL | **Optional** - User who changed (NULL = automatic) |
| `change_reason` | TEXT | NULL | **Optional** - Reason for change |
| `is_automatic` | BOOLEAN | DEFAULT FALSE | **Core** - True if automatic, false if manual |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** |

**Indexes:**
- `idx_lead_stage_changes_lead_id` - Get all changes for a lead
- `idx_lead_stage_changes_created_at` - Sort chronologically
- `idx_lead_stage_changes_new_stage` - Filter by stage

---

### `lead_stage_overrides` Table

**Purpose:** Tracks manual stage overrides

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** |
| `overridden_stage` | TEXT | NOT NULL | **Core** - Manually set stage |
| `overridden_sub_stage` | TEXT | NULL | **Optional** - Manually set sub-stage |
| `overridden_by` | UUID | FK → dashboard_users(id), NOT NULL | **Core** - User who set override |
| `override_reason` | TEXT | NULL | **Optional** - Reason for override |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** |
| `removed_at` | TIMESTAMPTZ | NULL | **Optional** - When override was removed |
| `is_active` | BOOLEAN | DEFAULT TRUE, INDEXED | **Core** - Active override flag |

**Indexes:**
- `idx_lead_stage_overrides_lead_id` - Find overrides for a lead
- `idx_lead_stage_overrides_is_active` - Find active overrides
- `idx_lead_stage_overrides_created_at` - Sort chronologically

---

### `stage_history` Table

**Purpose:** Historical stage change tracking (alternative to lead_stage_changes)

| Field Name | Data Type | Constraints | Purpose/Notes |
|------------|-----------|-------------|---------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | **Core** |
| `lead_id` | UUID | FK → all_leads(id), ON DELETE CASCADE, NOT NULL, INDEXED | **Core** |
| `old_stage` | TEXT | NULL | **Optional** - Previous stage |
| `new_stage` | TEXT | NOT NULL, INDEXED | **Core** - New stage |
| `score_at_change` | INTEGER | NULL | **Optional** - Score when changed |
| `changed_by` | TEXT | NOT NULL, INDEXED | **Core** - 'system' or user_id |
| `changed_at` | TIMESTAMPTZ | DEFAULT NOW(), INDEXED | **Core** |
| `reason` | TEXT | NULL | **Optional** - Change reason |

**Indexes:**
- `idx_stage_history_lead_id` - Get all changes for a lead
- `idx_stage_history_changed_at` - Sort chronologically
- `idx_stage_history_new_stage` - Filter by stage
- `idx_stage_history_changed_by` - Filter by changer

---

### `unified_leads` View

**Purpose:** Dashboard display view - aggregates all customer data from all_leads + channel tables

**Columns:**
- `id` - From all_leads
- `name` - From all_leads.customer_name
- `email` - From all_leads.email
- `phone` - From all_leads.phone
- `first_touchpoint` - From all_leads
- `last_touchpoint` - From all_leads
- `brand` - From all_leads
- `timestamp` - From all_leads.created_at
- `last_interaction_at` - From all_leads
- `lead_score` - From all_leads (COALESCE to 0)
- `lead_stage` - From all_leads (COALESCE to 'New')
- `sub_stage` - From all_leads
- `stage_override` - From all_leads (COALESCE to FALSE)
- `last_scored_at` - From all_leads
- `is_active_chat` - From all_leads
- `status` - From web_sessions.booking_status (COALESCE to 'new')
- `booking_date` - From web_sessions (latest)
- `booking_time` - From web_sessions (latest)
- `metadata` - JSONB with aggregated channel data:
  - `web_data` - Latest web_sessions data
  - `whatsapp_data` - Latest whatsapp_sessions data
  - `voice_data` - Latest voice_sessions data
  - `social_data` - Aggregated social_sessions data
- `unified_context` - From all_leads (JSONB)

**Filter:** Only includes leads where `customer_name`, `email`, or `phone` is NOT NULL

---

## 3. RELATIONSHIPS MAP

### Parent → Child Relationships

```
all_leads (Parent)
  ├── web_sessions.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  ├── whatsapp_sessions.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  ├── voice_sessions.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  ├── social_sessions.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  ├── conversations.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  ├── lead_activities.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  ├── lead_stage_changes.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  ├── lead_stage_overrides.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)
  └── stage_history.lead_id → all_leads.id (One-to-Many, CASCADE DELETE)

auth.users (Supabase Auth)
  └── dashboard_users.id → auth.users.id (One-to-One, CASCADE DELETE)

dashboard_users (Parent)
  ├── user_invitations.invited_by → dashboard_users.id (Many-to-One, SET NULL)
  ├── dashboard_settings.updated_by → dashboard_users.id (Many-to-One, SET NULL)
  ├── lead_activities.created_by → dashboard_users.id (Many-to-One, NOT NULL)
  ├── lead_stage_changes.changed_by → dashboard_users.id (Many-to-One, NULL)
  └── lead_stage_overrides.overridden_by → dashboard_users.id (Many-to-One, NOT NULL)
```

### Relationship Types

- **One-to-Many:** One lead can have many sessions, conversations, activities, stage changes
- **Many-to-One:** Many activities/changes can be created by one user
- **One-to-One:** One dashboard_user corresponds to one auth.user

### Key Foreign Keys

| Child Table | Foreign Key Field | References | On Delete |
|-------------|------------------|-------------|-----------|
| `web_sessions.lead_id` | UUID | `all_leads.id` | CASCADE |
| `whatsapp_sessions.lead_id` | UUID | `all_leads.id` | CASCADE |
| `voice_sessions.lead_id` | UUID | `all_leads.id` | CASCADE |
| `social_sessions.lead_id` | UUID | `all_leads.id` | CASCADE |
| `conversations.lead_id` | UUID | `all_leads.id` | CASCADE |
| `lead_activities.lead_id` | UUID | `all_leads.id` | CASCADE |
| `lead_stage_changes.lead_id` | UUID | `all_leads.id` | CASCADE |
| `lead_stage_overrides.lead_id` | UUID | `all_leads.id` | CASCADE |
| `stage_history.lead_id` | UUID | `all_leads.id` | CASCADE |
| `dashboard_users.id` | UUID | `auth.users.id` | CASCADE |
| `user_invitations.invited_by` | UUID | `dashboard_users.id` | SET NULL |
| `dashboard_settings.updated_by` | UUID | `dashboard_users.id` | SET NULL |
| `lead_activities.created_by` | UUID | `dashboard_users.id` | (NOT NULL) |
| `lead_stage_changes.changed_by` | UUID | `dashboard_users.id` | (NULL allowed) |
| `lead_stage_overrides.overridden_by` | UUID | `dashboard_users.id` | (NOT NULL) |

---

## 4. DATA FLOW

### User Action on Website → Database Updates

**Flow:** Web PROXe Widget → Webhook → API Handler → Database

1. **User interacts with web widget** (goproxe.com)
2. **Webhook sent to** `POST /api/integrations/web-agent`
3. **API Handler processes:**
   - Validates `name` and `phone` (required)
   - Normalizes phone: `normalize_phone(phone)` → digits only
   - Checks for existing lead: `SELECT * FROM all_leads WHERE customer_phone_normalized = ? AND brand = 'proxe'`
   
4. **If NEW lead:**
   - `INSERT INTO all_leads` with:
     - `first_touchpoint = 'web'`
     - `last_touchpoint = 'web'`
     - `customer_phone_normalized = normalized_phone`
     - `unified_context = '{}'`
   - `INSERT INTO web_sessions` with all provided data
   - `INSERT INTO conversations` with `channel='web'`, `sender='system'`
   
5. **If EXISTING lead:**
   - `UPDATE all_leads SET last_touchpoint = 'web', last_interaction_at = NOW()`
   - `INSERT INTO web_sessions` (new session record)
   - `INSERT INTO conversations` (new message)
   - Update `unified_context.web` with conversation summary

6. **Trigger fires:** `trigger_conversations_update_score` → Calls `update_lead_score_and_stage()`
7. **Score calculation:** `calculate_lead_score()` → Updates `all_leads.lead_score` and `lead_stage`
8. **Stage change logged:** `INSERT INTO lead_stage_changes` (if stage changed)
9. **Realtime broadcast:** Supabase Realtime notifies dashboard subscribers

**Tables Updated:**
- `all_leads` (INSERT or UPDATE)
- `web_sessions` (INSERT)
- `conversations` (INSERT)
- `lead_stage_changes` (INSERT, if stage changed)

---

### WhatsApp Message → Database Updates

**Flow:** WhatsApp Backend → Webhook → API Handler → Database

1. **WhatsApp message received** (via Meta API)
2. **Webhook sent to** `POST /api/integrations/whatsapp`
3. **API Handler processes:**
   - Normalizes phone number
   - Checks for existing lead (same as web flow)
   
4. **If NEW lead:**
   - `INSERT INTO all_leads` with `first_touchpoint = 'whatsapp'`
   - `INSERT INTO whatsapp_sessions`
   - `INSERT INTO conversations` with `channel='whatsapp'`
   
5. **If EXISTING lead:**
   - `UPDATE all_leads SET last_touchpoint = 'whatsapp', last_interaction_at = NOW()`
   - `INSERT INTO whatsapp_sessions` (or UPDATE existing)
   - `INSERT INTO conversations`
   - Update `unified_context.whatsapp` via `updateWhatsAppContext()`

6. **Trigger fires:** Score calculation and stage update
7. **Realtime broadcast:** Dashboard updates

**Tables Updated:**
- `all_leads` (INSERT or UPDATE)
- `whatsapp_sessions` (INSERT or UPDATE)
- `conversations` (INSERT)
- `lead_stage_changes` (INSERT, if stage changed)

---

### How `unified_leads` View Aggregates Data

**View Definition:** `unified_leads` is a SQL view that:

1. **Base Table:** `all_leads` (aliased as `al`)
2. **Left Joins:**
   - Latest `web_sessions` (ORDER BY created_at DESC LIMIT 1)
   - Latest `whatsapp_sessions` (ORDER BY created_at DESC LIMIT 1)
   - Latest `voice_sessions` (ORDER BY created_at DESC LIMIT 1)
   - All `social_sessions` (JSONB_AGG)

3. **Aggregated Fields:**
   - `status` - From `web_sessions.booking_status` (COALESCE to 'new')
   - `booking_date` - From latest `web_sessions.booking_date`
   - `booking_time` - From latest `web_sessions.booking_time`
   - `metadata` - JSONB object with:
     - `web_data` - Latest web session fields
     - `whatsapp_data` - Latest WhatsApp session fields
     - `voice_data` - Latest voice session fields
     - `social_data` - Aggregated array of social sessions

4. **Scoring Fields:** Directly from `all_leads`:
   - `lead_score` (COALESCE to 0)
   - `lead_stage` (COALESCE to 'New')
   - `sub_stage`
   - `stage_override` (COALESCE to FALSE)
   - `last_scored_at`
   - `is_active_chat`

5. **Filter:** Only includes leads where `customer_name`, `email`, or `phone` is NOT NULL

**Usage:** Dashboard queries `unified_leads` view to display leads table with all channel data in one row.

---

## 5. BRAND SEPARATION

### Tables with `brand` Field

| Table | Field Name | Default | Constraint | Purpose |
|-------|------------|---------|------------|---------|
| `all_leads` | `brand` | 'proxe' | CHECK ('proxe') | Currently only 'proxe' supported |
| `web_sessions` | `brand` | 'proxe' | CHECK ('proxe') | Brand isolation |
| `whatsapp_sessions` | `brand` | 'proxe' | CHECK ('proxe') | Brand isolation |
| `voice_sessions` | `brand` | 'proxe' | CHECK ('proxe') | Brand isolation |
| `social_sessions` | `brand` | 'proxe' | CHECK ('proxe') | Brand isolation |

### How Data is Filtered by Brand

**Deduplication:** `all_leads` has unique constraint on `(customer_phone_normalized, brand)`
- Same phone number can exist for different brands
- Each brand has separate lead records

**Queries:** All queries should filter by `brand = 'proxe'` (or parameterized brand)
- Example: `SELECT * FROM all_leads WHERE brand = $1`
- Example: `SELECT * FROM web_sessions WHERE brand = 'proxe'`

**RLS Policies:** Currently all RLS policies allow access to all brands (no brand filtering in RLS)
- Future: Can add brand-based RLS policies if needed

### Shared vs Isolated Tables

**Shared Tables (No Brand Field):**
- `dashboard_users` - Users are shared across brands (future: may need brand-specific roles)
- `user_invitations` - Invitations are shared
- `dashboard_settings` - Settings are shared (future: may need brand-specific settings)
- `conversations` - Messages are linked via `lead_id` (which has brand)
- `lead_activities` - Activities are linked via `lead_id` (which has brand)
- `lead_stage_changes` - Stage changes are linked via `lead_id` (which has brand)
- `lead_stage_overrides` - Overrides are linked via `lead_id` (which has brand)
- `stage_history` - History is linked via `lead_id` (which has brand)

**Isolated Tables (Have Brand Field):**
- `all_leads` - **Core isolation** - One lead per phone per brand
- `web_sessions` - Brand-specific sessions
- `whatsapp_sessions` - Brand-specific sessions
- `voice_sessions` - Brand-specific sessions
- `social_sessions` - Brand-specific sessions

**Isolation Strategy:**
- **Primary Key:** `all_leads` uses `(customer_phone_normalized, brand)` unique constraint
- **Foreign Keys:** All child tables link via `lead_id` (which includes brand context)
- **Queries:** Must always filter by `brand` when querying lead-related tables
- **Future Multi-Tenant:** To add new brand, update CHECK constraints and add brand to queries

---

## Summary

**Total Tables:** 14 tables + 1 view
- **Core Tables:** 4 (dashboard_users, user_invitations, dashboard_settings, dashboard_leads)
- **Multi-Touchpoint Tables:** 6 (all_leads, web_sessions, whatsapp_sessions, voice_sessions, social_sessions, conversations)
- **Lead Intelligence Tables:** 4 (lead_activities, lead_stage_changes, lead_stage_overrides, stage_history)
- **Views:** 1 (unified_leads)

**Key Design Principles:**
1. **Deduplication:** `all_leads` ensures one lead per phone per brand
2. **Self-Contained:** Channel tables contain all necessary data (no required joins)
3. **Append-Only:** `conversations` table is append-only (no updates/deletes)
4. **Brand Isolation:** Brand field in all lead-related tables
5. **Real-time:** All tables enabled for Supabase Realtime
6. **RLS Enabled:** All tables have Row Level Security policies

**Data Flow Summary:**
- **Website →** `all_leads` + `web_sessions` + `conversations`
- **WhatsApp →** `all_leads` + `whatsapp_sessions` + `conversations`
- **Voice →** `all_leads` + `voice_sessions` + `conversations`
- **Social →** `all_leads` + `social_sessions` + `conversations`
- **Dashboard →** Queries `unified_leads` view (aggregates all channels)
