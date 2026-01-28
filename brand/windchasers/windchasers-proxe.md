# Windchasers Build Documentation - Complete Structure & Function Details

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
11. [Windchasers-Specific Features](#windchasers-specific-features)

---

## Build Structure

### Directory Layout
```
brand/windchasers/
├── dashboard/
│   └── build/                    # Next.js Dashboard Application
│       ├── src/
│       │   ├── app/              # Next.js App Router
│       │   │   ├── api/         # API Routes
│       │   │   ├── auth/        # Authentication pages
│       │   │   ├── dashboard/   # Dashboard pages
│       │   │   └── widget/      # Widget embed page
│       │   ├── components/      # React components
│       │   ├── hooks/           # Custom React hooks
│       │   ├── lib/             # Utility libraries
│       │   ├── services/        # External service integrations
│       │   └── types/           # TypeScript type definitions
│       ├── public/              # Static assets
│       ├── scripts/             # Build & setup scripts
│       ├── package.json         # Dependencies
│       ├── next.config.js       # Next.js configuration
│       └── middleware.ts       # Next.js middleware
│
└── web-agent/
    └── build/                    # Next.js Web Agent Application
        ├── src/
        │   ├── app/              # Next.js App Router
        │   ├── components/       # React components
        │   ├── hooks/            # Custom React hooks
        │   ├── lib/              # Utility libraries
        │   ├── configs/          # Brand configuration
        │   └── styles/           # Theme styles
        └── package.json
```

---

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 14.2.33 (App Router)
- **Language**: TypeScript 5.3.3
- **UI**: React 18.3.0, Tailwind CSS 3.4.1
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime
- **AI**: Anthropic Claude SDK (@anthropic-ai/sdk 0.71.0)
- **Charts**: Recharts 2.10.3
- **Icons**: React Icons 4.12.0
- **Calendar**: Google Calendar API (googleapis 164.1.0)
- **Concurrency**: concurrently 9.2.1 (for dev scripts)

### Key Features
- Multi-channel lead tracking (Web, WhatsApp, Voice, Social)
- Real-time lead updates via Supabase Realtime
- Automatic lead scoring (0-100 scale)
- Lead stage management
- Unified customer context across channels
- **Google Calendar integration** for booking management
- **Widget embed system** for easy website integration
- **Error logging system** for monitoring
- **Build info tracking** for deployment monitoring
- **Aviation-specific data fields** in unified_context

### Port Configuration
- **Dashboard**: Port 4002 (dev), Port 3003 (production)
- **Web Agent**: Port 3001 (production)
- **Concurrent Dev**: Runs both dashboard and web-agent simultaneously

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
- `brand` (TEXT) - DEFAULT 'windchasers', CHECK: 'windchasers'
- `unified_context` (JSONB) - Stores aviation-specific data (see below)
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

### Aviation-Specific Fields in `unified_context`
The `unified_context` JSONB field stores Windchasers-specific aviation data:

```json
{
  "windchasers": {
    "user_type": "student" | "parent" | "professional",
    "city": "string",
    "course_interest": "DGCA" | "Flight" | "Heli" | "Cabin" | "Drone",
    "training_type": "online" | "offline" | "hybrid",
    "class_12_science": boolean,
    "plan_to_fly": "asap" | "1-3mo" | "6+mo" | "1yr+",
    "budget_awareness": "aware" | "exploring" | "unaware",
    "dgca_completed": boolean,
    "button_clicks": {...}  // Tracks UI interactions
  },
  "web": {
    "conversation_summary": "string"
  }
}
```

### Channel-Specific Tables

**1. `web_sessions`** - Web chat interactions
- References `all_leads(id)`
- Stores: booking info, conversation summary, message count, session status
- Brand: DEFAULT 'windchasers'

**2. `whatsapp_sessions`** - WhatsApp conversations
- References `all_leads(id)`
- Stores: WhatsApp IDs, sentiment, response times
- Brand: DEFAULT 'windchasers'

**3. `voice_sessions`** - Voice call interactions
- References `all_leads(id)`
- Stores: call duration, transcription, recording URL
- Brand: DEFAULT 'windchasers'

**4. `social_sessions`** - Social media engagements
- References `all_leads(id)`
- Stores: platform, engagement type, sentiment
- Brand: DEFAULT 'windchasers'

**5. `conversations`** - Universal message log (renamed from `messages`)
- References `all_leads(id)`
- Stores: channel, sender ('customer', 'agent', 'system'), content, metadata

### Supporting Tables

**1. `lead_stage_changes`** - Logs all stage transitions
- `lead_id`, `old_stage`, `new_stage`, `old_score`, `new_score`, `changed_by`, `is_automatic`, `change_reason`

**2. `lead_stage_overrides`** - Tracks manual stage overrides
- `lead_id`, `overridden_stage`, `overridden_by`, `override_reason`, `is_active`

**3. `activities`** - Team-logged activities
- `lead_id`, `activity_type`, `activity_subtype`, `note`, `duration_minutes`, `next_follow_up_date`, `created_by`

**4. `dashboard_users`** - Dashboard user accounts
- Extends Supabase auth.users
- Roles: 'admin', 'viewer'

**5. `dashboard_settings`** - Dashboard configuration
- Key-value pairs stored as JSONB

### Views

**`unified_leads`** - Aggregated view combining:
- Base lead info from `all_leads`
- Web data from `web_sessions`
- WhatsApp data from `whatsapp_sessions`
- Voice data from `voice_sessions`
- Social data from `social_sessions`
- Lead scoring fields (`lead_score`, `lead_stage`, etc.)
- Aviation-specific data from `unified_context`

---

## API Routes & Functions

### Dashboard API Routes

#### `/api/dashboard/leads` (GET)
**Purpose**: Fetch paginated leads with filtering

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 100)
- `source` (string) - Filter by touchpoint
- `status` (string) - Filter by status
- `startDate` (string) - Filter by start date
- `endDate` (string) - Filter by end date

**Response**: Paginated leads with metadata

