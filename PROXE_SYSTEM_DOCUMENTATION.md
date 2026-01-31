# PROXe System Documentation

**Version:** 1.0  
**Last Updated:** January 31, 2026  
**Author:** PROXe Development Team

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [Lead Scoring Algorithm](#3-lead-scoring-algorithm)
4. [Lead Stages & Lifecycle](#4-lead-stages--lifecycle)
5. [API Routes & Functions](#5-api-routes--functions)
6. [Omnichannel Agent](#6-omnichannel-agent)
7. [Brand Customization](#7-brand-customization)
8. [Deployment Checklist](#8-deployment-checklist)
9. [Calculations & Business Logic](#9-calculations--business-logic)
10. [Current Setup Status](#10-current-setup-status)

---

## 1. ARCHITECTURE OVERVIEW

### Master → Brand Inheritance Model

PROXe uses a **brand-based monorepo structure** where each brand is a complete, standalone application:

```
Command Center/
├── brand/
│   ├── master/          # Template/reference (not deployed)
│   ├── proxe/           # PROXe brand
│   │   ├── dashboard/build/
│   │   ├── web-agent/build/
│   │   └── whatsapp/
│   └── windchasers/     # Windchasers brand
│       ├── dashboard/build/
│       ├── web-agent/build/
│       └── whatsapp/
```

**Key Principles:**
- **Complete Separation**: Each brand is independent with no shared code
- **Separate Databases**: Each brand has its own Supabase project
- **Independent Deployment**: Brands deploy separately to Vercel
- **Brand-Specific Config**: Custom themes, fields, workflows per brand

### Multi-Brand Setup

**Current Brands:**
1. **PROXe** - Master brand for business solutions
2. **Windchasers** - Aviation training academy
3. **Future Brands** - Easily add new brands by copying structure

**Brand Differentiation:**
- Separate Supabase projects (database isolation)
- Custom brand colors and themes
- Brand-specific custom fields in `unified_context`
- Different lead scoring factors
- Unique workflows and integrations

### Monorepo Structure

Each brand contains:
- **`dashboard/build/`** - Next.js dashboard app (port 4000/4001/4002)
- **`web-agent/build/`** - Next.js web widget app (port 3000/3001)
- **`whatsapp/`** - WhatsApp integration (VPS-based)
- **`supabase/migrations/`** - Database migrations
- **`docs/`** - Brand-specific documentation

### Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.3.3
- **UI**: React 18, Tailwind CSS 3.4
- **Database**: Supabase (PostgreSQL)
- **AI**: Anthropic Claude SDK
- **Real-time**: Supabase Realtime
- **Charts**: Recharts 2.10.3
- **Calendar**: Google Calendar API (Windchasers)

### Deployment Strategy

**Vercel Deployment:**
- Each brand dashboard → Separate Vercel project
- Each web-agent → Separate Vercel project
- Custom domains per brand
- Environment variables per deployment

**VPS Deployment:**
- WhatsApp agents run on VPS (not Vercel)
- Nginx reverse proxy configuration
- PM2 process management

---

## 2. DATABASE SCHEMA

### Core Tables

#### `all_leads` - Unified Lead Table
**Purpose**: One record per unique customer (deduplicated by phone + brand)

```sql
CREATE TABLE all_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  customer_phone_normalized TEXT,  -- Deduplication key
  
  -- Channel tracking
  first_touchpoint TEXT CHECK (first_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_touchpoint TEXT CHECK (last_touchpoint IN ('web', 'whatsapp', 'voice', 'social')),
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  
  -- Brand isolation
  brand TEXT DEFAULT 'proxe' CHECK (brand IN ('proxe', 'windchasers')),
  
  -- Unified context (JSONB)
  unified_context JSONB,  -- Cross-channel data, brand-specific fields
  
  -- Lead scoring
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_stage TEXT DEFAULT 'New',
  sub_stage TEXT,
  stage_override BOOLEAN DEFAULT FALSE,
  is_manual_override BOOLEAN DEFAULT FALSE,
  last_scored_at TIMESTAMP WITH TIME ZONE,
  
  -- Activity tracking
  is_active_chat BOOLEAN DEFAULT FALSE,
  response_count INTEGER DEFAULT 0,
  days_inactive INTEGER DEFAULT 0,
  total_touchpoints INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(customer_phone_normalized, brand)
);
```

**Indexes:**
```sql
CREATE INDEX idx_all_leads_brand ON all_leads(brand);
CREATE INDEX idx_all_leads_phone_normalized ON all_leads(customer_phone_normalized);
CREATE INDEX idx_all_leads_last_interaction ON all_leads(last_interaction_at DESC);
CREATE INDEX idx_all_leads_lead_score ON all_leads(lead_score DESC);
CREATE INDEX idx_all_leads_lead_stage ON all_leads(lead_stage);
```

#### Channel-Specific Session Tables

**`web_sessions`** - Web chat interactions
```sql
CREATE TABLE web_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe',
  
  session_id TEXT UNIQUE,
  conversation_summary TEXT,
  message_count INTEGER DEFAULT 0,
  session_status TEXT DEFAULT 'active',
  
  -- Booking data
  booking_date DATE,
  booking_time TIME,
  booking_status TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**`whatsapp_sessions`** - WhatsApp conversations
```sql
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe',
  
  whatsapp_id TEXT,
  phone_number TEXT,
  conversation_summary TEXT,
  sentiment TEXT,
  avg_response_time_seconds INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**`voice_sessions`** - Voice call interactions
```sql
CREATE TABLE voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe',
  
  call_duration_seconds INTEGER,
  transcription TEXT,
  recording_url TEXT,
  call_summary TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**`social_sessions`** - Social media engagements
```sql
CREATE TABLE social_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  brand TEXT DEFAULT 'proxe',
  
  platform TEXT CHECK (platform IN ('instagram', 'facebook', 'twitter', 'linkedin')),
  engagement_type TEXT,
  sentiment TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### `conversations` - Universal Message Log
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  
  channel TEXT CHECK (channel IN ('web', 'whatsapp', 'voice', 'social')),
  sender TEXT CHECK (sender IN ('customer', 'agent', 'system')),
  content TEXT,
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
```

#### Supporting Tables

**`lead_stage_changes`** - Stage transition audit log
```sql
CREATE TABLE lead_stage_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  
  old_stage TEXT,
  new_stage TEXT NOT NULL,
  old_score INTEGER,
  new_score INTEGER,
  
  changed_by TEXT NOT NULL,  -- 'PROXe AI', 'system', or user_id
  is_automatic BOOLEAN DEFAULT TRUE,
  change_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**`activities`** - Team-logged activities
```sql
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  
  activity_type TEXT CHECK (activity_type IN ('call', 'meeting', 'message', 'note')),
  note TEXT NOT NULL,
  duration_minutes INTEGER,
  next_followup_date TIMESTAMP WITH TIME ZONE,
  
  created_by UUID REFERENCES dashboard_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**`dashboard_users`** - Dashboard user accounts
```sql
CREATE TABLE dashboard_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);
```

**`dashboard_settings`** - Configuration key-value store
```sql
CREATE TABLE dashboard_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  
  updated_by UUID REFERENCES dashboard_users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Views

**`unified_leads`** - Aggregated lead view
```sql
CREATE VIEW unified_leads AS
SELECT 
  al.*,
  ws.booking_date,
  ws.booking_time,
  ws.booking_status,
  ws.conversation_summary AS web_summary,
  wh.sentiment AS whatsapp_sentiment,
  vs.call_duration_seconds,
  ss.platform AS social_platform
FROM all_leads al
LEFT JOIN web_sessions ws ON al.id = ws.lead_id
LEFT JOIN whatsapp_sessions wh ON al.id = wh.lead_id
LEFT JOIN voice_sessions vs ON al.id = vs.lead_id
LEFT JOIN social_sessions ss ON al.id = ss.lead_id;
```

### Brand-Specific Fields

**PROXe `unified_context` structure:**
```json
{
  "web": {
    "conversation_summary": "string",
    "last_interaction": "timestamp"
  },
  "whatsapp": {
    "conversation_summary": "string",
    "sentiment": "positive|neutral|negative"
  }
}
```

**Windchasers `unified_context` structure:**
```json
{
  "windchasers": {
    "user_type": "student|parent|professional",
    "city": "string",
    "course_interest": "DGCA|Flight|Heli|Cabin|Drone",
    "training_type": "online|offline|hybrid",
    "class_12_science": boolean,
    "plan_to_fly": "asap|1-3mo|6+mo|1yr+",
    "budget_awareness": "aware|exploring|unaware",
    "dgca_completed": boolean,
    "button_clicks": {}
  },
  "web": {
    "conversation_summary": "string"
  }
}
```

---

## 3. LEAD SCORING ALGORITHM

### Overview
- **Scale**: 0-100
- **Auto-calculation**: Triggered on message insert, manual rescore
- **Manual Override**: Admins can lock scores to prevent auto-updates

### Calculation Formula

**Total Score = (AI × 0.6) + (Activity × 0.3) + (Business × 0.1)**

### 1. AI Analysis (60% weight)

**Intent Signals (40% of AI score)**
```typescript
const intentKeywords = {
  pricing: ['price', 'cost', 'pricing', 'fee', 'charge', 'afford', 'budget'],
  booking: ['book', 'schedule', 'appointment', 'reserve', 'available', 'slot'],
  urgency: ['urgent', 'asap', 'soon', 'immediately', 'quickly', 'today', 'now']
};

// Score: 0-3 signals detected → normalized to 0-100
intentScore = (signalsDetected / 3) * 100;
```

**Sentiment Analysis (30% of AI score)**
```typescript
const positiveWords = ['good', 'great', 'excellent', 'perfect', 'love', 'interested', 'yes'];
const negativeWords = ['bad', 'terrible', 'worst', 'hate', 'no', 'not', 'cancel'];

sentimentScore = positiveCount > negativeCount
  ? Math.min(100, 50 + (positiveCount * 10))
  : Math.max(0, 50 - (negativeCount * 10));
```

**Buying Signals (30% of AI score)**
```typescript
const buyingSignals = [
  'when can', 'how much', 'i want', 'i need', 'interested in',
  'ready', 'sign up', 'register', 'confirm', 'enroll'
];

buyingScore = Math.min(100, buyingSignalCount * 20);
```

**Combined AI Score:**
```typescript
aiScore = (intentScore * 0.4) + (sentimentScore * 0.3) + (buyingScore * 0.3);
// Weighted: aiScore * 0.6 (contributes 0-60 to total)
```

### 2. Activity Score (30% weight)

**Message Count**
```typescript
msgCountNormalized = Math.min(1.0, messageCount / 100);
// 100 messages = 1.0, capped at 1.0
```

**Response Rate**
```typescript
responseRate = agentMessages / customerMessages;
// 0-1 scale (e.g., 0.52 = 52% response rate)
```

**Recency**
```typescript
daysSinceLastInteraction = (now - lastInteraction) / (1000 * 60 * 60 * 24);
recencyScore = Math.max(0, 1.0 - (daysSinceLastInteraction / 30));
// 0 days = 1.0, 30 days = 0
```

**Channel Mix Bonus**
```typescript
channelMixBonus = activeChannels >= 2 ? 0.1 : 0;
```

**Combined Activity Score:**
```typescript
activityScoreBase = ((msgCountNormalized + responseRate + recencyScore) / 3) + channelMixBonus;
activityScore = Math.min(100, activityScoreBase * 100);
// Weighted: activityScore * 0.3 (contributes 0-30 to total)
```

### 3. Business Signals (10% weight)

```typescript
let businessScore = 0;

// Booking exists: +10 points
if (hasBooking) businessScore += 10;

// Email/phone provided: +5 points
if (email || phone) businessScore += 5;

// Multi-touchpoint (2+ channels): +5 points
if (activeChannels >= 2) businessScore += 5;

// Normalize to 0-10 for 10% weight
businessScoreNormalized = Math.min(10, businessScore);
```

### Score Breakdown Response

```typescript
{
  score: 75,  // Total score (0-100)
  breakdown: {
    ai: 45,        // 0-60 (weighted)
    activity: 20,  // 0-30 (weighted)
    business: 10,  // 0-10 (weighted)
    details: {
      intentScore: 67,
      sentimentScore: 80,
      buyingScore: 60,
      msgCount: 25,
      responseRate: 52,
      daysInactive: 2,
      hasBooking: true,
      hasContact: true,
      multiChannel: false
    }
  }
}
```

---

## 4. LEAD STAGES & LIFECYCLE

### Stage Definitions

| Stage | Score Range | Description | Triggers |
|-------|-------------|-------------|----------|
| **New** | 0-20 | Initial contact, minimal engagement | Lead created |
| **Engaged** | 21-40 | Active conversation, asking questions | Multiple messages exchanged |
| **Qualified** | 41-60 | Shows clear interest, provided contact info | Email/phone shared, intent signals |
| **High Intent** | 61-80 | Strong buying signals, discussing specifics | Pricing questions, timeline discussions |
| **Booking Made** | 81-90 | Scheduled appointment/demo | Booking confirmed |
| **Converted** | 91-100 | Completed purchase/enrollment | Payment received, contract signed |
| **Closed Lost** | N/A | Opportunity lost | Explicit rejection, unresponsive |
| **In Sequence** | N/A | In automated follow-up | Added to nurture campaign |
| **Cold** | N/A | Inactive for 30+ days | No interaction for 30 days |

### Sub-Stages (High Intent)

- **proposal** - Proposal sent, awaiting response
- **negotiation** - Discussing terms, pricing
- **on-hold** - Delayed decision, follow-up scheduled

### Stage Transition Logic

**Auto-Transitions (unless manual override):**
```typescript
if (score >= 0 && score <= 20) stage = 'New';
else if (score >= 21 && score <= 40) stage = 'Engaged';
else if (score >= 41 && score <= 60) stage = 'Qualified';
else if (score >= 61 && score <= 80) stage = 'High Intent';
else if (score >= 81 && score <= 90) stage = 'Booking Made';
else if (score >= 91) stage = 'Converted';

// Override conditions
if (daysInactive >= 30 && !stage_override) stage = 'Cold';
if (booking_status === 'confirmed') stage = 'Booking Made';
```

**Manual Override:**
- Admin can set `stage_override = true`
- Prevents auto-transitions
- Logged in `lead_stage_changes` table
- Override reason required

### Lifecycle Flow

```
New → Engaged → Qualified → High Intent → Booking Made → Converted
  ↓      ↓          ↓            ↓              ↓
  ↓      ↓          ↓            ↓              ↓
  └──────┴──────────┴────────────┴──────────────┴─→ Closed Lost
                                                  ↓
                                              In Sequence
                                                  ↓
                                                Cold
```

---

## 5. API ROUTES & FUNCTIONS

### Dashboard API Routes

#### GET `/api/dashboard/leads`
**Purpose**: Fetch paginated leads with filtering

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 100)
- `source` (string) - Filter by touchpoint
- `status` (string) - Filter by status
- `startDate`, `endDate` (ISO strings)

**Response:**
```json
{
  "leads": [...],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 500,
    "totalPages": 5
  }
}
```

#### GET `/api/dashboard/leads/[id]/summary`
**Purpose**: Get detailed lead summary

**Response:** Full lead object with channel data

#### POST `/api/dashboard/leads/[id]/stage`
**Purpose**: Update lead stage

**Body:**
```json
{
  "stage": "Qualified",
  "sub_stage": "proposal",
  "override": false
}
```

#### GET `/api/dashboard/leads/[id]/score`
**Purpose**: Get lead score breakdown

#### GET/POST `/api/dashboard/leads/[id]/activities`
**Purpose**: Get/create activity logs

#### GET `/api/dashboard/metrics`
**Purpose**: Get dashboard metrics

**Response:**
```json
{
  "totalConversations": 1000,
  "activeConversations": 50,
  "avgResponseTime": 5,
  "conversionRate": 15,
  "leadsByChannel": [...],
  "conversationsOverTime": [...],
  "conversionFunnel": [...]
}
```

#### GET `/api/dashboard/founder-metrics`
**Purpose**: Comprehensive founder-level analytics

**Features:**
- 30-second caching
- Hot leads calculation (score >= 70)
- Stale leads detection (48+ hours inactive)

### Integration API Routes

#### POST `/api/integrations/web-agent`
**Purpose**: Web chat integration endpoint

**Body:**
```json
{
  "sessionId": "uuid",
  "phone": "+1234567890",
  "email": "user@example.com",
  "name": "John Doe",
  "messages": [...],
  "booking": {...}
}
```

#### POST `/api/integrations/whatsapp`
**Purpose**: WhatsApp webhook handler

#### GET `/api/integrations/whatsapp/system-prompt`
**Purpose**: Get context-aware system prompt

**Query:** `?phone=+1234567890`

**Response:** System prompt with cross-channel context

#### POST `/api/integrations/voice`
**Purpose**: Voice call integration

### Lead Scoring API Routes

#### POST `/api/leads/score`
**Purpose**: Calculate and update lead score

**Body:**
```json
{
  "lead_id": "uuid"
}
```

#### POST `/api/leads/rescore-all`
**Purpose**: Recalculate all lead scores

**Auth:** Requires CRON_SECRET

### Calendar API Routes (Windchasers)

#### POST `/api/calendar/availability`
**Purpose**: Check available time slots

**Body:**
```json
{
  "date": "2026-01-30T00:00:00Z"
}
```

**Response:**
```json
{
  "date": "2026-01-30",
  "availability": {
    "11:00": true,
    "13:00": false,
    "15:00": true
  },
  "slots": [...]
}
```

#### GET/POST `/api/calendar/events`
**Purpose**: List/create Google Calendar events

#### POST `/api/calendar/sync`
**Purpose**: Sync bookings to Google Calendar

### Utility Routes

#### GET `/api/status`
**Purpose**: Health check

#### GET `/api/diagnostics/supabase`
**Purpose**: Database diagnostics

---

## 6. OMNICHANNEL AGENT

### Web Widget Functionality

**Embed Code:**
```html
<script src="https://proxe.yourdomain.com/widget/embed.js"></script>
```

**Widget API:**
```javascript
window.PROXeWidget.open();
window.PROXeWidget.close();
window.PROXeWidget.toggle();
```

**Features:**
- Persistent chat sessions (localStorage)
- Real-time messaging
- Booking flow integration
- Lead capture forms
- Conversation history

### WhatsApp Integration

**Architecture:**
- VPS-hosted Node.js service
- WhatsApp Business API / Baileys library
- Webhook integration with dashboard
- Context-aware AI responses

**Flow:**
1. Customer sends WhatsApp message
2. Webhook triggers dashboard API
3. System checks for existing lead (phone lookup)
4. Fetches cross-channel context
5. Generates AI response with context
6. Sends reply via WhatsApp API
7. Logs message in `conversations` table

### Instagram DM (Planned)

**Status:** In development
**Integration:** Meta Graph API
**Features:** Similar to WhatsApp flow

### Unified Context Across Channels

**Deduplication Logic:**
```typescript
// Phone normalization
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// Lead lookup
const existingLead = await supabase
  .from('all_leads')
  .select('*')
  .eq('customer_phone_normalized', normalizePhone(phone))
  .eq('brand', 'proxe')
  .single();

if (existingLead) {
  // Update existing lead
  // Merge unified_context
} else {
  // Create new lead
}
```

**Context Merging:**
```typescript
const unifiedContext = {
  ...existingLead.unified_context,
  [channel]: {
    ...existingLead.unified_context?.[channel],
    conversation_summary: newSummary,
    last_interaction: new Date().toISOString()
  }
};
```

---

## 7. BRAND CUSTOMIZATION

### Master Dashboard Features

**Core Features (All Brands):**
- Lead management
- Conversation inbox
- Metrics dashboard
- Activity logging
- Stage management
- Real-time updates

### Brand-Specific Fields

**PROXe:**
- Standard CRM fields
- Generic business context

**Windchasers:**
- `user_type`: student/parent/professional
- `course_interest`: DGCA/Flight/Heli/Cabin/Drone
- `training_type`: online/offline/hybrid
- `class_12_science`: boolean
- `plan_to_fly`: timeline
- `budget_awareness`: level
- `dgca_completed`: boolean

### Custom Lead Scoring Factors

**PROXe:**
- Standard intent/sentiment/activity scoring

**Windchasers:**
- Aviation-specific keywords
- Course-specific intent signals
- Training timeline urgency
- Budget awareness level

### Brand-Specific Workflows

**PROXe:**
- Generic sales pipeline
- Standard follow-up sequences

**Windchasers:**
- Course enrollment workflow
- Demo session booking
- Training timeline planning
- Certification tracking

---

## 8. DEPLOYMENT CHECKLIST

### Vercel Setup Per Brand

**Dashboard Deployment:**
1. Create new Vercel project
2. Link to GitHub repo
3. Set root directory: `brand/[brand]/dashboard/build`
4. Configure build settings:
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`
5. Add environment variables (see below)
6. Deploy

**Web-Agent Deployment:**
1. Create new Vercel project
2. Set root directory: `brand/[brand]/web-agent/build`
3. Configure build settings (same as dashboard)
4. Add environment variables
5. Deploy

### Environment Variables Required

**Dashboard:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
NEXT_PUBLIC_BRAND=proxe
CLAUDE_API_KEY=sk-ant-xxx
CRON_SECRET=xxx

# Windchasers only
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nxxx\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=calendar@example.com
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
```

**Web-Agent:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
NEXT_PUBLIC_BRAND=proxe
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.proxe.com
CLAUDE_API_KEY=sk-ant-xxx
```

### DNS Configuration

**PROXe:**
- Dashboard: `dashboard.proxe.com` → Vercel
- Web Agent: `widget.proxe.com` → Vercel
- WhatsApp: `whatsapp.proxe.com` → VPS

**Windchasers:**
- Dashboard: `proxe.windchasers.in` → Vercel
- Web Agent: `widget.windchasers.in` → Vercel
- WhatsApp: `whatsapp.windchasers.in` → VPS

### Testing Procedures

**Pre-Deployment:**
1. Run `npm run build` locally
2. Test all API routes
3. Verify database connections
4. Check environment variables
5. Test widget embed

**Post-Deployment:**
1. Health check: `/api/status`
2. Database check: `/api/diagnostics/supabase`
3. Test lead creation flow
4. Verify real-time updates
5. Test booking flow
6. Check error logging

### VPS Migration Status

**Current Setup:**
- WhatsApp agents running on VPS
- Nginx reverse proxy configured
- PM2 process management
- SSL certificates via Let's Encrypt

**Migration Plan:**
- Keep WhatsApp on VPS (Vercel limitations)
- Dashboard/Web-Agent on Vercel (better performance)

---

## 9. CALCULATIONS & BUSINESS LOGIC

### Lead Score Formula

See [Section 3: Lead Scoring Algorithm](#3-lead-scoring-algorithm)

### Response Time Metrics

```typescript
// Average response time (seconds)
const avgResponseTime = await supabase
  .from('conversations')
  .select('created_at')
  .eq('lead_id', leadId)
  .order('created_at', { ascending: true });

let totalResponseTime = 0;
let responseCount = 0;

for (let i = 1; i < messages.length; i++) {
  if (messages[i].sender === 'agent' && messages[i-1].sender === 'customer') {
    const responseTime = new Date(messages[i].created_at) - new Date(messages[i-1].created_at);
    totalResponseTime += responseTime;
    responseCount++;
  }
}

const avgResponseTimeSeconds = responseCount > 0 
  ? Math.floor(totalResponseTime / responseCount / 1000)
  : 0;
```

### Conversion Tracking

```typescript
// Conversion rate calculation
const totalLeads = await supabase
  .from('all_leads')
  .select('id', { count: 'exact' })
  .eq('brand', 'proxe');

const convertedLeads = await supabase
  .from('all_leads')
  .select('id', { count: 'exact' })
  .eq('brand', 'proxe')
  .eq('lead_stage', 'Converted');

const conversionRate = (convertedLeads.count / totalLeads.count) * 100;
```

### Booking Management

```typescript
// Booking creation
async function createBooking(leadId, bookingData) {
  // 1. Update web_session
  await supabase
    .from('web_sessions')
    .update({
      booking_date: bookingData.date,
      booking_time: bookingData.time,
      booking_status: 'pending'
    })
    .eq('lead_id', leadId);
  
  // 2. Update unified_context
  const { data: lead } = await supabase
    .from('all_leads')
    .select('unified_context')
    .eq('id', leadId)
    .single();
  
  const updatedContext = {
    ...lead.unified_context,
    web: {
      ...lead.unified_context?.web,
      booking: bookingData
    }
  };
  
  await supabase
    .from('all_leads')
    .update({ unified_context: updatedContext })
    .eq('id', leadId);
  
  // 3. Create Google Calendar event (Windchasers)
  if (brand === 'windchasers') {
    await fetch('/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify({
        summary: `Demo - ${lead.customer_name}`,
        start: `${bookingData.date}T${bookingData.time}:00+05:30`,
        end: `${bookingData.date}T${addHour(bookingData.time)}:00+05:30`,
        attendees: [{ email: lead.email }]
      })
    });
  }
  
  // 4. Trigger score recalculation
  await fetch('/api/leads/score', {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId })
  });
}
```

---

## 10. CURRENT SETUP STATUS

### What's Live

**PROXe:**
- ✅ Dashboard: Running on Vercel (port 4000 dev)
- ✅ Web Agent: Deployed
- ✅ Database: Supabase project active
- ✅ Lead scoring: Operational
- ⚠️ WhatsApp: VPS-based (needs migration check)

**Windchasers:**
- ✅ Dashboard: `https://proxe.windchasers.in`
- ✅ Web Agent: `https://widget.windchasers.in`
- ✅ Database: Separate Supabase project
- ✅ Google Calendar: Integrated
- ✅ Lead scoring: Operational
- ✅ Widget embed: Live on website

### What's In Progress

- 🔄 Instagram DM integration
- 🔄 Advanced analytics dashboard
- 🔄 Automated follow-up sequences
- 🔄 Multi-language support
- 🔄 Voice call transcription improvements

### Known Issues

1. **Widget localStorage persistence**: Occasional session loss on page refresh
   - **Workaround**: Session recovery via phone lookup
   
2. **Real-time updates delay**: 2-3 second lag in dashboard
   - **Status**: Investigating Supabase Realtime configuration
   
3. **Lead deduplication edge cases**: International phone formats
   - **Fix**: Enhanced phone normalization function needed

4. **Google Calendar sync**: Rate limiting on bulk sync
   - **Workaround**: Batch processing with delays

### Next Priorities

1. **High Priority:**
   - Fix widget session persistence
   - Optimize real-time updates
   - Complete Instagram DM integration
   - Implement automated follow-up sequences

2. **Medium Priority:**
   - Advanced reporting dashboard
   - Export functionality (CSV/Excel)
   - Team collaboration features
   - Mobile app (React Native)

3. **Low Priority:**
   - Multi-language support
   - Custom branding per user
   - Advanced AI features (sentiment analysis improvements)
   - Integration marketplace

---

## Appendix A: Code Examples

### Lead Creation Flow

```typescript
// 1. Normalize phone
const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

// 2. Check for existing lead
const { data: existingLead } = await supabase
  .from('all_leads')
  .select('*')
  .eq('customer_phone_normalized', normalizedPhone)
  .eq('brand', 'proxe')
  .single();

if (existingLead) {
  // Update existing
  await supabase
    .from('all_leads')
    .update({
      last_touchpoint: 'web',
      last_interaction_at: new Date().toISOString(),
      unified_context: mergeContext(existingLead.unified_context, newContext)
    })
    .eq('id', existingLead.id);
} else {
  // Create new
  const { data: newLead } = await supabase
    .from('all_leads')
    .insert({
      customer_name: name,
      email,
      phone,
      customer_phone_normalized: normalizedPhone,
      first_touchpoint: 'web',
      last_touchpoint: 'web',
      brand: 'proxe',
      unified_context: { web: newContext }
    })
    .select()
    .single();
}
```

### Real-time Subscription

```typescript
const subscription = supabase
  .channel('leads-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'all_leads',
      filter: `brand=eq.proxe`
    },
    (payload) => {
      console.log('Lead updated:', payload.new);
      // Update UI
    }
  )
  .subscribe();
```

---

**End of Documentation**

For questions or updates, contact: dev@proxe.com
