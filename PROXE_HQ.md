# PROXe Command Center - Complete Dashboard Structure

## Overview

The PROXe Command Center is a Next.js 14 application built with the App Router, providing a comprehensive dashboard for managing leads, bookings, and metrics across multiple channels (Web, WhatsApp, Voice, Social).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App Router                        │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React/TypeScript)                                │
│  ├── Pages (Server Components)                             │
│  ├── Components (Client Components)                         │
│  ├── Hooks (Custom React Hooks)                            │
│  └── API Routes (Server Actions)                           │
├─────────────────────────────────────────────────────────────┤
│  Backend (Supabase)                                         │
│  ├── Database (PostgreSQL)                                 │
│  ├── Authentication (Supabase Auth)                         │
│  ├── Realtime (Supabase Realtime)                           │
│  └── Row Level Security (RLS)                              │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
Command Center/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── api/                      # API routes
│   │   │   ├── dashboard/           # Dashboard API endpoints
│   │   │   │   ├── leads/           # Leads management
│   │   │   │   ├── bookings/        # Bookings management
│   │   │   │   ├── metrics/         # Metrics aggregation
│   │   │   │   └── channels/        # Channel-specific APIs
│   │   │   ├── integrations/        # External webhook endpoints
│   │   │   │   ├── web-agent/       # Web PROXe webhook
│   │   │   │   ├── whatsapp/        # WhatsApp webhook
│   │   │   │   └── voice/           # Voice webhook
│   │   │   └── auth/                # Authentication APIs
│   │   ├── dashboard/               # Dashboard pages
│   │   │   ├── page.tsx             # Overview page
│   │   │   ├── leads/               # Leads page
│   │   │   ├── bookings/            # Bookings page
│   │   │   ├── metrics/             # Metrics page
│   │   │   ├── channels/            # Channel pages
│   │   │   │   ├── web/             # Web PROXe channel
│   │   │   │   ├── whatsapp/       # WhatsApp channel
│   │   │   │   ├── voice/           # Voice channel
│   │   │   │   └── social/          # Social channel
│   │   │   ├── settings/            # Settings page
│   │   │   └── layout.tsx           # Dashboard layout wrapper
│   │   └── auth/                    # Authentication pages
│   ├── components/                   # React components
│   │   └── dashboard/                # Dashboard components
│   │       ├── DashboardLayout.tsx  # Main layout with sidebar
│   │       ├── MetricsDashboard.tsx # Metrics cards and charts
│   │       ├── LeadsTable.tsx       # Leads table with filters
│   │       ├── BookingsCalendar.tsx # Bookings calendar view
│   │       ├── ChannelMetrics.tsx   # Channel-specific metrics
│   │       └── LeadDetailsModal.tsx # Lead details modal
│   ├── hooks/                        # Custom React hooks
│   │   ├── useRealtimeLeads.ts      # Real-time leads subscription
│   │   └── useRealtimeMetrics.ts    # Real-time metrics subscription
│   ├── lib/                          # Utility libraries
│   │   ├── supabase/                # Supabase clients
│   │   │   ├── client.ts            # Client-side Supabase
│   │   │   ├── server.ts            # Server-side Supabase
│   │   │   └── middleware.ts        # Auth middleware
│   │   └── utils.ts                  # Utility functions
│   └── types/                        # TypeScript types
│       ├── database.types.ts        # Database schema types
│       └── index.ts                 # Common types
├── supabase/
│   └── migrations/                   # Database migrations
│       ├── 001_dashboard_schema.sql
│       ├── 007_rename_sessions_to_all_leads.sql
│       ├── 008_update_unified_leads_view.sql
│       └── 009_fix_unified_leads_view_rls.sql
└── public/                           # Static assets
```

## Pages & Routes

### Main Dashboard Pages

#### `/dashboard` (Overview)
**File**: `src/app/dashboard/page.tsx`
- **Purpose**: Main dashboard overview
- **Components**:
  - `MetricsDashboard` - Key metrics cards
  - Channel cards (Web, WhatsApp, Voice, Social)
  - Quick access to all channels
- **Features**:
  - Total conversations count
  - Active conversations (24h)
  - Conversion rate
  - Average response time
  - Channel overview cards

#### `/dashboard/leads`
**File**: `src/app/dashboard/leads/page.tsx`
- **Purpose**: Leads management page
- **Components**:
  - `LeadsTable` - Full leads table with filters
- **Features**:
  - View all leads
  - Filter by date, source, status
  - Export to CSV
  - Real-time updates
  - Lead details modal

#### `/dashboard/bookings`
**File**: `src/app/dashboard/bookings/page.tsx`
- **Purpose**: Bookings calendar view
- **Components**:
  - `BookingsCalendar` - Calendar with bookings
- **Features**:
  - View scheduled bookings
  - Filter by date range
  - Booking details (name, email, phone, time)

#### `/dashboard/metrics`
**File**: `src/app/dashboard/metrics/page.tsx`
- **Purpose**: Detailed metrics and analytics
- **Components**:
  - `MetricsDashboard` (detailed mode)
- **Features**:
  - Key metrics cards
  - Conversations over time chart
  - Leads by source chart
  - Conversion funnel
  - Response time trends

### Channel Pages

#### `/dashboard/channels/web`
**File**: `src/app/dashboard/channels/web/page.tsx`
- **Purpose**: Web PROXe channel dashboard
- **Components**:
  - `ChannelMetrics` - Web-specific metrics
  - `LeadsTable` - Web leads filtered
- **Features**:
  - Web channel metrics
  - Web leads table
  - Booking status tracking

#### `/dashboard/channels/whatsapp`
**File**: `src/app/dashboard/channels/whatsapp/page.tsx`
- **Purpose**: WhatsApp channel dashboard
- **Components**:
  - `ChannelMetrics` - WhatsApp-specific metrics
  - `LeadsTable` - WhatsApp leads filtered

#### `/dashboard/channels/voice`
**File**: `src/app/dashboard/channels/voice/page.tsx`
- **Purpose**: Voice channel dashboard
- **Components**:
  - `ChannelMetrics` - Voice-specific metrics
  - `LeadsTable` - Voice leads filtered

#### `/dashboard/channels/social`
**File**: `src/app/dashboard/channels/social/page.tsx`
- **Purpose**: Social channel dashboard
- **Components**:
  - `ChannelMetrics` - Social-specific metrics
  - `LeadsTable` - Social leads filtered

#### `/dashboard/settings`
**File**: `src/app/dashboard/settings/page.tsx`
- **Purpose**: Dashboard settings
- **Features**:
  - User preferences
  - Dashboard configuration

## Components

### DashboardLayout
**File**: `src/components/dashboard/DashboardLayout.tsx`
- **Type**: Client Component
- **Purpose**: Main layout wrapper with sidebar navigation
- **Features**:
  - Collapsible sidebar (mobile & desktop)
  - Navigation menu with Channels submenu
  - User menu with profile and logout
  - Dark mode toggle
  - Responsive design
- **Navigation Items**:
  - Dashboard (overview)
  - Leads
  - Bookings
  - Metrics
  - Channels (collapsible)
    - Web PROXe
    - WhatsApp PROXe
    - Voice PROXe
    - Social PROXe
  - Settings

### MetricsDashboard
**File**: `src/components/dashboard/MetricsDashboard.tsx`
- **Type**: Client Component
- **Purpose**: Display key metrics and charts
- **Props**:
  - `detailed?: boolean` - Show detailed charts
- **Features**:
  - 4 key metrics cards:
    - Total Conversations
    - Active Conversations (24h)
    - Conversion Rate
    - Average Response Time
  - Charts (when detailed):
    - Conversations over time (7 days)
    - Leads by source
    - Conversion funnel
    - Response time trends
- **Data Source**: `/api/dashboard/metrics`

### LeadsTable
**File**: `src/components/dashboard/LeadsTable.tsx`
- **Type**: Client Component
- **Purpose**: Display leads in a table with filtering
- **Props**:
  - `limit?: number` - Limit number of leads shown
  - `sourceFilter?: string` - Pre-filter by source channel
- **Features**:
  - Real-time updates via `useRealtimeLeads` hook
  - Filters:
    - Date range (today, week, month, all)
    - Source channel (web, whatsapp, voice, social, all)
    - Status (New Lead, Follow Up, RNR, Interested, Wrong Enquiry, Call Booked, Closed)
  - Export to CSV
  - Lead details modal
  - Status update functionality
  - Pagination support
- **Columns**:
  - Name
  - Email
  - Phone
  - Source (first_touchpoint)
  - Timestamp
  - Status
  - Actions

### BookingsCalendar
**File**: `src/components/dashboard/BookingsCalendar.tsx`
- **Type**: Client Component
- **Purpose**: Display bookings in calendar format
- **Features**:
  - Calendar view of bookings
  - Filter by date range
  - Booking details display
  - Real-time updates
- **Data Source**: `/api/dashboard/bookings`

### ChannelMetrics
**File**: `src/components/dashboard/ChannelMetrics.tsx`
- **Type**: Client Component
- **Purpose**: Channel-specific metrics display
- **Props**:
  - `channel: string` - Channel name (web, whatsapp, voice, social)
- **Features**:
  - Channel-specific metrics cards
  - Channel-specific charts
  - Real-time updates
- **Data Source**: `/api/dashboard/channels/[channel]/metrics`

### LeadDetailsModal
**File**: `src/components/dashboard/LeadDetailsModal.tsx`
- **Type**: Client Component
- **Purpose**: Modal showing detailed lead information
- **Props**:
  - `lead: Lead` - Lead data
  - `isOpen: boolean` - Modal open state
  - `onClose: () => void` - Close handler
- **Features**:
  - Lead details display
  - Status update
  - Booking information
  - Metadata display

## API Routes

### Dashboard APIs

#### `GET /api/dashboard/leads`
**File**: `src/app/api/dashboard/leads/route.ts`
- **Purpose**: Fetch leads with filtering and pagination
- **Authentication**: Required (authenticated user)
- **Query Parameters**:
  - `page?: number` - Page number (default: 1)
  - `limit?: number` - Items per page (default: 100)
  - `source?: string` - Filter by channel (web, whatsapp, voice, social)
  - `status?: string` - Filter by status
  - `startDate?: string` - Start date filter
  - `endDate?: string` - End date filter
- **Response**:
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
- **Data Source**: `unified_leads` view
- **Ordering**: `last_interaction_at DESC`

#### `PATCH /api/dashboard/leads/[id]/status`
**File**: `src/app/api/dashboard/leads/[id]/status/route.ts`
- **Purpose**: Update lead status
- **Authentication**: Required
- **Body**:
  ```json
  {
    "status": "New Lead" | "Follow Up" | "RNR (No Response)" | "Interested" | "Wrong Enquiry" | "Call Booked" | "Closed"
  }
  ```
- **Data Source**: Updates `sessions.status` column

#### `GET /api/dashboard/bookings`
**File**: `src/app/api/dashboard/bookings/route.ts`
- **Purpose**: Fetch scheduled bookings
- **Authentication**: Required
- **Query Parameters**:
  - `startDate?: string` - Start date filter
  - `endDate?: string` - End date filter
- **Response**:
  ```json
  {
    "bookings": [...]
  }
  ```
- **Data Source**: `unified_leads` view (filtered by booking_date, booking_time)
- **Ordering**: `booking_date ASC, booking_time ASC`

#### `GET /api/dashboard/metrics`
**File**: `src/app/api/dashboard/metrics/route.ts`
- **Purpose**: Get aggregated metrics
- **Authentication**: Required
- **Response**:
  ```json
  {
    "totalConversations": 1000,
    "activeConversations": 50,
    "avgResponseTime": 5,
    "conversionRate": 25,
    "leadsByChannel": [...],
    "conversationsOverTime": [...],
    "conversionFunnel": [...],
    "responseTimeTrends": [...]
  }
  ```
- **Data Source**: `unified_leads` view

#### `GET /api/dashboard/channels/[channel]/metrics`
**File**: `src/app/api/dashboard/channels/[channel]/metrics/route.ts`
- **Purpose**: Get channel-specific metrics
- **Authentication**: Required
- **Parameters**:
  - `channel`: `web` | `whatsapp` | `voice` | `social`
- **Response**:
  ```json
  {
    "totalConversations": 500,
    "activeConversations": 25,
    "avgResponseTime": 3,
    "conversionRate": 30,
    "conversationsOverTime": [...],
    "statusBreakdown": [...]
  }
  ```
- **Data Source**: Channel-specific tables (`web_sessions`, `whatsapp_sessions`, etc.)

### Integration APIs (Webhooks)

#### `POST /api/integrations/web-agent`
**File**: `src/app/api/integrations/web-agent/route.ts`
- **Purpose**: Web PROXe webhook endpoint
- **Authentication**: Service role key (bypasses RLS)
- **Request Body**:
  ```json
  {
    "name": "Customer Name",
    "phone": "+1234567890",
    "email": "customer@example.com",
    "brand": "proxe",
    "booking_status": "pending",
    "booking_date": "2024-01-15",
    "booking_time": "14:30:00",
    "external_session_id": "web_xyz789",
    "chat_session_id": "chat_abc123",
    "website_url": "https://example.com",
    "conversation_summary": "Customer inquiry",
    "user_inputs_summary": {},
    "message_count": 15,
    "last_message_at": "2024-01-15T14:30:00Z"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "lead_id": "uuid",
    "message": "Lead created successfully"
  }
  ```
- **Process**:
  1. Normalize phone number
  2. Check for existing lead in `all_leads`
  3. Create/update `all_leads`
  4. Create `web_sessions` record
  5. Insert into `messages` table

#### `GET /api/integrations/web-agent`
**File**: `src/app/api/integrations/web-agent/route.ts`
- **Purpose**: Fetch web leads (for dashboard)
- **Authentication**: Required
- **Response**: Array of leads from `unified_leads` view

#### `POST /api/integrations/whatsapp`
**File**: `src/app/api/integrations/whatsapp/route.ts`
- **Purpose**: WhatsApp webhook endpoint
- **Authentication**: API key verification
- **Process**: Similar to web-agent (creates `whatsapp_sessions`)

#### `POST /api/integrations/voice`
**File**: `src/app/api/integrations/voice/route.ts`
- **Purpose**: Voice webhook endpoint
- **Authentication**: API key verification
- **Process**: Similar to web-agent (creates `voice_sessions`)

## Custom Hooks

### useRealtimeLeads
**File**: `src/hooks/useRealtimeLeads.ts`
- **Purpose**: Real-time leads subscription
- **Returns**:
  ```typescript
  {
    leads: Lead[],
    loading: boolean,
    error: string | null
  }
  ```
- **Features**:
  - Initial fetch from `unified_leads` view
  - Real-time subscription to `all_leads` table
  - Automatic refetch on changes
  - Error handling with helpful messages
- **Data Ordering**: `last_interaction_at DESC`

### useRealtimeMetrics
**File**: `src/hooks/useRealtimeMetrics.ts`
- **Purpose**: Real-time metrics subscription
- **Returns**:
  ```typescript
  {
    metrics: Metrics,
    loading: boolean
  }
  ```
- **Features**:
  - Fetches metrics from `/api/dashboard/metrics`
  - Polling for updates (every 30 seconds)
  - Calculates derived metrics

## Database Schema

### Core Tables

#### `all_leads`
- **Purpose**: Minimal unifier - one record per unique customer
- **Key Columns**:
  - `id` (UUID, Primary Key)
  - `customer_name`, `email`, `phone`
  - `customer_phone_normalized` (for deduplication)
  - `first_touchpoint` (web, whatsapp, voice, social)
  - `last_touchpoint` (most recent channel)
  - `last_interaction_at`
  - `brand` (proxe)
  - `unified_context` (JSONB)
- **Deduplication**: `(customer_phone_normalized, brand)`

#### `web_sessions`
- **Purpose**: Self-contained Web PROXe session data
- **Key Columns**:
  - `id` (UUID, Primary Key)
  - `lead_id` (Foreign Key to `all_leads`)
  - `customer_name`, `customer_email`, `customer_phone`
  - `external_session_id`, `chat_session_id`
  - `booking_status`, `booking_date`, `booking_time`
  - `conversation_summary`, `user_inputs_summary`
  - `message_count`, `last_message_at`
  - `session_status` (active, completed, abandoned)
  - `channel_data` (JSONB)

#### `whatsapp_sessions`
- **Purpose**: Self-contained WhatsApp session data
- **Structure**: Similar to `web_sessions` with WhatsApp-specific fields

#### `voice_sessions`
- **Purpose**: Self-contained Voice session data
- **Structure**: Similar to `web_sessions` with voice-specific fields

#### `social_sessions`
- **Purpose**: Self-contained Social session data
- **Structure**: Similar to `web_sessions` with social-specific fields

#### `messages`
- **Purpose**: Universal append-only message log
- **Key Columns**:
  - `id` (UUID, Primary Key)
  - `lead_id` (Foreign Key to `all_leads`)
  - `channel` (web, whatsapp, voice, social)
  - `sender` (customer, agent, system)
  - `content`, `message_type`
  - `metadata` (JSONB)
  - `created_at`

### Views

#### `unified_leads`
- **Purpose**: Dashboard display view - aggregates all customer data
- **Columns**:
  - `id`, `name`, `email`, `phone`
  - `first_touchpoint`, `last_touchpoint`
  - `brand`, `timestamp`, `last_interaction_at`
  - `metadata` (JSONB with channel data)
- **Data Source**: `all_leads` + joins to channel tables
- **Ordering**: `last_interaction_at DESC`

## Data Flow

### Creating a Lead (Web PROXe Example)

```
1. Web PROXe System
   ↓ POST /api/integrations/web-agent
