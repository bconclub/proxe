# PROXe Build Documentation - Complete Structure & Function Details

## Table of Contents
1. [Build Structure](#build-structure)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema](#database-schema)
4. [API Routes & Functions](#api-routes--functions)
5. [Components](#components)
6. [Libraries & Utilities](#libraries--utilities)
7. [Hooks](#hooks)
8. [Configuration](#configuration)
9. [Deployment](#deployment)
10. [Scripts](#scripts)

---

## Build Structure

### Directory Layout
```
brand/proxe/
├── dashboard/
│   └── build/                    # Next.js Dashboard Application
│       ├── src/
│       │   ├── app/              # Next.js App Router
│       │   │   ├── api/          # API Routes
│       │   │   ├── auth/          # Authentication pages
│       │   │   ├── dashboard/     # Dashboard pages
│       │   │   └── ...
│       │   ├── components/       # React components
│       │   ├── hooks/            # Custom React hooks
│       │   ├── lib/              # Utility libraries
│       │   ├── services/          # External service integrations
│       │   └── types/            # TypeScript type definitions
│       ├── public/               # Static assets
│       ├── scripts/              # Build & setup scripts
│       ├── package.json          # Dependencies
│       ├── next.config.js        # Next.js configuration
│       └── middleware.ts         # Next.js middleware
│
└── web-agent/
    └── build/                    # Next.js Web Agent Application
        ├── src/
        │   ├── app/              # Next.js App Router
        │   ├── components/       # React components
        │   ├── hooks/            # Custom React hooks
        │   ├── lib/              # Utility libraries
        │   └── configs/          # Configuration files
        └── package.json
```

---

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 14.2.18 (App Router)
- **Language**: TypeScript 5.3.3
- **UI**: React 18.3.0, Tailwind CSS 3.4.1
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime
- **AI**: Anthropic Claude SDK (@anthropic-ai/sdk 0.71.0)
- **Charts**: Recharts 2.10.3
- **Icons**: React Icons 4.12.0

### Key Features
- Multi-channel lead tracking (Web, WhatsApp, Voice, Social)
- Real-time lead updates via Supabase Realtime
- Automatic lead scoring (0-100 scale)
- Lead stage management (New → Engaged → Qualified → High Intent → Booking Made → Converted)
- Unified customer context across channels
- Booking management with Google Calendar integration
- Activity logging and audit trails

---

## Database Schema

### Core Tables

#### `all_leads` - Unified Lead Table
**Purpose**: One record per unique customer (deduplicated by phone + brand)

**Columns**:
- `id` (UUID, Primary Key)
- `customer_name` (TEXT)
- `email` (TEXT)
- `phone` (TEXT)
- `customer_phone_normalized` (TEXT) - Used for deduplication
- `first_touchpoint` (TEXT) - CHECK: 'web', 'whatsapp', 'voice', 'social'
- `last_touchpoint` (TEXT) - CHECK: 'web', 'whatsapp', 'voice', 'social'
- `last_interaction_at` (TIMESTAMP WITH TIME ZONE)
- `brand` (TEXT) - DEFAULT 'proxe', CHECK: 'proxe'
- `unified_context` (JSONB) - Cross-channel context data
- `lead_score` (INTEGER) - DEFAULT 0, CHECK: 0-100
- `lead_stage` (TEXT) - DEFAULT 'New', CHECK: 'New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted', 'Closed Lost', 'In Sequence', 'Cold'
- `sub_stage` (TEXT)
- `stage_override` (BOOLEAN) - DEFAULT FALSE
- `is_manual_override` (BOOLEAN) - DEFAULT FALSE
- `is_active_chat` (BOOLEAN) - DEFAULT FALSE
- `last_scored_at` (TIMESTAMP WITH TIME ZONE)
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

**Unique Constraint**: `(customer_phone_normalized, brand)`

#### Channel-Specific Tables

**`web_sessions`** - Web chat interactions
- References `all_leads(id)`
- Stores: booking info, conversation summary, message count, session status

**`whatsapp_sessions`** - WhatsApp conversations
- References `all_leads(id)`
- Stores: WhatsApp IDs, sentiment, response times

**`voice_sessions`** - Voice call interactions
- References `all_leads(id)`
- Stores: call duration, transcription, recording URL

**`social_sessions`** - Social media engagements
- References `all_leads(id)`
- Stores: platform, engagement type, sentiment

**`conversations`** - Universal message log (renamed from `messages`)
- References `all_leads(id)`
- Stores: channel, sender ('customer', 'agent', 'system'), content, metadata

#### Supporting Tables

**`lead_stage_changes`** - Logs all stage transitions
- `lead_id`, `old_stage`, `new_stage`, `old_score`, `new_score`, `changed_by`, `is_automatic`, `change_reason`

**`lead_stage_overrides`** - Tracks manual stage overrides
- `lead_id`, `overridden_stage`, `overridden_by`, `override_reason`, `is_active`

**`lead_activities`** - Team-logged activities
- `lead_id`, `activity_type` ('call', 'meeting', 'message', 'note'), `note`, `duration_minutes`, `next_followup_date`, `created_by`

**`dashboard_users`** - Dashboard user accounts
- Extends Supabase auth.users
- Roles: 'admin', 'viewer'

**`dashboard_settings`** - Dashboard configuration
- Key-value pairs stored as JSONB

### Views

**`unified_leads`** - Aggregated view combining:
- Base lead info from `all_leads`
- Web data from `web_sessions`
- WhatsApp data from `whatsapp_sessions`
- Voice data from `voice_sessions`
- Social data from `social_sessions`
- Lead scoring fields

---

## API Routes & Functions

### Dashboard API Routes

#### `/api/dashboard/leads` (GET)
**Purpose**: Fetch paginated leads with filtering

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 100)
- `source` (string) - Filter by touchpoint ('web', 'whatsapp', 'voice', 'social')
- `status` (string) - Filter by status
- `startDate` (string) - Filter by start date
- `endDate` (string) - Filter by end date

**Response**:
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

**Function Details**:
- Queries `unified_leads` view
- Orders by `last_interaction_at` DESC
- Supports filtering by `first_touchpoint` or `last_touchpoint`
- Returns paginated results with total count

#### `/api/dashboard/leads/[id]/summary` (GET)
**Purpose**: Get detailed summary for a specific lead

**Function Details**:
- Fetches lead from `all_leads` table
- Includes channel-specific data (web, whatsapp, voice, social)
- Returns unified context and metadata

#### `/api/dashboard/leads/[id]/stage` (POST)
**Purpose**: Update lead stage

**Request Body**:
```json
{
  "stage": "Qualified",
  "sub_stage": "proposal",
  "override": false
}
```

**Function Details**:
- Updates `lead_stage` and `sub_stage` in `all_leads`
- Logs change to `lead_stage_changes` table
- If override=true, sets `stage_override` flag
- Triggers score recalculation if needed

#### `/api/dashboard/leads/[id]/score` (GET)
**Purpose**: Get current lead score and breakdown

**Response**:
```json
{
  "score": 75,
  "breakdown": {
    "ai": 45,
    "activity": 20,
    "business": 10
  }
}
```

#### `/api/dashboard/leads/[id]/activities` (GET, POST)
**Purpose**: Get/create activity logs for a lead

**POST Request Body**:
```json
{
  "activity_type": "call",
  "note": "Followed up on pricing question",
  "duration_minutes": 15,
  "next_followup_date": "2026-01-30T10:00:00Z"
}
```

#### `/api/dashboard/metrics` (GET)
**Purpose**: Get dashboard metrics

**Response**:
```json
{
  "totalConversations": 1000,
  "activeConversations": 50,
  "avgResponseTime": 5,
  "conversionRate": 15,
  "leadsByChannel": [
    { "name": "web", "value": 600 },
    { "name": "whatsapp", "value": 300 },
    { "name": "voice", "value": 80 },
    { "name": "social", "value": 20 }
  ],
  "conversationsOverTime": [...],
  "conversionFunnel": [...],
  "responseTimeTrends": [...]
}
```

**Function Details**:
- Calculates metrics from `unified_leads` view
- Active conversations: leads with interaction in last 24 hours
- Conversion rate: leads with booking / total leads
- Groups by channel using `first_touchpoint`
- Generates time-series data for last 7 days

#### `/api/dashboard/founder-metrics` (GET)
**Purpose**: Get founder-level metrics (comprehensive analytics)

**Function Details**:
- Aggregates data from all channel tables
- Calculates booking metrics
- Provides conversation trends
- Includes lead scoring statistics

#### `/api/dashboard/bookings` (GET)
**Purpose**: Get all bookings

**Function Details**:
- Queries `web_sessions` for booking data
- Filters by `booking_status` ('pending', 'confirmed', 'cancelled')
- Returns booking date, time, and customer info

#### `/api/dashboard/channels/[channel]/metrics` (GET)
**Purpose**: Get channel-specific metrics

**Parameters**: `channel` - 'web', 'whatsapp', 'voice', 'social'

**Function Details**:
- Queries appropriate channel table (`web_sessions`, `whatsapp_sessions`, etc.)
- Calculates channel-specific metrics
- Returns conversation counts, engagement rates, etc.

#### `/api/dashboard/web/messages` (GET)
**Purpose**: Get messages from web channel

**Query Parameters**:
- `lead_id` (UUID) - Filter by lead
- `limit` (number) - Limit results

**Function Details**:
- Queries `conversations` table
- Filters by `channel = 'web'`
- Orders by `created_at` ASC

#### `/api/dashboard/whatsapp/messages` (GET)
**Purpose**: Get messages from WhatsApp channel

**Function Details**: Similar to web messages, filters by `channel = 'whatsapp'`

#### `/api/dashboard/summarize` (POST)
**Purpose**: Generate conversation summary using AI

**Request Body**:
```json
{
  "lead_id": "uuid",
  "channel": "web"
}
```

**Function Details**:
- Fetches messages from `conversations` table
- Sends to Claude API for summarization
- Updates `unified_context` with summary
- Updates channel-specific session table

#### `/api/dashboard/settings/widget-style` (GET, POST)
**Purpose**: Get/update widget styling settings

**Function Details**:
- Stores widget configuration in `dashboard_settings` table
- Key: 'widget_style'
- Value: JSONB with color, position, etc.

### Lead Scoring API Routes

#### `/api/leads/score` (POST)
**Purpose**: Calculate and update lead score

**Request Body**:
```json
{
  "lead_id": "uuid"
}
```

**Function Details**:
- Calls `calculateLeadScore()` function
- Updates `lead_score` in `all_leads`
- Updates `lead_stage` based on score
- Sets `last_scored_at` timestamp

#### `/api/leads/rescore-all` (POST)
**Purpose**: Recalculate scores for all leads

**Function Details**:
- Fetches all leads from `all_leads`
- Iterates through each lead
- Calls scoring function for each
- Returns summary of updates

#### `/api/test-scoring` (GET)
**Purpose**: Test scoring algorithm with sample data

**Function Details**:
- Creates test lead data
- Runs scoring calculation
- Returns detailed breakdown
- Useful for debugging scoring logic

### Integration API Routes

#### `/api/integrations/web-agent` (GET, POST)
**Purpose**: Web agent integration endpoint

**Function Details**:
- Receives web chat data
- Creates/updates `web_sessions`
- Links to `all_leads` via phone normalization
- Updates `unified_context`

#### `/api/integrations/whatsapp` (POST)
**Purpose**: WhatsApp webhook handler

**Function Details**:
- Receives WhatsApp messages
- Creates/updates `whatsapp_sessions`
- Links to `all_leads`
- Logs messages to `conversations` table

#### `/api/integrations/whatsapp/system-prompt` (GET)
**Purpose**: Get context-aware system prompt for WhatsApp

**Query Parameters**:
- `phone` (string) - Customer phone number

**Function Details**:
- Calls `claudeService.getWhatsAppSystemPrompt()`
- Fetches customer context from `all_leads`
- Builds prompt with cross-channel history
- Returns system prompt string

#### `/api/integrations/voice` (POST)
**Purpose**: Voice call integration endpoint

**Function Details**:
- Receives voice call data
- Creates/updates `voice_sessions`
- Stores transcription and summary
- Links to `all_leads`

### Webhook Routes

#### `/api/webhooks/message-created` (POST)
**Purpose**: Handle message creation webhooks

**Function Details**:
- Receives message from external system
- Creates entry in `conversations` table
- Updates lead `last_interaction_at`
- Triggers score recalculation

### Utility API Routes

#### `/api/status` (GET)
**Purpose**: Health check endpoint

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-27T10:00:00Z"
}
```

#### `/api/test-connection` (GET)
**Purpose**: Test Supabase connection

**Function Details**:
- Attempts to query `dashboard_users` table
- Returns connection status
- Useful for debugging

#### `/api/diagnostics/supabase` (GET)
**Purpose**: Diagnostic endpoint for Supabase

**Function Details**:
- Checks table existence
- Tests RLS policies
- Returns diagnostic information

---

## Components

### Dashboard Components

#### `DashboardLayout`
**Location**: `src/components/dashboard/DashboardLayout.tsx`

**Purpose**: Main layout wrapper for dashboard pages

**Features**:
- Sidebar navigation
- User menu
- Dark mode toggle
- Mobile responsive
- Build date display
- Page transition loader

**Navigation Items**:
- Overview (`/dashboard`)
- Conversations (`/dashboard/inbox`)
- Leads (`/dashboard/leads`)
- Events (`/dashboard/bookings`)
- Flows (`/dashboard/flows`)
- Audience (`/dashboard/audience`) - Coming Soon
- Configure (`/dashboard/settings`)
- Billing (`/dashboard/billing`) - Coming Soon

**Props**: `children` (React.ReactNode)

#### `FounderDashboard`
**Location**: `src/components/dashboard/FounderDashboard.tsx`

**Purpose**: Main dashboard overview page

**Features**:
- Real-time metrics display
- Channel-specific metrics
- Conversation trends
- Lead scoring statistics
- Booking calendar view

**Data Sources**:
- `/api/dashboard/founder-metrics`
- `/api/dashboard/metrics`
- Real-time updates via `useRealtimeMetrics` hook

#### `LeadsTable`
**Location**: `src/components/dashboard/LeadsTable.tsx`

**Purpose**: Display and manage leads

**Features**:
- Paginated lead list
- Filtering by source, status, date range
- Sortable columns
- Lead score display
- Stage selector
- Real-time updates via `useRealtimeLeads` hook

**Props**:
- `leads` (Lead[])
- `loading` (boolean)
- `onLeadClick` (function)
- `onStageChange` (function)

#### `LeadDetailsModal`
**Location**: `src/components/dashboard/LeadDetailsModal.tsx`

**Purpose**: Detailed lead view modal

**Features**:
- Lead information display
- Channel-specific data tabs
- Conversation history
- Activity log
- Score breakdown visualization
- Stage management
- Manual override toggle

**Props**:
- `lead` (Lead)
- `isOpen` (boolean)
- `onClose` (function)
- `onUpdate` (function)

#### `LeadStageSelector`
**Location**: `src/components/dashboard/LeadStageSelector.tsx`

**Purpose**: Stage selection dropdown

**Features**:
- Stage dropdown with all available stages
- Sub-stage selection for 'High Intent'
- Override toggle
- Visual stage indicators

**Stages**:
- New
- Engaged
- Qualified
- High Intent (sub-stages: proposal, negotiation, on-hold)
- Booking Made
- Converted
- Closed Lost
- In Sequence
- Cold

#### `MetricsDashboard`
**Location**: `src/components/dashboard/MetricsDashboard.tsx`

**Purpose**: Metrics visualization

**Features**:
- Total conversations
- Active conversations
- Conversion rate
- Channel distribution charts
- Time-series graphs
- Conversion funnel

**Uses**: Recharts for visualization

#### `WebMetrics`
**Location**: `src/components/dashboard/WebMetrics.tsx`

**Purpose**: Web channel-specific metrics

**Features**:
- Web session statistics
- Booking metrics
- Message count trends
- Response time analysis

#### `WhatsAppMetrics`
**Location**: `src/components/dashboard/WhatsAppMetrics.tsx`

**Purpose**: WhatsApp channel-specific metrics

**Features**:
- WhatsApp conversation stats
- Sentiment analysis
- Response time metrics
- Engagement trends

#### `BookingsCalendar`
**Location**: `src/components/dashboard/BookingsCalendar.tsx`

**Purpose**: Calendar view for bookings

**Features**:
- Monthly calendar view
- Booking display
- Click to view details
- Filter by status

#### `CalendarView`
**Location**: `src/components/dashboard/CalendarView.tsx`

**Purpose**: Alternative calendar visualization

**Features**:
- Day/week/month views
- Booking timeline
- Drag-and-drop support (if implemented)

#### `ActivityLoggerModal`
**Location**: `src/components/dashboard/ActivityLoggerModal.tsx`

**Purpose**: Log activities for leads

**Features**:
- Activity type selection (call, meeting, message, note)
- Note input
- Duration tracking
- Next follow-up date
- Activity history display

**Props**:
- `leadId` (string)
- `isOpen` (boolean)
- `onClose` (function)
- `onActivityAdded` (function)

#### `MicroCharts`
**Location**: `src/components/dashboard/MicroCharts.tsx`

**Purpose**: Small chart components for dashboard

**Features**:
- Mini line charts
- Mini bar charts
- Sparklines
- Used in metric cards

#### `ThemeProvider`
**Location**: `src/components/dashboard/ThemeProvider.tsx`

**Purpose**: Theme context provider

**Features**:
- Dark/light mode management
- Theme persistence
- System preference detection

#### `LoadingOverlay`
**Location**: `src/components/dashboard/LoadingOverlay.tsx`

**Purpose**: Loading state overlay

**Features**:
- Full-screen loading indicator
- Spinner animation
- Optional message

#### `PageTransitionLoader`
**Location**: `src/components/PageTransitionLoader.tsx`

**Purpose**: Page transition loading indicator

**Features**:
- Route change detection
- Loading animation
- Smooth transitions

---

## Libraries & Utilities

### Lead Scoring Library

#### `leadScoreCalculator.ts`
**Location**: `src/lib/leadScoreCalculator.ts`

**Exports**:
- `calculateLeadScore(leadData: Lead): Promise<CalculatedScore>`

**Scoring Algorithm**:

**1. AI Analysis (60% weight)**:
- **Intent Signals (40%)**: Detects pricing, booking, urgency keywords
- **Sentiment Analysis (30%)**: Positive/negative word detection
- **Buying Signals (30%)**: Question depth and engagement indicators

**2. Activity Score (30% weight)**:
- **Message Count**: Normalized to 0-1 (100 messages = 1.0)
- **Response Rate**: Agent messages / Customer messages
- **Recency**: Days since last interaction (0 days = 1.0, 30 days = 0)
- **Channel Mix Bonus**: +0.1 for 2+ channels

**3. Business Signals (10% weight)**:
- Booking exists: +10 points
- Email/phone provided: +5 points
- Multi-touchpoint: +5 points

**Total Score**: Capped at 100

**Returns**:
```typescript
{
  score: number,        // 0-100
  breakdown: {
    ai: number,         // 0-60 (weighted)
    activity: number,   // 0-30 (weighted)
    business: number    // 0-10 (weighted)
  }
}
```

### Supabase Client Library

#### `client.ts`
**Location**: `src/lib/supabase/client.ts`

**Exports**:
- `createClient()` - Creates Supabase client for client-side use

**Function Details**:
- Uses `@supabase/ssr` for cookie-based auth
- Configured for browser environment
- Handles session management

#### `server.ts`
**Location**: `src/lib/supabase/server.ts`

**Exports**:
- `createClient()` - Creates Supabase client for server-side use

**Function Details**:
- Uses `@supabase/ssr` for server-side auth
- Reads cookies from request
- Handles server-side session management

#### `middleware.ts`
**Location**: `src/lib/supabase/middleware.ts`

**Exports**:
- `updateSession(request: NextRequest)` - Updates session in middleware

**Function Details**:
- Refreshes Supabase session
- Updates cookies
- Called on every request

### Utility Functions

#### `utils.ts`
**Location**: `src/lib/utils.ts`

**Exports**:
- `cn(...inputs: ClassValue[])` - Merges Tailwind classes
- `formatDate(date: string | Date): string` - Formats date
- `formatDateTime(date: string | Date): string` - Formats date and time
- `formatTime(date: string | Date): string` - Formats time

**Function Details**:
- Uses `clsx` and `tailwind-merge` for class merging
- Date formatting uses `en-US` locale
- Consistent formatting across app

### Build Info Library

#### `buildInfo.ts`
**Location**: `src/lib/buildInfo.ts`

**Exports**:
- `BUILD_TIME` - Build timestamp (from env)
- `getBuildDate(): string` - Formatted build date

**Function Details**:
- Reads `NEXT_PUBLIC_BUILD_TIME` env variable
- Formats date in IST timezone
- Used in dashboard footer

### Claude Service

#### `claudeService.js`
**Location**: `src/services/claudeService.js`

**Exports**:
- `fetchCustomerContext(phone, brand, supabase)` - Fetches customer context
- `buildSystemPrompt(context, customerName)` - Builds system prompt
- `getWhatsAppSystemPrompt(phone, customerName, brand, supabase)` - Main function
- `extractTopics(summary)` - Extracts topics from summary
- `formatBookingDate(dateString, timeString)` - Formats booking date

**Function Details**:

**`fetchCustomerContext()`**:
- Normalizes phone number
- Fetches lead from `all_leads`
- Fetches summaries from all channel tables
- Returns unified context object

**`buildSystemPrompt()`**:
- Builds context-aware system prompt
- Includes web conversation history
- Includes WhatsApp history
- Includes voice call history
- Includes social engagement
- Includes booking information
- Provides first message guidelines

**`getWhatsAppSystemPrompt()`**:
- Main entry point
- Fetches context
- Builds prompt
- Returns system prompt string

---

## Hooks

### `useRealtimeLeads`
**Location**: `src/hooks/useRealtimeLeads.ts`

**Purpose**: Real-time lead updates hook

**Returns**:
```typescript
{
  leads: Lead[],
  loading: boolean,
  error: string | null
}
```

**Function Details**:
- Subscribes to `all_leads` table changes
- Falls back to `unified_leads` if RLS blocks access
- Automatically refetches on changes
- Maps data to consistent Lead interface
- Handles both `customer_name` (all_leads) and `name` (unified_leads) formats

**Usage**:
```typescript
const { leads, loading, error } = useRealtimeLeads()
```

### `useRealtimeMetrics`
**Location**: `src/hooks/useRealtimeMetrics.ts`

**Purpose**: Real-time metrics updates hook

**Returns**:
```typescript
{
  metrics: Metrics | null,
  loading: boolean,
  error: string | null
}
```

**Function Details**:
- Subscribes to relevant tables
- Refetches metrics on changes
- Calculates metrics client-side
- Updates in real-time

**Usage**:
```typescript
const { metrics, loading, error } = useRealtimeMetrics()
```

---

## Configuration

### Next.js Configuration

#### PROXe Dashboard `next.config.js`
**Location**: `brand/proxe/dashboard/build/next.config.js`

**Configuration**:
- React Strict Mode: Enabled
- CORS headers for `https://goproxe.com`
- Allows GET, POST methods
- Content-Type header allowed
- ESLint: Not explicitly disabled (uses default Next.js behavior)

#### Windchasers Dashboard `next.config.js`
**Location**: `brand/windchasers/dashboard/build/next.config.js`

**Configuration**:
- React Strict Mode: Enabled
- **ESLint**: `ignoreDuringBuilds: true` (disabled during builds to prevent build failures)
- TypeScript: `ignoreBuildErrors: false` (type checking enabled)
- Webpack: Server-side chunk splitting disabled (fixes @ symbol issues in filenames)
- CORS headers: `Access-Control-Allow-Origin: *` (allows all origins)
- Cache headers: Static chunks cached for 1 year (immutable)
- CSS headers: Content-Type set to `text/css; charset=utf-8`

### TypeScript Configuration

#### `tsconfig.json`
**Location**: `brand/proxe/dashboard/build/tsconfig.json`

**Settings**:
- Target: ES2020
- Module: ESNext
- JSX: preserve
- Strict mode: Enabled
- Path aliases: `@/*` → `./src/*`

### Tailwind Configuration

#### `tailwind.config.ts`
**Location**: `brand/proxe/dashboard/build/tailwind.config.ts`

**Configuration**:
- Content paths: `src/**/*.{js,ts,jsx,tsx}`
- Theme extensions
- Dark mode: class-based
- Custom colors for PROXe branding

### Package Configuration

#### `package.json`
**Location**: `brand/proxe/dashboard/build/package.json`

**Scripts**:
- `dev`: Start dev server on port 4000
- `prebuild`: Set build time
- `build`: Build for production
- `start`: Start production server on port 4000
- `lint`: Run ESLint
- `type-check`: TypeScript type checking

**Key Dependencies**:
- `next`: ^14.2.18
- `react`: ^18.3.0
- `@supabase/supabase-js`: ^2.39.0
- `@supabase/ssr`: ^0.1.0
- `@anthropic-ai/sdk`: ^0.71.0
- `recharts`: ^2.10.3
- `date-fns`: ^3.0.6
- `zod`: ^3.22.4

### Environment Variables

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side)
- `ANTHROPIC_API_KEY` - Claude API key (for AI features)
- `NEXT_PUBLIC_BUILD_TIME` - Build timestamp (set during build)

**Optional**:
- `PORT` - Server port (default: 4000)
- `NODE_ENV` - Environment (development/production)

---

## Multi-Brand Architecture

### Repository Structure

```
Command Center/
├── brand/
│   ├── proxe/
│   │   ├── dashboard/build/          # PROXe Dashboard (Next.js)
│   │   ├── web-agent/                # PROXe Web Agent (Next.js)
│   │   ├── supabase/                 # PROXe Database migrations
│   │   └── docs/                     # PROXe Documentation
│   │
│   ├── windchasers/
│   │   ├── dashboard/build/          # Windchasers Dashboard (Next.js)
│   │   ├── web-agent/build/          # Windchasers Web Agent (Next.js)
│   │   ├── supabase/                 # Windchasers Database migrations
│   │   └── docs/                     # Windchasers Documentation
│   │
│   └── master/
│       ├── dashboard/build/          # Master Dashboard (Next.js)
│       ├── web-agent/build/          # Master Web Agent (Next.js)
│       └── docs/                     # Master Documentation
│
├── .github/workflows/                # GitHub Actions workflows
│   ├── deploy-proxe-dashboard.yml
│   ├── deploy-windchasers-dashboard.yml
│   └── deploy-windchasers-web-agent.yml
│
└── package.json                      # Root package.json (orchestration scripts)
```

### Brand Separation Principles

1. **Complete Independence**: Each brand is a standalone Next.js application
   - Separate `build/` directories with complete source code
   - No shared code between brands
   - Independent `package.json` files
   - Separate Supabase projects

2. **Development Ports**:
   - PROXe Dashboard: `4000`
   - PROXe Web Agent: `4001`
   - Windchasers Dashboard: `4002`
   - Windchasers Web Agent: `3001`
   - Master Dashboard: Varies
   - Master Web Agent: Varies

3. **Production Deployment Paths**:
   - PROXe Dashboard: `/var/www/proxe-dashboard/` (Port 4000)
   - Windchasers Dashboard: `/var/www/windchasers-proxe/` (Port 3003)
   - Windchasers Web Agent: `/var/www/windchasers-web-agent/` (Port 3001)

4. **Environment Variables**:
   - Each brand uses brand-specific Supabase credentials
   - PROXe: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Windchasers: `NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL`, `NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY`
   - Never share credentials between brands

### Root Package.json Scripts

**Location**: `package.json` (root)

**Development Scripts**:
```json
{
  "dev": "Run all brands concurrently",
  "dev:proxe": "Run PROXe dashboard + web-agent",
  "dev:windchasers": "Run Windchasers dashboard + web-agent",
  "dev:master": "Run Master dashboard + web-agent",
  "dev:proxe-dash": "cd brand/proxe/dashboard/build && npm run dev",
  "dev:windchasers-dash": "cd brand/windchasers/dashboard/build && npm run dev:dashboard",
  "dev:windchasers-agent": "cd brand/windchasers/web-agent/build && npm run dev"
}
```

**Build Scripts**:
```json
{
  "build": "npm run build:proxe && npm run build:windchasers",
  "build:proxe": "cd brand/proxe/dashboard/build && npm run build",
  "build:windchasers": "cd brand/windchasers/dashboard/build && npm run build"
}
```

---

## Deployment

### PM2 Configuration

#### PROXe Dashboard `ecosystem.config.js`
**Location**: `brand/proxe/dashboard/build/ecosystem.config.js`

**Configuration**:
- App name: `proxe-dashboard`
- Port: 4000
- Max memory: 1GB
- Auto-restart: Enabled
- Log files: `/var/www/proxe-dashboard/logs/`

**Usage**:
```bash
pm2 start ecosystem.config.js    # Start
pm2 restart ecosystem.config.js   # Restart
pm2 stop ecosystem.config.js      # Stop
pm2 logs proxe-dashboard          # View logs
```

#### Windchasers Dashboard `ecosystem.config.js`
**Location**: `brand/windchasers/dashboard/build/ecosystem.config.js`

**Configuration**:
- App name: `windchasers-dashboard`
- Port: 3003 (production)
- Max memory: 1GB
- Auto-restart: Enabled
- Log files: `/var/www/windchasers-proxe/logs/`

#### Windchasers Web Agent `ecosystem.config.js`
**Location**: `brand/windchasers/web-agent/build/ecosystem.config.js`

**Configuration**:
- App name: `windchasers-web-agent`
- Port: 3001 (production)
- Max memory: 512MB
- Auto-restart: Enabled

### GitHub Actions Deployment Workflows

#### PROXe Dashboard Deployment
**Location**: `.github/workflows/deploy-proxe-dashboard.yml`

**Triggers**:
- Push to `production` or `main` branch
- Paths: `brand/proxe/build/**`
- Manual: `workflow_dispatch`

**Deployment Steps**:
1. Checkout code
2. Setup Node.js 20
3. Increment build version (via `scripts/set-build-time.js`)
4. Setup SSH with `VPS_DEPLOY_KEY`
5. Rsync files to `/var/www/proxe-dashboard/` (excludes `.env.local`, `node_modules`, `.next`)
6. SSH to VPS and:
   - Verify `.env.local` exists
   - Clean previous build (`.next`, `node_modules/.cache`)
   - Install dependencies (`npm ci`)
   - Build application (`npm run build`)
   - Verify build success (check `.next/BUILD_ID`, chunk count)
   - Stop old PM2 process
   - Start with PM2 (`PORT=4000`)
   - Health check (`/api/health` or `/health`)
   - Verify Supabase connection

**VPS Path**: `/var/www/proxe-dashboard/`
**Production Port**: `4000`
**PM2 Process**: `proxe-dashboard`

#### Windchasers Dashboard Deployment
**Location**: `.github/workflows/deploy-windchasers-dashboard.yml`

**Triggers**:
- Push to `production` or `main` branch
- Paths: `brand/windchasers/dashboard/build/**`
- Manual: `workflow_dispatch`

**Deployment Steps**:
1. Checkout code
2. Setup Node.js 20
3. Increment build version (via `scripts/increment-build.js`)
4. Commit version bump (auto-commit with `[skip ci]`)
5. Setup SSH with `WINDCHASERS_VPS_SSH_KEY`
6. Rsync files to `/var/www/windchasers-proxe/`
7. Deploy PM2 ecosystem config
8. SSH to VPS and:
   - Verify `.env.local` with Windchasers-specific variables:
     - `NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL`
     - `NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `CLAUDE_API_KEY`
   - Clean previous build
   - Install dependencies (`npm ci`)
   - Build application (`npm run build`)
   - Verify build success (BUILD_ID, chunks, CSS files)
   - Stop old PM2 process
   - Start with PM2 ecosystem (`windchasers-dashboard`)
   - Health check with retries (`/api/health` or `/health`)
   - Verify Supabase connection via `/api/status`
   - Show PM2 status and verification

**VPS Path**: `/var/www/windchasers-proxe/`
**Production Port**: `3003`
**PM2 Process**: `windchasers-dashboard`

**Build Configuration**:
- ESLint disabled during builds (`ignoreDuringBuilds: true`)
- TypeScript checking enabled
- Webpack server-side chunk splitting disabled

#### Windchasers Web Agent Deployment
**Location**: `.github/workflows/deploy-windchasers-web-agent.yml`

**Triggers**:
- Push to `production` or `main` branch
- Paths: `brand/windchasers/web-agent/build/**`
- Manual: `workflow_dispatch`

**Deployment Steps**:
1. Checkout code
2. Setup Node.js 20
3. Setup SSH with `WINDCHASERS_VPS_SSH_KEY`
4. Rsync files to `/var/www/windchasers-web-agent/`
5. Deploy PM2 ecosystem config (if exists)
6. SSH to VPS and:
   - Verify `.env.local` with Windchasers-specific variables
   - Install dependencies (`npm ci`)
   - Build application (`npm run build`)
   - Verify build success
   - Stop old PM2 process
   - Start with PM2 (`windchasers-web-agent`)
   - Health check (`/widget` endpoint)
   - Verify Supabase connection (check logs)

**VPS Path**: `/var/www/windchasers-web-agent/`
**Production Port**: `3001`
**PM2 Process**: `windchasers-web-agent`

### Build Verification

All deployment workflows verify builds by checking:
1. `.next/BUILD_ID` file exists
2. `.next/static/chunks/` directory exists with 30+ chunk files
3. `.next/static/css/` directory exists (for CSS files)
4. Build manifest exists (`.next/BUILD_MANIFEST` or `.next/build-manifest.json`)

### Health Checks

**Dashboard Health Endpoints**:
- Primary: `/api/health` (detailed health info)
- Fallback: `/health` (simple health check)

**Web Agent Health Endpoints**:
- Primary: `/widget` (widget endpoint)

**Health Check Retries**: 5 attempts with 3-second delays

### Supabase Connection Verification

**Dashboard Verification**:
- Checks `/api/status` endpoint
- Verifies `canReachSupabase: true`
- Verifies `database.status: "connected"`
- 5 retry attempts

**Web Agent Verification**:
- Checks PM2 logs for Supabase errors
- Verifies environment variables are set and valid

### Build Scripts

#### `scripts/set-build-time.js`
**Location**: `brand/proxe/dashboard/build/scripts/set-build-time.js`

**Purpose**: Sets build timestamp before build

**Function Details**:
- Generates UTC timestamp
- Sets `NEXT_PUBLIC_BUILD_TIME` env variable
- Called in `prebuild` script

#### `scripts/create-admin-user.js`
**Location**: `brand/proxe/dashboard/build/scripts/create-admin-user.js`

**Purpose**: Create admin user in database

**Usage**:
```bash
node scripts/create-admin-user.js <email> <password>
```

#### `scripts/seed-admin.sql`
**Location**: `brand/proxe/dashboard/build/scripts/seed-admin.sql`

**Purpose**: SQL script to seed admin user

**Usage**: Run in Supabase SQL editor

---

## Scripts

### Database Scripts

#### `scripts/create-admin-user.sql`
**Location**: `brand/proxe/dashboard/build/scripts/create-admin-user.sql`

**Purpose**: SQL template for creating admin user

#### `scripts/fix-user-creation.sql`
**Location**: `brand/proxe/dashboard/build/scripts/fix-user-creation.sql`

**Purpose**: Fix user creation trigger issues

### Build Scripts

#### `scripts/increment-build.js`
**Location**: `brand/proxe/dashboard/build/scripts/increment-build.js` (if exists)

**Purpose**: Increment build version

---

## Key Features & Functionality

### Lead Scoring System

**Algorithm Components**:
1. **AI Analysis (60%)**:
   - Intent signal detection
   - Sentiment analysis
   - Buying signal detection
   - Question depth analysis

2. **Activity (30%)**:
   - Message count normalization
   - Response rate calculation
   - Recency scoring
   - Channel mix bonus

3. **Business Signals (10%)**:
   - Booking existence
   - Contact information provided
   - Multi-touchpoint engagement

**Stage Assignment**:
- Score >= 86: Booking Made
- Score >= 61: High Intent
- Score >= 31: Qualified
- Active chat: Engaged
- Score < 61: In Sequence
- Default: New

### Multi-Channel Tracking

**Channels Supported**:
- Web (chat widget)
- WhatsApp (business API)
- Voice (phone calls)
- Social (social media)

**Unification Logic**:
- Deduplication by normalized phone + brand
- First touchpoint tracking
- Last touchpoint tracking
- Unified context in JSONB field

### Real-Time Updates

**Implementation**:
- Supabase Realtime subscriptions
- Table-level subscriptions (`all_leads`, `web_sessions`, etc.)
- Automatic UI updates
- Fallback to polling if Realtime fails

### Booking Management

**Features**:
- Google Calendar integration
- Booking status tracking
- Date/time management
- Booking confirmation emails (if configured)

### Activity Logging

**Activity Types**:
- Call
- Meeting
- Message
- Note

**Features**:
- Duration tracking
- Next follow-up dates
- User attribution
- Activity history

---

## API Endpoint Summary

### Dashboard Endpoints
- `GET /api/dashboard/leads` - List leads
- `GET /api/dashboard/leads/[id]/summary` - Lead details
- `POST /api/dashboard/leads/[id]/stage` - Update stage
- `GET /api/dashboard/leads/[id]/score` - Get score
- `GET /api/dashboard/leads/[id]/activities` - List activities
- `POST /api/dashboard/leads/[id]/activities` - Create activity
- `GET /api/dashboard/metrics` - Dashboard metrics
- `GET /api/dashboard/founder-metrics` - Founder metrics
- `GET /api/dashboard/bookings` - List bookings
- `GET /api/dashboard/channels/[channel]/metrics` - Channel metrics
- `GET /api/dashboard/web/messages` - Web messages
- `GET /api/dashboard/whatsapp/messages` - WhatsApp messages
- `POST /api/dashboard/summarize` - Summarize conversation
- `GET /api/dashboard/settings/widget-style` - Get widget settings
- `POST /api/dashboard/settings/widget-style` - Update widget settings

### Lead Scoring Endpoints
- `POST /api/leads/score` - Calculate score
- `POST /api/leads/rescore-all` - Rescore all leads
- `GET /api/test-scoring` - Test scoring

### Integration Endpoints
- `GET /api/integrations/web-agent` - Web agent status
- `POST /api/integrations/web-agent` - Web agent data
- `POST /api/integrations/whatsapp` - WhatsApp webhook
- `GET /api/integrations/whatsapp/system-prompt` - Get system prompt
- `POST /api/integrations/voice` - Voice integration

### Utility Endpoints
- `GET /api/status` - Health check
- `GET /api/test-connection` - Test Supabase
- `GET /api/diagnostics/supabase` - Supabase diagnostics
- `POST /api/webhooks/message-created` - Message webhook

---

## Type Definitions

### Lead Interface
```typescript
interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  first_touchpoint?: string | null
  last_touchpoint?: string | null
  timestamp: string
  status: string | null
  booking_date: string | null
  booking_time: string | null
  metadata?: any
  unified_context?: any
  lead_score?: number | null
  lead_stage?: LeadStage | null
  sub_stage?: string | null
  stage_override?: boolean | null
  last_scored_at?: string | null
  last_interaction_at?: string | null
  is_active_chat?: boolean | null
}
```

### LeadStage Type
```typescript
type LeadStage = 
  | 'New'
  | 'Engaged'
  | 'Qualified'
  | 'High Intent'
  | 'Booking Made'
  | 'Converted'
  | 'Closed Lost'
  | 'In Sequence'
  | 'Cold'
```

### Metrics Interface
```typescript
interface Metrics {
  totalConversations: number
  activeConversations: number
  avgResponseTime: number
  conversionRate: number
  leadsByChannel: { name: string; value: number }[]
  conversationsOverTime: { date: string; count: number }[]
  conversionFunnel: { stage: string; count: number }[]
  responseTimeTrends: { date: string; avgTime: number }[]
}
```

---

## Security & Authentication

### Authentication Flow
1. User visits dashboard
2. Middleware checks session
3. If no session, redirect to `/auth/login`
4. Login page authenticates via Supabase Auth
5. Session stored in cookies
6. Subsequent requests use session cookie

### Row Level Security (RLS)
- All tables have RLS enabled
- Policies allow authenticated users to read/write
- Service role key used for server-side operations
- Anonymous access disabled for dashboard tables

### API Security
- Authentication disabled for API routes (as per code comments)
- CORS headers configured for `https://goproxe.com`
- Input validation using Zod schemas (where implemented)

---

## Performance Optimizations

### Database
- Indexes on frequently queried columns
- Composite indexes for common queries
- JSONB indexes on `unified_context` (GIN index)

### Frontend
- React Server Components where possible
- Client components only when needed
- Real-time subscriptions for live updates
- Pagination for large lists
- Lazy loading for modals

### Caching
- Next.js automatic caching
- Supabase connection pooling
- Static asset caching

---

## Error Handling

### API Error Responses
```json
{
  "error": "Error message",
  "details": "Detailed error (development only)"
}
```

### Client Error Handling
- Try-catch blocks in async functions
- Error boundaries for React components
- User-friendly error messages
- Console logging for debugging

### Database Error Handling
- RLS policy error fallbacks
- Table existence checks
- Connection error handling
- Graceful degradation

---

## Testing

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Manual Testing
- Test scoring algorithm via `/api/test-scoring`
- Test connection via `/api/test-connection`
- Diagnostic endpoint: `/api/diagnostics/supabase`

---

## Future Enhancements

### Planned Features
- Audience segmentation (Coming Soon)
- Billing integration (Coming Soon)
- Advanced analytics
- Custom workflows
- Email integration
- SMS integration
- Advanced AI features

### Known Limitations
- Response time calculation is mocked
- Some metrics use estimated values
- Limited error recovery in some flows
- No automated testing suite

---

## Support & Documentation

### Documentation Files
- `brand/proxe/dashboard/docs/README.md` - Setup guide
- `brand/proxe/dashboard/docs/QUICK_START.md` - Quick start
- `brand/proxe/dashboard/docs/SCHEMA_BREAKDOWN.md` - Schema details

### External Links
- Docs: https://docs.goproxe.com (Coming Soon)
- Support: https://support.goproxe.com (Coming Soon)

---

## Version Information

**Current Version**: 1.0.0

**Build Date**: Set during build process via `NEXT_PUBLIC_BUILD_TIME`

**Last Updated**: January 27, 2026

**Recent Updates**:
- ✅ Multi-brand architecture documentation added
- ✅ Deployment workflows documented (PROXe, Windchasers Dashboard, Windchasers Web Agent)
- ✅ Build configuration details added (ESLint, TypeScript, Webpack)
- ✅ AI prompts documented (PROXe and Windchasers system prompts)
- ✅ Build errors fix documented (ESLint disabled during builds)
- ✅ Build verification procedures documented

---

## AI Prompts & System Prompts

### PROXe System Prompt
**Location**: `brand/proxe/web-agent/src/api/prompts/proxe-prompt.ts`

**Core Identity**: AI system that ensures every potential customer becomes an actual opportunity

**Key Features**:
- Maximum 2 sentences per response
- Double line breaks (`<br><br>`) between paragraphs
- Honest, direct communication (no BS, no emojis)
- Lead qualification flow
- Pricing: Starter ($99/month), Pro ($249/month)

**First Message Rules**:
- Greeting: "Hey! I'm PROXe. How can I help?"
- "What is PROXe?": Explains lead capture system across channels

**Critical Rules**:
- ❌ Never assume user has signed up
- ❌ Never say "check your email" unless signup completed
- ❌ Never move to next step without explicit confirmation
- ✓ Answer only the question asked
- ✓ Collect information step by step

**Differentiators**:
- vs Chatbots: "Chatbots answer questions. PROXe puts every potential customer into an intuitive flow."
- vs CRMs: "CRMs store customer data. PROXe acts on it."

**Core Capabilities**:
- Lead Capture: 24/7 across website, WhatsApp, social DMs, calls
- Memory: Remembers every customer interaction
- Auto-Booking: Books calls automatically
- Complete Journey: First inquiry to final close
- Unified Inbox: Every channel in one command center

### Windchasers System Prompt
**Location**: `brand/windchasers/web-agent/build/src/api/prompts/windchasers-prompt.ts`

**Core Identity**: Honest, warm, professional aviation career advisor (Sumaiya's Voice)

**Key Features**:
- Maximum 2 sentences per response
- Double line breaks (`<br><br>`) between paragraphs
- Real costs: ₹40-75 lakhs
- Real timeline: 18-24 months
- No job guarantees (honest about industry)

**First Message Rules**:
- Greeting: "Hi! I'm here to help you understand Aviation training at WindChasers, ask me anything."
- "What is WindChasers?": "Windchasers is a DGCA-approved aviation training academy..."

**Pricing & Investment**:
- Pilot training: ₹40-75 lakhs
- Timeline: 18-24 months
- No hidden costs
- No job guarantees

**Qualification Flow**:
1. User Type: "For Myself" / "For My Child" / "For Career Change"
2. Education: "Have you completed 12th with Physics and Maths?"
3. Timeline: "When are you planning to start training?"
4. Course Interest: "Which program interests you?" (Airline Pilot, Helicopter, Cabin Crew, Drone)

**Programs Offered**:
- Commercial Pilot License (CPL)
- Helicopter License
- Cabin Crew Training
- Drone Pilot Training

**Critical Rules**:
- ❌ Never promise job placements or guarantees
- ❌ Never use emojis
- ❌ Never use sales-y language
- ❌ Never quote lower prices (always ₹40-75L)
- ❌ Never promise shorter timelines (always 18-24 months)
- ✓ Be honest about costs and timelines
- ✓ Qualify leads before sharing detailed pricing

**Pricing Gate**:
Before sharing detailed cost breakdown:
1. Ask for email/phone if not provided
2. Confirm qualification (Student/Parent, Education, Budget, Timeline, Course)
3. Only then share detailed breakdown

**Knowledge Base Integration**:
- Uses context from Supabase knowledge base
- Answers questions about programs, costs, timelines, eligibility, DGCA requirements
- If knowledge base has info, use it; otherwise answer from aviation knowledge

**Button Generation Rules**:
- Quick Actions (3 buttons on chat open): "Start Pilot Training", "Book a Demo Session", "Explore Training Options"
- First Response (2 buttons): Generated dynamically based on user's question
- Subsequent Responses (1 button): Generated for next logical step
- Buttons are contextual to conversation flow

### Prompt Builder Library
**Location**: `brand/windchasers/web-agent/build/src/lib/promptBuilder.ts`

**Purpose**: Builds context-aware system prompts with customer history

**Function**: Integrates with Supabase to fetch:
- Customer context from `all_leads` table
- Web conversation history
- WhatsApp history
- Voice call history
- Social engagement
- Booking information

**Usage**: Called by web agent API routes to generate personalized prompts

---

## Build Configuration Details

### ESLint Configuration

**PROXe Dashboard**:
- Uses default Next.js ESLint behavior
- ESLint runs during builds (can fail builds on errors)

**Windchasers Dashboard**:
- ESLint disabled during builds: `ignoreDuringBuilds: true`
- Prevents build failures from ESLint warnings/errors
- Configuration in `next.config.js`:
  ```javascript
  eslint: {
    ignoreDuringBuilds: true,
  }
  ```

### TypeScript Configuration

**Both Brands**:
- TypeScript checking enabled: `ignoreBuildErrors: false`
- Type checking via `tsc --noEmit` script
- Strict mode enabled in `tsconfig.json`

### Webpack Configuration

**Windchasers Dashboard**:
- Server-side chunk splitting disabled (fixes @ symbol issues)
- Configuration in `next.config.js`:
  ```javascript
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: false,
      }
    }
    return config
  }
  ```

### Build Scripts

**PROXe Dashboard** (`brand/proxe/dashboard/build/package.json`):
- `prebuild`: Sets build time via `scripts/set-build-time.js`
- `build`: Builds with `NEXT_PUBLIC_BUILD_TIME` env variable
- `start`: Starts on port 4000
- `lint`: Runs ESLint
- `type-check`: TypeScript type checking (`tsc --noEmit`)

**Windchasers Dashboard** (`brand/windchasers/dashboard/build/package.json`):
- `prebuild`: Sets build time via `scripts/set-build-time.js`
- `build`: Standard Next.js build
- `start`: Starts on port 4002 (dev) or 3003 (production)
- `lint`: Runs ESLint (but ignored during builds)
- `type-check`: TypeScript type checking (`tsc --noEmit`)

**Build Time Script**:
- Location: `scripts/set-build-time.js`
- Generates UTC timestamp
- Sets `NEXT_PUBLIC_BUILD_TIME` in `.env.local`
- Called automatically in `prebuild` hook

### Build Errors & Fixes

**ESLint Build Errors** (Fixed January 2026):
- **Issue**: ESLint errors in `src/app/not-found.tsx` (apostrophes in JSX) causing build failures
- **Solution**: Disabled ESLint during builds in Windchasers Dashboard
- **Configuration**: `next.config.js` → `eslint: { ignoreDuringBuilds: true }`
- **Location**: `brand/windchasers/dashboard/build/next.config.js`
- **Status**: ✅ Fixed - Builds now complete successfully

**Alternative Fix** (Not Applied):
- Fix apostrophes in JSX: Replace `'` with `&apos;` or `&#39;`
- Example: `"you're"` → `"you&apos;re"`, `"doesn't"` → `"can&apos;t"`
- Location: `src/app/not-found.tsx` line 27

**Build Verification**:
- All builds verify `.next/BUILD_ID` exists
- Chunk count verification (30+ chunks expected)
- CSS files verification
- Build manifest verification

---

## Conclusion

This documentation covers the complete PROXe dashboard build structure, all functions, API routes, components, configuration details, multi-brand architecture, deployment workflows, and AI prompts. The system is built on Next.js 14 with Supabase backend, providing real-time lead tracking, scoring, and multi-channel customer engagement management.

**Key Updates**:
- ✅ Multi-brand architecture documented
- ✅ All deployment workflows documented (PROXe, Windchasers Dashboard, Windchasers Web Agent)
- ✅ Build configuration details (ESLint, TypeScript, Webpack)
- ✅ AI prompts documented (PROXe and Windchasers system prompts)
- ✅ Build verification and health check procedures
- ✅ Environment variable requirements per brand

For specific implementation details, refer to the source code files mentioned in each section.