#### `/api/dashboard/leads/[id]/summary` (GET)
**Purpose**: Get detailed summary for a specific lead

**Function Details**:
- Fetches lead from `all_leads` table
- Includes channel-specific data
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

**Response**: Standard metrics (totalConversations, activeConversations, conversionRate, etc.)

#### `/api/dashboard/founder-metrics` (GET)
**Purpose**: Get comprehensive founder-level metrics

**Query Parameters**:
- `hotLeadThreshold` (number, default: 70) - Score threshold for "hot leads"

**Features**:
- **30-second caching** for performance
- Aggregates data from all channel tables
- Calculates booking metrics
- Provides conversation trends
- Includes lead scoring statistics
- Hot leads calculation
- Stale leads detection (48+ hours inactive)

**Response**:
```json
{
  "totalLeads": 1000,
  "hotLeads": 150,
  "staleLeads": 50,
  "totalBookings": 200,
  "conversations": {...},
  "bookings": {...},
  "leadScoring": {...},
  "trends": {...}
}
```

#### `/api/dashboard/bookings` (GET)
**Purpose**: Get all bookings

**Function Details**:
- Queries `web_sessions` and other channel tables for booking data
- Filters by `booking_status`
- Returns booking date, time, and customer info

#### `/api/dashboard/channels/[channel]/metrics` (GET)
**Purpose**: Get channel-specific metrics

**Parameters**: `channel` - 'web', 'whatsapp', 'voice', 'social'

#### `/api/dashboard/web/messages` (GET)
**Purpose**: Get messages from web channel

**Query Parameters**:
- `lead_id` (UUID) - Filter by lead
- `limit` (number) - Limit results

#### `/api/dashboard/whatsapp/messages` (GET)
**Purpose**: Get messages from WhatsApp channel

#### `/api/dashboard/summarize` (POST)
**Purpose**: Generate conversation summary using AI

**Request Body**:
```json
{
  "lead_id": "uuid",
  "channel": "web"
}
```

#### `/api/dashboard/settings/widget-style` (GET, POST)
**Purpose**: Get/update widget styling settings

### Calendar API Routes

#### `/api/calendar/availability` (POST)
**Purpose**: Check available time slots for a date

**Request Body**:
```json
{
  "date": "2026-01-30T00:00:00Z"
}
```

**Response**:
```json
{
  "date": "2026-01-30",
  "availability": {
    "11:00": true,
    "13:00": false,
    "15:00": true,
    ...
  },
  "slots": [
    {
      "time": "11:00 AM",
      "time24": "11:00",
      "available": true,
      "displayTime": "11:00 AM"
    },
    ...
  ]
}
```

**Function Details**:
- Connects to Google Calendar API
- Checks for conflicting events
- Returns available time slots
- Default slots: 11:00, 13:00, 15:00, 16:00, 17:00, 18:00 (IST)
- Timezone: Asia/Kolkata (UTC+5:30)
- Falls back to showing all slots as available if credentials not configured

**Environment Variables**:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Service account private key
- `GOOGLE_CALENDAR_ID` - Calendar ID (default: 'bconclubx@gmail.com')
- `GOOGLE_CALENDAR_TIMEZONE` - Timezone (default: 'Asia/Kolkata')

#### `/api/calendar/events` (GET, POST)
**Purpose**: List/create calendar events

**GET Query Parameters**:
- `startDate` (string) - Start date filter
- `endDate` (string) - End date filter
- `maxResults` (number, default: 250) - Max events to return

**POST Request Body**:
```json
{
  "summary": "Windchasers Demo - John Doe",
  "description": "Demo booking details",
  "start": "2026-01-30T11:00:00+05:30",
  "end": "2026-01-30T12:00:00+05:30",
  "attendees": [
    {
      "email": "customer@example.com",
      "displayName": "John Doe"
    }
  ]
}
```

**Function Details**:
- Creates/updates events in Google Calendar
- Handles timezone conversion
- Returns event details including HTML link

#### `/api/calendar/sync` (POST)
**Purpose**: Sync bookings from database to Google Calendar

**Function Details**:
- Fetches all bookings from `unified_leads` with booking_date/time
- Creates events in Google Calendar for bookings without `google_event_id`
- Updates existing events if booking details changed
- Syncs next 6 months of bookings
- Returns sync summary (created, updated, errors)

**Response**:
```json
{
  "success": true,
  "synced": 50,
  "created": 10,
  "updated": 5,
  "errors": []
}
```

### Widget API Routes

#### `/api/widget/embed.js` (GET)
**Purpose**: Returns embeddable JavaScript for widget

**Response**: JavaScript code that initializes the widget

**Function Details**:
- Generates widget initialization script
- Creates iframe container
- Sets up message passing
- Exports widget API (`window.WindchasersWidget`)
- Widget API methods: `open()`, `close()`, `toggle()`

**Embed Code**:
```html
<script src="https://proxe.windchasers.in/widget/embed.js"></script>
```

**Widget Configuration**:
- API URL: `${baseUrl}/api/chat`
- Brand: 'windchasers'
- Colors: Gold/Brown/Cream palette
- Quick buttons: ['Start Pilot Training', 'Book a Demo Session', 'Explore Training Options']
- Explore buttons: ['Pilot Training', 'Helicopter Training', 'Drone Training', 'Cabin Crew']

### Status & Health API Routes