2. API Handler (web-agent/route.ts)
   ↓ Validate & Normalize
3. Check all_leads (phone + brand)
   ↓
4. [New] → Create all_leads (first_touchpoint='web')
   [Existing] → Update all_leads (last_touchpoint='web')
   ↓
5. Create web_sessions record
   ↓
6. Insert into messages table
   ↓
7. Supabase Realtime broadcasts change
   ↓
8. useRealtimeLeads hook receives update
   ↓
9. Dashboard UI updates automatically
```

### Querying Leads

```
1. Frontend Component
   ↓ Calls useRealtimeLeads hook
2. Hook fetches from unified_leads view
   ↓
3. Supabase returns aggregated data
   ↓
4. Component renders leads table
   ↓
5. Real-time subscription listens for changes
   ↓
6. On change → Refetch from unified_leads
   ↓
7. UI updates automatically
```

## Features

### Real-time Updates
- **Technology**: Supabase Realtime
- **Implementation**: 
  - Subscribes to `all_leads` table changes
  - Refetches from `unified_leads` view on updates
  - Automatic UI refresh
- **Fallback**: Polling if Realtime unavailable

### Filtering & Search
- **Date Filters**: Today, Week, Month, All
- **Source Filters**: Web, WhatsApp, Voice, Social, All
- **Status Filters**: All lead statuses
- **Pagination**: Server-side pagination support

### Export Functionality
- **Format**: CSV
- **Includes**: All visible columns
- **Filtered**: Respects current filters

### Dark Mode
- **Implementation**: Tailwind CSS dark mode
- **Storage**: localStorage
- **Default**: System preference
- **Toggle**: User menu

### Responsive Design
- **Mobile**: Collapsible sidebar, stacked layout
- **Tablet**: Adjusted grid layouts
- **Desktop**: Full sidebar, multi-column layouts

## Authentication & Security

### Authentication Flow
1. User visits dashboard page
2. Server checks authentication via `layout.tsx`
3. If not authenticated → Redirect to `/auth/login`
4. If authenticated → Render dashboard

### Row Level Security (RLS)
- **Tables**: All tables have RLS enabled
- **Policy**: Authenticated users can view all leads
- **Webhooks**: Use service role key (bypasses RLS)

### API Security
- **Dashboard APIs**: Require authenticated user
- **Webhook APIs**: Use service role key or API key verification
- **CORS**: Configured for allowed origins

## Styling

### Framework
- **CSS Framework**: Tailwind CSS
- **Theme**: Custom purple accent (`#5B1A8C`)
- **Dark Mode**: Full support with custom dark colors

### Color Palette
- **Primary**: Purple (`#5B1A8C`)
- **Background**: White / Dark (`#1A1A1A`)
- **Borders**: Gray (`#262626` in dark mode)
- **Text**: Gray scale with dark mode variants

### Icons
- **Library**: `react-icons/md` (Material Design icons)
- **Usage**: Navigation, metrics cards, channel cards

## Environment Variables

### Required
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Optional
```env
WHATSAPP_API_KEY=your-whatsapp-api-key
VOICE_API_KEY=your-voice-api-key
```

## Deployment

### Build Process
1. Install dependencies: `npm ci`
2. Build: `npm run build`
3. Start: `npm start`

### VPS Deployment
- **Process Manager**: PM2
- **Port**: 3001
- **CI/CD**: GitHub Actions
- **Workflow**: `.github/workflows/deploy-dashboard.yml`

## Key Design Principles

1. **Multi-Touchpoint Architecture**: Each channel is independent but linkable via `all_leads`
2. **Self-Contained Tables**: Channel tables contain all necessary data (no required joins)
3. **Real-time First**: All data updates in real-time via Supabase Realtime
4. **Type Safety**: Full TypeScript coverage
5. **Server Components**: Pages use Server Components for better performance
6. **Client Components**: Interactive components use Client Components
7. **Responsive**: Mobile-first responsive design
8. **Accessible**: Proper ARIA labels and keyboard navigation

## Future Enhancements

- [ ] Advanced search functionality
- [ ] Bulk actions on leads
- [ ] Custom dashboard widgets
- [ ] Email notifications
- [ ] Google Calendar integration
- [ ] Advanced reporting
- [ ] Lead notes and activity tracking
- [ ] Multi-user collaboration features