#### `/api/status` (GET)
**Purpose**: System status check

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-27T10:00:00Z",
  "database": "connected",
  "webAgent": "online",
  "whatsappAgent": "online"
}
```

**Function Details**:
- Checks database connection
- Checks web agent endpoint
- Checks WhatsApp agent endpoint
- Returns overall system health

#### `/api/health` (GET)
**Purpose**: Build health check

**Response**:
```json
{
  "status": "healthy",
  "checks": {
    "buildDirectoryExists": true,
    "chunksDirectoryExists": true,
    "buildIdExists": true,
    "buildId": "abc123",
    "chunkCount": 50
  }
}
```

**Function Details**:
- Verifies build directory exists
- Checks for static chunks
- Validates BUILD_ID file
- Counts JavaScript chunks
- Returns 503 if build appears incomplete

#### `/api/status/error-logs` (GET)
**Purpose**: Get error logs

**Query Parameters**:
- `component` (string) - Filter by component
- `limit` (number, default: 10) - Max logs to return

**Response**:
```json
{
  "logs": [
    {
      "timestamp": "2026-01-27T10:00:00Z",
      "component": "dashboard",
      "message": "Error message",
      "details": "Error details"
    }
  ],
  "count": 1
}
```

**Function Details**:
- Uses in-memory error logger
- Returns last N logs for component
- Sorted by timestamp (newest first)

### Build Info API Routes

#### `/api/build-info` (GET)
**Purpose**: Get build information

**Response**:
```json
{
  "version": "1.0.0",
  "buildTimestamp": "2026-01-27T10:00:00Z",
  "buildDate": "Jan 27, 2026, 10:00 AM IST"
}
```

**Function Details**:
- Reads version from `package.json`
- Reads build timestamp from `.build-info` file
- Formats date in IST timezone
- Returns defaults if files not found

### Lead Scoring API Routes

#### `/api/leads/score` (POST)
**Purpose**: Calculate and update lead score

**Request Body**:
```json
{
  "lead_id": "uuid"
}
```

#### `/api/leads/rescore-all` (POST)
**Purpose**: Recalculate scores for all leads

### Integration API Routes

#### `/api/integrations/web-agent` (GET, POST)
**Purpose**: Web agent integration endpoint

#### `/api/integrations/whatsapp` (POST)
**Purpose**: WhatsApp webhook handler

#### `/api/integrations/whatsapp/system-prompt` (GET)
**Purpose**: Get context-aware system prompt for WhatsApp

**Query Parameters**:
- `phone` (string) - Customer phone number

#### `/api/integrations/voice` (POST)
**Purpose**: Voice call integration endpoint

### Webhook Routes

#### `/api/webhooks/message-created` (POST)
**Purpose**: Handle message creation webhooks

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
- Status (`/dashboard/status`) - Windchasers-specific

#### `FounderDashboard`
**Location**: `src/components/dashboard/FounderDashboard.tsx`

**Purpose**: Main dashboard overview page

**Features**:
- Real-time metrics display
- Channel-specific metrics
- Conversation trends
- Lead scoring statistics
- Booking calendar view
- Hot leads display
- Stale leads warning

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
- Aviation-specific fields display

#### `LeadStageSelector`
**Location**: `src/components/dashboard/LeadStageSelector.tsx`

**Purpose**: Stage selection dropdown

**Stages**: Same as PROXe (New, Engaged, Qualified, High Intent, Booking Made, Converted, Closed Lost, In Sequence, Cold)

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

#### `ErrorLogsModal`
**Location**: `src/components/dashboard/ErrorLogsModal.tsx`

**Purpose**: Display error logs for monitoring

**Features**:
- Component-specific error logs
- Timestamp formatting
- Error details display
- Last 10 errors shown
- Refresh capability

**Props**:
- `isOpen` (boolean)
- `onClose` (function)
- `component` (string) - Component name to filter logs

#### `WebAgentSettingsClient`
**Location**: `src/app/dashboard/settings/web-agent/WebAgentSettingsClient.tsx`

**Purpose**: Web agent widget settings and preview

**Features**:
- Widget preview in iframe
- Embed code display
- Reset widget button (clears localStorage)
- Code panel toggle
- Widget URL configuration

**Function Details**:
- Auto-loads widget preview on mount
- Determines widget URL from environment or defaults
- Clears localStorage keys: `windchasers-*`, `chat-*`, `session-*`, `*widget*`, `*chat*`
- Reloads iframe to reset widget state

#### `BookingsCalendar`
**Location**: `src/components/dashboard/BookingsCalendar.tsx`

**Purpose**: Calendar view for bookings

**Features**:
- Monthly calendar view
- Booking display
- Click to view details
- Filter by status
- Google Calendar integration

#### `CalendarView`
**Location**: `src/components/dashboard/CalendarView.tsx`

**Purpose**: Alternative calendar visualization

#### `ActivityLoggerModal`
**Location**: `src/components/dashboard/ActivityLoggerModal.tsx`

**Purpose**: Log activities for leads

#### `WebMetrics`
**Location**: `src/components/dashboard/WebMetrics.tsx`

**Purpose**: Web channel-specific metrics

#### `WhatsAppMetrics`
**Location**: `src/components/dashboard/WhatsAppMetrics.tsx`

**Purpose**: WhatsApp channel-specific metrics

#### `MicroCharts`
**Location**: `src/components/dashboard/MicroCharts.tsx`

**Purpose**: Small chart components for dashboard

#### `ThemeProvider`
**Location**: `src/components/dashboard/ThemeProvider.tsx`

**Purpose**: Theme context provider

#### `LoadingOverlay`
**Location**: `src/components/dashboard/LoadingOverlay.tsx`

**Purpose**: Loading state overlay

#### `PageTransitionLoader`
**Location**: `src/components/PageTransitionLoader.tsx`

**Purpose**: Page transition loading indicator

---

## Libraries & Utilities

### Lead Scoring Library

#### `leadScoreCalculator.ts`
**Location**: `src/lib/leadScoreCalculator.ts`

**Exports**:
- `calculateLeadScore(leadData: Lead): Promise<CalculatedScore>`

**Scoring Algorithm**: Same as PROXe

**1. AI Analysis (60% weight)**:
- Intent Signals (40%)
- Sentiment Analysis (30%)
- Buying Signals (30%)

**2. Activity Score (30% weight)**:
- Message Count
- Response Rate
- Recency
- Channel Mix Bonus

**3. Business Signals (10% weight)**:
- Booking exists: +10 points
- Email/phone provided: +5 points
- Multi-touchpoint: +5 points

### Error Logger Library

#### `errorLogger.ts`
**Location**: `src/lib/errorLogger.ts`

**Exports**:
- `errorLogger` (singleton instance)

**Class Methods**:
- `log(component: string, message: string, details?: string)` - Log an error
- `getLogs(component?: string, limit?: number): ErrorLog[]` - Get error logs
- `getLastError(component: string): ErrorLog | null` - Get last error for component
- `clear()` - Clear all logs

**Features**:
- In-memory storage (max 100 logs)
- Component filtering
- Timestamp sorting (newest first)
- Auto-pruning when limit exceeded

**Interface**:
```typescript
interface ErrorLog {
  timestamp: string
  component: string
  message: string
  details?: string
}
```

### Supabase Client Library

#### `client.ts`
**Location**: `src/lib/supabase/client.ts`

**Exports**:
- `createClient()` - Creates Supabase client for client-side use

#### `server.ts`
**Location**: `src/lib/supabase/server.ts`

**Exports**:
- `createClient()` - Creates Supabase client for server-side use

#### `middleware.ts`
**Location**: `src/lib/supabase/middleware.ts`

**Exports**:
- `updateSession(request: NextRequest)` - Updates session in middleware

### Utility Functions

#### `utils.ts`
**Location**: `src/lib/utils.ts`

**Exports**:
- `cn(...inputs: ClassValue[])` - Merges Tailwind classes
- `formatDate(date: string | Date): string` - Formats date
- `formatDateTime(date: string | Date): string` - Formats date and time
- `formatTime(date: string | Date): string` - Formats time

### Build Info Library

#### `buildInfo.ts`
**Location**: `src/lib/buildInfo.ts`

**Exports**:
- `BUILD_TIME` - Build timestamp (from env)
- `getBuildDate(): string` - Formatted build date in IST

**Function Details**:
- Reads `NEXT_PUBLIC_BUILD_TIME` env variable
- Formats date in IST timezone (Asia/Kolkata)
- Used in dashboard footer

### Claude Service

#### `claudeService.js`
**Location**: `src/services/claudeService.js`

**Exports**: Same as PROXe
- `fetchCustomerContext()`
- `buildSystemPrompt()`
- `getWhatsAppSystemPrompt()`
- `extractTopics()`
- `formatBookingDate()`

**Windchasers-Specific**:
- Uses Windchasers brand context
- Includes aviation-specific conversation history
- References course interests (DGCA, Flight, Heli, Cabin, Drone)

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

**Function Details**: Same as PROXe
- Subscribes to `all_leads` table changes
- Falls back to `unified_leads` if RLS blocks access
- Handles Windchasers brand filtering

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

---

## Configuration

### Next.js Configuration

#### `next.config.js`
**Location**: `brand/windchasers/dashboard/build/next.config.js`

**Configuration**:
- React Strict Mode: Enabled
- CORS headers: `*` (allows all origins)
- Cache headers for static assets
- Webpack configuration to fix vendor chunk issues with `@` symbols
- Disables server-side chunk splitting

**Key Features**:
- Static chunks caching (1 year, immutable)
- CSS files content-type headers
- Font files caching
- Webpack optimization for server-side

### TypeScript Configuration

#### `tsconfig.json`
**Location**: `brand/windchasers/dashboard/build/tsconfig.json`

**Settings**: Standard Next.js TypeScript config

### Tailwind Configuration

#### `tailwind.config.ts`
**Location**: `brand/windchasers/dashboard/build/tailwind.config.ts`

**Configuration**: Standard Tailwind config with Windchasers theme

### Package Configuration

#### `package.json`
**Location**: `brand/windchasers/dashboard/build/package.json`

**Scripts**:
- `dev`: Runs dashboard and web-agent concurrently
- `dev:dashboard`: Start dashboard dev server on port 4002
- `dev:web-agent`: Start web-agent dev server
- `prebuild`: Set build time
- `build`: Build for production
- `start`: Start production server on port 4002
- `lint`: Run ESLint
- `type-check`: TypeScript type checking

**Key Dependencies**:
- `next`: ^14.2.33
- `react`: ^18.3.0
- `@supabase/supabase-js`: ^2.39.0
- `@supabase/ssr`: ^0.1.0
- `@anthropic-ai/sdk`: ^0.71.0
- `googleapis`: ^164.1.0 (Google Calendar integration)
- `recharts`: ^2.10.3
- `concurrently`: ^9.2.1 (for dev scripts)

### Environment Variables

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (Windchasers)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (Windchasers)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side)
- `NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL` - Windchasers-specific Supabase URL
- `NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY` - Windchasers-specific anon key
- `ANTHROPIC_API_KEY` - Claude API key (for AI features)

**Google Calendar** (Optional):
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Service account private key
- `GOOGLE_CALENDAR_ID` - Calendar ID (default: 'bconclubx@gmail.com')
- `GOOGLE_CALENDAR_TIMEZONE` - Timezone (default: 'Asia/Kolkata')

**Widget** (Optional):
- `NEXT_PUBLIC_WEB_AGENT_URL` - Web agent URL for widget
- `NEXT_PUBLIC_APP_URL` - App base URL

**Optional**:
- `PORT` - Server port (default: 4002 for dashboard, 3001 for web-agent)
- `NODE_ENV` - Environment (development/production)
- `NEXT_PUBLIC_BUILD_TIME` - Build timestamp (set during build)

### Brand Configuration

#### `brand.config.ts` (Web Agent)
**Location**: `brand/windchasers/web-agent/build/src/configs/brand.config.ts`

**Configuration**:
- Brand name: 'Windchasers'
- Brand identifier: 'windchasers'
- Colors: Gold/Brown/Cream palette
  - Primary: #C9A961 (Gold)
  - Primary Light: #E8D5B7 (Cream)
  - Primary Dark: #1A0F0A (Dark Brown)
  - Primary Vibrant: #D4AF37 (Vibrant Gold)
- Quick buttons: ['Start Pilot Training', 'Book a Demo Session', 'Explore Training Options']
- Explore buttons: ['Pilot Training', 'Helicopter Training', 'Drone Training', 'Cabin Crew']
- Avatar: Image (`/windchasers-icon.png`)

---

## Deployment

### PM2 Configuration

#### `ecosystem.config.js`
**Location**: `brand/windchasers/dashboard/build/ecosystem.config.js`

**Configuration**:
- **Dashboard App**:
  - Name: `windchasers-dashboard`
  - Port: 3003
  - Working Directory: `/var/www/windchasers-proxe`
  - Max Memory: 1GB
  - Logs: `/var/www/windchasers-proxe/logs/`

- **Web Agent App**:
  - Name: `windchasers-web-agent`
  - Port: 3001
  - Working Directory: `/var/www/windchasers-web-agent`
  - Max Memory: 1GB
  - Logs: `/var/www/windchasers-web-agent/logs/`

**Usage**:
```bash
pm2 start ecosystem.config.js    # Start both apps
pm2 restart ecosystem.config.js   # Restart both apps
pm2 stop ecosystem.config.js     # Stop both apps
pm2 logs windchasers-dashboard   # View dashboard logs
pm2 logs windchasers-web-agent   # View web-agent logs
```

### GitHub Actions

#### `.github/workflows/deploy-dashboard.yml`
**Location**: `brand/windchasers/dashboard/build/.github/workflows/deploy-dashboard.yml`

**Function Details**:
- Triggers on push to main branch
- Builds Next.js app
- Deploys to server
- Sets build time environment variable

### Build Scripts

#### `scripts/set-build-time.js`
**Location**: `brand/windchasers/dashboard/build/scripts/set-build-time.js`

**Purpose**: Sets build timestamp before build

#### `scripts/create-admin-user.js`
**Location**: `brand/windchasers/dashboard/build/scripts/create-admin-user.js`

**Purpose**: Create admin user in database

#### `scripts/create-windchasers-user.sql`
**Location**: `brand/windchasers/dashboard/build/scripts/create-windchasers-user.sql`

**Purpose**: SQL script to create Windchasers-specific user

#### `scripts/increment-build.js`
**Location**: `brand/windchasers/dashboard/build/scripts/increment-build.js`

**Purpose**: Increment build version

---

## Windchasers-Specific Features

### Aviation-Specific Data Fields

**Stored in `unified_context.windchasers`**:
- `user_type`: "student" | "parent" | "professional"
- `city`: Location string
- `course_interest`: "DGCA" | "Flight" | "Heli" | "Cabin" | "Drone"
- `training_type`: "online" | "offline" | "hybrid"
- `class_12_science`: boolean
- `plan_to_fly`: "asap" | "1-3mo" | "6+mo" | "1yr+"
- `budget_awareness`: "aware" | "exploring" | "unaware"
- `dgca_completed`: boolean
- `button_clicks`: Object tracking UI interactions

### Google Calendar Integration

**Features**:
- Check availability for specific dates
- Create calendar events for bookings
- Sync bookings from database to calendar
- Timezone handling (Asia/Kolkata)
- Default time slots: 11:00, 13:00, 15:00, 16:00, 17:00, 18:00 IST

**API Endpoints**:
- `/api/calendar/availability` - Check available slots
- `/api/calendar/events` - List/create events
- `/api/calendar/sync` - Sync bookings to calendar

### Widget Embed System

**Features**:
- Standalone JavaScript embed
- Iframe-based widget loading
- Message passing between parent and widget
- Programmatic control API
- Auto-initialization
- Prevents multiple initializations

**Embed Code**:
```html
<script src="https://proxe.windchasers.in/widget/embed.js"></script>
```

**Widget API**:
```javascript
window.WindchasersWidget.open()    // Open widget
window.WindchasersWidget.close()   // Close widget
window.WindchasersWidget.toggle()  // Toggle widget
```

### Error Logging System

**Features**:
- In-memory error storage
- Component-based filtering
- Timestamp tracking
- Auto-pruning (max 100 logs)
- API endpoint for retrieval
- Modal component for display

**Usage**:
```typescript
import { errorLogger } from '@/lib/errorLogger'

errorLogger.log('component-name', 'Error message', 'Error details')
const logs = errorLogger.getLogs('component-name', 10)
```

### Build Info Tracking

**Features**:
- Build timestamp tracking
- Version information
- IST timezone formatting
- API endpoint for retrieval
- Display in dashboard footer

**API**: `/api/build-info`

### Health Check System

**Features**:
- Build directory verification
- Chunk count validation
- BUILD_ID verification
- Status endpoint
- Returns 503 if build incomplete

**API**: `/api/health`

### Concurrent Development

**Features**:
- Runs dashboard and web-agent simultaneously
- Color-coded console output
- Separate port management
- Single command to start both

**Command**: `npm run dev`

### Web Agent Settings Page

**Features**:
- Widget preview in iframe
- Embed code display
- Reset widget functionality
- Code panel toggle
- Widget URL configuration

**Location**: `/dashboard/settings/web-agent`

### Status Page

**Features**:
- System health monitoring
- Component status checks
- Error log viewing
- Database connection status
- Agent status (web, WhatsApp)

**Location**: `/dashboard/status`

---

## Differences from PROXe

### 1. Brand Configuration
- All defaults set to 'windchasers' instead of 'proxe'
- Windchasers-specific Supabase environment variables
- Different color scheme (Gold/Brown/Cream)

### 2. Google Calendar Integration
- Full calendar API integration
- Availability checking
- Booking sync to calendar
- Timezone handling (IST)

### 3. Widget Embed System
- Standalone embed script
- Iframe-based loading
- Programmatic API
- Widget settings page

### 4. Error Logging
- In-memory error logger
- Component-based filtering
- Error logs modal component
- API endpoint for retrieval

### 5. Build Health Checks
- Build directory verification
- Chunk validation
- Health endpoint
- Status monitoring

### 6. Concurrent Development
- Runs dashboard and web-agent together
- Color-coded output
- Single dev command

### 7. Aviation-Specific Fields
- Course interests (DGCA, Flight, Heli, Cabin, Drone)
- Training types
- User types (student, parent, professional)
- DGCA completion tracking

### 8. Port Configuration
- Dashboard: 4002 (dev), 3003 (production)
- Web Agent: 3001 (production)
- Different from PROXe (4000)

### 9. Next.js Configuration
- Webpack optimization for `@` symbols
- Disabled server-side chunk splitting
- Enhanced caching headers
- CORS allows all origins

### 10. Additional API Routes
- `/api/build-info` - Build information
- `/api/health` - Build health check
- `/api/status/error-logs` - Error logs retrieval
- `/api/calendar/*` - Calendar integration
- `/api/widget/embed.js` - Widget embed script

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
- `GET /api/dashboard/founder-metrics` - Founder metrics (with caching)
- `GET /api/dashboard/bookings` - List bookings
- `GET /api/dashboard/channels/[channel]/metrics` - Channel metrics
- `GET /api/dashboard/web/messages` - Web messages
- `GET /api/dashboard/whatsapp/messages` - WhatsApp messages
- `POST /api/dashboard/summarize` - Summarize conversation
- `GET /api/dashboard/settings/widget-style` - Get widget settings
- `POST /api/dashboard/settings/widget-style` - Update widget settings

### Calendar Endpoints
- `POST /api/calendar/availability` - Check available slots
- `GET /api/calendar/events` - List events
- `POST /api/calendar/events` - Create event
- `POST /api/calendar/sync` - Sync bookings to calendar

### Widget Endpoints
- `GET /api/widget/embed.js` - Widget embed script
- `GET /widget` - Widget page

### Status & Health Endpoints
- `GET /api/status` - System status
- `GET /api/health` - Build health check
- `GET /api/status/error-logs` - Error logs
- `GET /api/build-info` - Build information

### Lead Scoring Endpoints
- `POST /api/leads/score` - Calculate score
- `POST /api/leads/rescore-all` - Rescore all leads

### Integration Endpoints
- `GET /api/integrations/web-agent` - Web agent status
- `POST /api/integrations/web-agent` - Web agent data
- `POST /api/integrations/whatsapp` - WhatsApp webhook
- `GET /api/integrations/whatsapp/system-prompt` - Get system prompt
- `POST /api/integrations/voice` - Voice integration

### Utility Endpoints
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
  unified_context?: {
    windchasers?: {
      user_type?: string
      city?: string
      course_interest?: string
      training_type?: string
      class_12_science?: boolean
      plan_to_fly?: string
      budget_awareness?: string
      dgca_completed?: boolean
      button_clicks?: any
    }
    web?: any
    whatsapp?: any
    voice?: any
    social?: any
  }
  lead_score?: number | null
  lead_stage?: LeadStage | null
  sub_stage?: string | null
  stage_override?: boolean | null
  last_scored_at?: string | null
  last_interaction_at?: string | null
  is_active_chat?: boolean | null
}
```

### ErrorLog Interface
```typescript
interface ErrorLog {
  timestamp: string
  component: string
  message: string
  details?: string
}
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
- Same as PROXe
- Supabase Auth with session cookies
- Middleware session updates

### Row Level Security (RLS)
- All tables have RLS enabled
- Policies allow authenticated users
- Service role key for server-side operations

### API Security
- CORS configured for all origins (`*`)
- Authentication disabled for API routes (as per code comments)
- Input validation using Zod schemas

---

## Performance Optimizations

### Database
- Indexes on frequently queried columns
- Composite indexes for common queries
- JSONB indexes on `unified_context` (GIN index)

### Frontend
- React Server Components
- Client components only when needed
- Real-time subscriptions
- Pagination for large lists
- **30-second caching** for founder metrics

### Caching
- Next.js automatic caching
- Supabase connection pooling
- Static asset caching (1 year)
- In-memory metrics cache

---

## Error Handling

### API Error Responses
```json
{
  "error": "Error message",
  "details": "Detailed error (development only)"
}
```

### Error Logging
- In-memory storage
- Component-based filtering
- Timestamp tracking
- Auto-pruning

### Client Error Handling
- Try-catch blocks
- Error boundaries
- User-friendly messages
- Console logging

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
- Health check: `/api/health`
- Status check: `/api/status`
- Build info: `/api/build-info`
- Error logs: `/api/status/error-logs`

---

## Future Enhancements

### Planned Features
- Audience segmentation (Coming Soon)
- Advanced analytics
- Custom workflows
- Email integration
- SMS integration
- Advanced AI features

### Known Limitations
- Error logger is in-memory (not persistent)
- Some metrics use estimated values
- Limited error recovery in some flows
- No automated testing suite

---

## Support & Documentation

### Documentation Files
- `brand/windchasers/web-agent/docs/README.md` - Web agent setup
- `brand/windchasers/web-agent/docs/DATABASE_VERIFICATION.md` - Database verification

### External Links
- Website: https://windchasers.in
- Widget URL: https://proxe.windchasers.in
- Web Agent URL: https://widget.proxe.windchasers.in

---

## Version Information

**Current Version**: 1.0.0

**Build Date**: Set during build process via `NEXT_PUBLIC_BUILD_TIME`

**Last Updated**: January 2026

---

## Lead Scoring Triggers & Automation

### Database Triggers (Automatic)

#### 1. **Conversations Table Trigger** - Primary Automation
**Location**: `brand/windchasers/dashboard/supabase/migrations/019_rename_messages_to_conversations.sql`

**Trigger Name**: `trigger_conversations_update_score`

**Function**: `trigger_update_lead_score()`

**When It Fires**:
- **AFTER INSERT** on `conversations` table
- **FOR EACH ROW** (every new message)

**What It Does**:
```sql
CREATE TRIGGER trigger_conversations_update_score
  AFTER INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_lead_score();
```

**Trigger Function Logic**:
```sql
CREATE OR REPLACE FUNCTION trigger_update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Update score when messages are added
  -- Use NULL for user_uuid since triggers don't have user context
  PERFORM update_lead_score_and_stage(NEW.lead_id, NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Flow**:
1. New message inserted into `conversations` table
2. Trigger fires automatically
3. Calls `update_lead_score_and_stage(lead_id, NULL)`
4. Function calculates new score using `calculate_lead_score(lead_id)`
5. Determines new stage using `determine_lead_stage(score, is_active_chat, has_booking)`
6. Updates `all_leads` table with new score and stage
7. Logs stage change to `lead_stage_changes` (if stage changed and user_uuid provided)

**Conditions**:
- Only fires when `lead_id IS NOT NULL` (from migration 017)
- Skips logging to `lead_stage_changes` if `user_uuid` is NULL (automatic trigger)
- Respects `stage_override` flag - won't change stage if manually overridden

#### 2. **Stage History Trigger** (if exists)
**Purpose**: Logs stage changes automatically

**When It Fires**: When `lead_stage` column is updated in `all_leads`

**Note**: This trigger may be implemented in some migrations but the primary automation is the conversations trigger above.

### API Endpoints That Trigger Scoring

#### 1. **`POST /api/webhooks/message-created`**
**Purpose**: Webhook handler for external message creation

**Flow**:
1. Receives webhook with `lead_id` and `message_id`
2. Calls `/api/dashboard/leads/[id]/score` endpoint
3. Triggers score recalculation

**Code**:
```typescript
// Calls scoring endpoint
const scoreResponse = await fetch(`${appUrl}/api/dashboard/leads/${lead_id}/score`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
})
```

**When Used**:
- External systems creating messages
- Webhook integrations
- Manual message creation via API

#### 2. **`POST /api/dashboard/leads/[id]/score`**
**Purpose**: Manual score calculation trigger

**Flow**:
1. Receives `lead_id` in request body
2. Calls PostgreSQL function: `update_lead_score_and_stage(lead_uuid, user_uuid)`
3. Returns updated score and stage

**Code**:
```typescript
const { data, error } = await supabase.rpc('update_lead_score_and_stage', {
  lead_uuid: leadId,
  user_uuid: user.id
})
```

**When Used**:
- Manual score recalculation from dashboard
- Webhook handlers
- Scheduled jobs

#### 3. **`POST /api/leads/score`**
**Purpose**: Alternative scoring endpoint with AI analysis

**Flow**:
1. Fetches lead data and conversation messages
2. Calls Claude API for AI-based scoring (if API key available)
3. Falls back to rule-based scoring if AI fails
4. Updates lead score and stage directly
5. Logs to `stage_history`

**Features**:
- AI-powered scoring using Claude
- Fallback rule-based scoring
- Respects manual override flag
- Auto-assigns stage based on score

**When Used**:
- Manual scoring requests
- External integrations
- Testing scoring algorithm

#### 4. **`PATCH /api/dashboard/leads/[id]/stage`** (with auto-recalc)
**Purpose**: Update lead stage, optionally recalculate score

**Flow**:
1. Updates lead stage manually
2. If override removed (DELETE method), automatically calls:
   ```typescript
   await supabase.rpc('update_lead_score_and_stage', {
     lead_uuid: leadId,
     user_uuid: user.id
   })
   ```

**When Used**:
- Manual stage updates from dashboard
- Removing stage override (triggers recalculation)

### Scheduled Automation

#### 1. **`POST /api/leads/rescore-all`** - Batch Rescoring Job
**Purpose**: Rescore all active leads (should be called daily via cron)

**Flow**:
1. Requires authorization header: `Bearer ${CRON_SECRET}`
2. Fetches all active leads (not converted/closed_lost)
3. Processes leads in batches of 10
4. Skips leads with `is_manual_override = true`
5. Calls scoring endpoint for each lead
6. Updates `days_inactive` for all leads in batches of 50

**Code**:
```typescript
// Process in batches
const batchSize = 10
for (let i = 0; i < leads.length; i += batchSize) {
  const batch = leads.slice(i, i + batchSize)
  await Promise.all(
    batch.map(async (lead) => {
      if (lead.is_manual_override) return
      await fetch(`${appUrl}/api/leads/score`, {
        method: 'POST',
        body: JSON.stringify({ lead_id: lead.id }),
      })
    })
  )
  await new Promise(resolve => setTimeout(resolve, 1000)) // Delay between batches
}
```

**When Used**:
- Daily cron job
- Manual batch rescoring
- After algorithm changes

**Setup** (Example cron):
```bash
# Run daily at 2 AM
0 2 * * * curl -X POST https://proxe.windchasers.in/api/leads/rescore-all \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

**Environment Variable**:
- `CRON_SECRET` - Secret key for authorization (default: 'your-secret-key')

### Database Functions Called by Triggers

#### 1. **`calculate_lead_score(lead_uuid UUID)`**
**Purpose**: Calculate lead score (0-100)

**Algorithm**:
- **AI Analysis (60%)**:
  - Engagement Quality (20%): Based on message count
  - Intent Signals (20%): Keyword matching in conversation summary
  - Question Depth (20%): Based on message count and unified_context
- **Activity (30%)**:
  - Response Rate: Based on days inactive (0 days = 1.0, 7 days = 0.4, etc.)
  - Touchpoints: Count of sessions across channels
  - Inactivity Penalty: Days inactive / 7
- **Business (10%)**:
  - Booking exists: +50 points
  - Re-engaged: +20 points (if inactive > 7 days and has messages)

**Returns**: INTEGER (0-100)

#### 2. **`determine_lead_stage(score INTEGER, is_active_chat BOOLEAN, has_booking BOOLEAN)`**
**Purpose**: Determine lead stage based on score

**Logic**:
- `has_booking = TRUE` → 'Booking Made'
- `score >= 86` → 'Booking Made'
- `score >= 61` → 'High Intent'
- `score >= 31` → 'Qualified'
- `is_active_chat = TRUE` → 'Engaged'
- `score < 61` → 'In Sequence'
- Default → 'New'

**Returns**: TEXT (stage name)

#### 3. **`update_lead_score_and_stage(lead_uuid UUID, user_uuid UUID DEFAULT NULL)`**
**Purpose**: Main function that updates score and stage

**Flow**:
1. Gets current lead state (stage, score, override flag, booking status)
2. Calculates new score using `calculate_lead_score()`
3. Determines new stage using `determine_lead_stage()` (if no override)
4. Updates `all_leads` table:
   - `lead_score` = new_score
   - `lead_stage` = new_stage (if not overridden)
   - `last_scored_at` = NOW()
5. Logs stage change to `lead_stage_changes` (if changed and user_uuid provided)

**Returns**: JSONB with old/new score and stage

**Respects**:
- `stage_override` flag - keeps current stage if overridden
- `is_manual_override` flag - same as above

### Manual Override Behavior

**When Manual Override is Active**:
- `stage_override = TRUE` OR `is_manual_override = TRUE`
- Score still calculates and updates
- **Stage does NOT change** - remains at manually set stage
- Override persists until manually removed

**Removing Override**:
- DELETE `/api/dashboard/leads/[id]/stage`
- Sets `stage_override = FALSE` and `is_manual_override = FALSE`
- **Automatically triggers** `update_lead_score_and_stage()` to recalculate stage

### Complete Automation Flow

#### Scenario 1: New Message Arrives
```
1. Message inserted into conversations table
   ↓
2. Database trigger fires (trigger_conversations_update_score)
   ↓
3. Calls trigger_update_lead_score() function
   ↓
4. Calls update_lead_score_and_stage(lead_id, NULL)
   ↓
5. Calls calculate_lead_score(lead_id)
   ↓
6. Calculates score based on:
   - Message count
   - Conversation summary
   - Touchpoints
   - Booking status
   - Days inactive
   ↓
7. Calls determine_lead_stage(score, is_active_chat, has_booking)
   ↓
8. Updates all_leads table:
   - lead_score = new_score
   - lead_stage = new_stage (if not overridden)
   - last_scored_at = NOW()
   ↓
9. Real-time update propagates to dashboard via Supabase Realtime
```

#### Scenario 2: Webhook Message Created
```
1. External system sends webhook to /api/webhooks/message-created
   ↓
2. Webhook handler calls /api/dashboard/leads/[id]/score
   ↓
3. API calls update_lead_score_and_stage() PostgreSQL function
   ↓
4. Same flow as Scenario 1 (steps 4-9)
```

#### Scenario 3: Daily Batch Rescore
```
1. Cron job calls POST /api/leads/rescore-all
   ↓
2. Validates CRON_SECRET authorization
   ↓
3. Fetches all active leads (not converted/closed_lost)
   ↓
4. Processes in batches of 10
   ↓
5. For each lead (skipping manual overrides):
   - Calls /api/leads/score endpoint
   - Updates score and stage
   ↓
6. Bulk updates days_inactive for all leads
   ↓
7. Returns summary (processed, errors, total)
```

### Trigger Configuration Details

#### Trigger Conditions
- **Table**: `conversations`
- **Event**: `AFTER INSERT`
- **Condition**: `WHEN (NEW.lead_id IS NOT NULL)` (from migration 017)
- **Execution**: `FOR EACH ROW`

#### Function Permissions
```sql
GRANT EXECUTE ON FUNCTION calculate_lead_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION determine_lead_stage(INTEGER, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION update_lead_score_and_stage(UUID, UUID) TO authenticated;
```

### Performance Considerations

**Batch Processing**:
- Rescore-all processes in batches of 10 leads
- 1 second delay between batches
- Prevents database overload

**Caching**:
- Founder metrics endpoint has 30-second cache
- Reduces database load for dashboard views

**Indexes**:
- `idx_all_leads_lead_score` - For sorting by score
- `idx_all_leads_lead_stage` - For filtering by stage
- `idx_conversations_lead_id` - For fetching messages per lead
- `idx_conversations_created_at` - For time-based queries

### Monitoring & Debugging

**Check Trigger Status**:
```sql
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'conversations';
```

**Check Function Existence**:
```sql
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname IN ('calculate_lead_score', 'update_lead_score_and_stage', 'trigger_update_lead_score');
```

**View Recent Score Updates**:
```sql
SELECT * FROM lead_stage_changes 
ORDER BY created_at DESC 
LIMIT 20;
```

**Check Manual Overrides**:
```sql
SELECT id, customer_name, lead_stage, stage_override, is_manual_override
FROM all_leads
WHERE stage_override = TRUE OR is_manual_override = TRUE;
```

### Summary

**Automatic Triggers**:
1. ✅ **Database trigger** on `conversations` table INSERT
2. ✅ **Webhook handler** calls scoring endpoint
3. ✅ **Stage override removal** triggers recalculation

**Manual Triggers**:
1. ✅ **API endpoint** `/api/dashboard/leads/[id]/score`
2. ✅ **API endpoint** `/api/leads/score` (with AI)
3. ✅ **Batch rescore** `/api/leads/rescore-all` (for cron)

**Scheduled Automation**:
1. ✅ **Daily batch rescore** (via cron job)
2. ✅ **Days inactive calculation** (during batch rescore)

**Key Points**:
- Scoring happens automatically when messages are inserted
- Manual overrides prevent automatic stage changes
- Batch rescore runs daily to keep scores current
- All scoring respects override flags
- Real-time updates propagate to dashboard via Supabase Realtime

---

## Conclusion

This documentation covers the complete Windchasers build structure, all functions, API routes, components, and configuration details. The system is built on Next.js 14 with Supabase backend, providing real-time lead tracking, scoring, multi-channel customer engagement management, Google Calendar integration, widget embed system, and aviation-specific features for Windchasers Aviation Academy.

Key differentiators from PROXe:
- Google Calendar integration
- Widget embed system
- Error logging system
- Build health checks
- Aviation-specific data fields
- Concurrent development setup
- Enhanced caching and performance optimizations
- **Automatic lead scoring via database triggers**

For specific implementation details, refer to the source code files mentioned in each section.
