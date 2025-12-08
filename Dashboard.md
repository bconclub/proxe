# PROXe Command Center - Complete Documentation

**This is the single source of truth for the PROXe Command Center Dashboard.**

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Setup & Installation](#setup--installation)
6. [Environment Variables](#environment-variables)
7. [Database Schema](#database-schema)
8. [API Routes](#api-routes)
9. [Components](#components)
10. [Custom Hooks](#custom-hooks)
11. [Data Flow](#data-flow)
12. [Build & Development](#build--development)
13. [Deployment](#deployment)
14. [Features](#features)
15. [Authentication & Security](#authentication--security)
16. [Styling & UI](#styling--ui)
17. [Troubleshooting](#troubleshooting)

---

## Overview

The PROXe Command Center is a Next.js 14 application built with the App Router, providing a comprehensive dashboard for managing leads, bookings, and metrics across multiple channels (Web, WhatsApp, Voice, Social).

### Key Features

- 🔐 **Authentication System** - Secure login with Supabase Auth
- 👥 **Leads Management** - Real-time leads dashboard with filtering and export
- 📅 **Bookings Calendar** - Interactive calendar view with weekly/monthly toggles
- 📈 **Metrics Dashboard** - Comprehensive analytics with charts and KPIs
- 🔄 **Real-time Updates** - Live data synchronization using Supabase Realtime
- 🔌 **API Integrations** - Webhooks for Web PROXe, WhatsApp, and Voice APIs
- 📱 **Mobile Responsive** - Fully responsive design for all devices

---

## Tech Stack

### Core Framework
- **Next.js 14.2.18** - React framework with App Router
- **React 18.3.0** - UI library
- **TypeScript 5.3.3** - Type safety

### Backend & Database
- **Supabase** - PostgreSQL database, authentication, and real-time subscriptions
  - `@supabase/supabase-js` ^2.39.0
  - `@supabase/ssr` ^0.1.0

### UI & Styling
- **Tailwind CSS 3.4.1** - Utility-first CSS framework
- **PostCSS 8.4.35** - CSS processing
- **Autoprefixer 10.4.17** - CSS vendor prefixing
- **react-icons 4.12.0** - Icon library (Material Design icons)

### Data Visualization
- **Recharts 2.10.3** - Chart library for metrics

### Utilities
- **date-fns 3.0.6** - Date manipulation and formatting
- **zod 3.22.4** - Schema validation
- **clsx 2.1.0** - Conditional class names
- **tailwind-merge 2.2.0** - Merge Tailwind classes

### Development Tools
- **ESLint 8.56.0** - Code linting
- **eslint-config-next 14.2.0** - Next.js ESLint config

### Node.js Requirements
- **Node.js 18+** required
- **npm** or **yarn** package manager

---

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
│  ├── Realtime (Supabase Realtime)                          │
│  └── Row Level Security (RLS)                              │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Multi-Touchpoint Architecture**: Each channel is independent but linkable via `all_leads`
2. **Self-Contained Tables**: Channel tables contain all necessary data (no required joins)
3. **Real-time First**: All data updates in real-time via Supabase Realtime
4. **Type Safety**: Full TypeScript coverage
5. **Server Components**: Pages use Server Components for better performance
6. **Client Components**: Interactive components use Client Components
7. **Responsive**: Mobile-first responsive design
8. **Accessible**: Proper ARIA labels and keyboard navigation

---

## Project Structure

```
Command Center/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── api/                      # API routes
│   │   │   ├── dashboard/           # Dashboard API endpoints
│   │   │   │   ├── leads/           # Leads management
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   └── status/  # Update lead status
│   │   │   │   │   └── route.ts     # GET leads
│   │   │   │   ├── bookings/        # Bookings management
│   │   │   │   │   └── route.ts     # GET bookings
│   │   │   │   ├── metrics/         # Metrics aggregation
│   │   │   │   │   └── route.ts     # GET metrics
│   │   │   │   └── channels/        # Channel-specific APIs
│   │   │   │       └── [channel]/
│   │   │   │           └── metrics/
│   │   │   │               └── route.ts
│   │   │   ├── integrations/        # External webhook endpoints
│   │   │   │   ├── web-agent/       # Web PROXe webhook
│   │   │   │   │   └── route.ts     # POST/GET web-agent
│   │   │   │   ├── whatsapp/        # WhatsApp webhook
│   │   │   │   │   ├── route.ts     # POST whatsapp
│   │   │   │   │   └── system-prompt/
│   │   │   │   │       └── route.ts # GET context-aware system prompt
│   │   │   │   └── voice/           # Voice webhook
│   │   │   │       └── route.ts     # POST voice
│   │   │   └── auth/                # Authentication APIs
│   │   │       └── invite/
│   │   │           └── route.ts     # POST invite
│   │   ├── dashboard/               # Dashboard pages
│   │   │   ├── page.tsx             # Overview page
│   │   │   ├── layout.tsx           # Dashboard layout wrapper
│   │   │   ├── inbox/                # Unified inbox page
│   │   │   │   └── page.tsx         # Inbox with conversations
│   │   │   ├── leads/               # Leads page
│   │   │   │   └── page.tsx
│   │   │   ├── bookings/            # Bookings page
│   │   │   │   └── page.tsx
│   │   │   ├── metrics/             # Metrics page
│   │   │   │   └── page.tsx
│   │   │   ├── channels/            # Channel pages
│   │   │   │   ├── web/
│   │   │   │   │   └── page.tsx    # Web PROXe channel
│   │   │   │   ├── whatsapp/
│   │   │   │   │   └── page.tsx    # WhatsApp channel
│   │   │   │   ├── voice/
│   │   │   │   │   └── page.tsx    # Voice channel
│   │   │   │   └── social/
│   │   │   │       └── page.tsx    # Social channel
│   │   │   ├── marketing/           # Marketing page
│   │   │   │   └── page.tsx
│   │   │   └── settings/            # Settings/Configure page
│   │   │       └── page.tsx
│   │   ├── auth/                    # Authentication pages
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── signup/
│   │   │   │   └── page.tsx
│   │   │   ├── accept-invite/
│   │   │   │   └── page.tsx
│   │   │   ├── callback/
│   │   │   │   └── route.ts        # OAuth callback
│   │   │   └── logout/
│   │   │       └── route.ts        # Logout handler
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Landing page
│   │   └── globals.css             # Global styles
│   ├── components/                  # React components
│   │   └── dashboard/               # Dashboard components
│   │       ├── DashboardLayout.tsx  # Main layout with sidebar
│   │       ├── MetricsDashboard.tsx # Metrics cards and charts
│   │       ├── LeadsTable.tsx      # Leads table with filters
│   │       ├── BookingsCalendar.tsx # Bookings calendar wrapper
│   │       ├── CalendarView.tsx    # Calendar view component
│   │       ├── ChannelMetrics.tsx  # Channel-specific metrics
│   │       └── LeadDetailsModal.tsx # Lead details modal
│   ├── hooks/                       # Custom React hooks
│   │   ├── useRealtimeLeads.ts     # Real-time leads subscription
│   │   └── useRealtimeMetrics.ts   # Real-time metrics subscription
│   ├── lib/                         # Utility libraries
│   │   ├── supabase/               # Supabase clients
│   │   │   ├── client.ts           # Client-side Supabase
│   │   │   ├── server.ts           # Server-side Supabase
│   │   │   └── middleware.ts       # Auth middleware
│   │   └── utils.ts                 # Utility functions
│   ├── services/                    # Service layer
│   │   └── claudeService.js         # Context-aware system prompt builder
│   └── types/                       # TypeScript types
│       ├── database.types.ts      # Database schema types
│       └── index.ts                # Common types
├── supabase/
│   └── migrations/                  # Database migrations
│       ├── 001_dashboard_schema.sql # Dashboard users, settings
│       ├── 007_rename_sessions_to_all_leads.sql # Multi-touchpoint schema
│       ├── 008_update_unified_leads_view.sql # Unified leads view
│       └── 009_fix_unified_leads_view_rls.sql # RLS policies
├── public/                          # Static assets
│   ├── PROXE Icon.svg
│   ├── PROXE Icon Black.svg
│   ├── browser-stroke-rounded.svg   # Website channel icon
│   ├── whatsapp-business-stroke-rounded.svg  # WhatsApp channel icon
│   ├── ai-voice-stroke-rounded.svg  # Voice channel icon
│   └── video-ai-stroke-rounded.svg  # Social channel icon
├── .github/
│   └── workflows/
│       └── deploy-dashboard.yml     # CI/CD deployment
├── package.json                     # Dependencies and scripts
├── next.config.js                   # Next.js configuration
├── tailwind.config.ts              # Tailwind CSS configuration
├── tsconfig.json                    # TypeScript configuration
├── postcss.config.js               # PostCSS configuration
└── README.md                        # Quick start guide
```

---

## Setup & Installation

### Prerequisites

- **Node.js 18+** and npm/yarn
- **Supabase account** and project
- **Git** for version control

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd "Command Center"
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Supabase Project Setup

#### 3.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click **"New Project"**
4. Fill in:
   - **Name**: PROXe Command Center
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine to start
5. Click **"Create new project"**
6. Wait 2-3 minutes for project to initialize

#### 3.2 Get Supabase Credentials

1. In Supabase dashboard, go to **Settings** (gear icon) > **API**
2. Copy these values:
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys" > "anon public")
   - **service_role** key (under "Project API keys" > "service_role") - **Keep this secret!**

### Step 4: Database Setup

#### 4.1 Run Database Migrations

**IMPORTANT**: Run migrations in this exact order:

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Copy and paste the contents of `supabase/migrations/001_dashboard_schema.sql`
4. Click **"Run"** (or press Ctrl+Enter)
5. Wait for success message
6. Create a new query and paste contents of `supabase/migrations/007_rename_sessions_to_all_leads.sql`
7. Click **"Run"**
8. Create a new query and paste contents of `supabase/migrations/008_update_unified_leads_view.sql`
9. Click **"Run"**
10. Create a new query and paste contents of `supabase/migrations/009_fix_unified_leads_view_rls.sql`
11. Click **"Run"**
12. All migrations should complete successfully

#### 4.2 Enable Realtime

1. Go to **Database** > **Replication** (left sidebar)
2. Find `all_leads` table in the list
3. Toggle the switch to **enable replication** for `all_leads`
4. This enables real-time updates in the dashboard

### Step 5: Create Admin User

#### 5.1 Create Auth User

1. In Supabase dashboard, go to **Authentication** > **Users**
2. Click **"Add User"** > **"Create new user"**
3. Fill in:
   - **Email**: `proxeadmin@proxe.com`
   - **Password**: `proxepass`
   - ✅ **Check "Auto Confirm User"** (important!)
4. Click **"Create User"**
5. Copy the **UUID** of the created user

#### 5.2 Set Admin Role

1. Go to **SQL Editor**
2. Create a new query
3. Paste this SQL (replace `USER_ID_HERE` with the UUID):

```sql
UPDATE dashboard_users 
SET role = 'admin' 
WHERE id = 'USER_ID_HERE';
```

4. Click **"Run"**
5. Verify with:

```sql
SELECT id, email, role FROM dashboard_users WHERE email = 'proxeadmin@proxe.com';
```

### Step 6: Environment Variables

#### 6.1 Create .env.local File

Create a `.env.local` file in the project root:

```env
# Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Integration APIs (Optional - for future use)
WEB_AGENT_API_URL=
WEB_AGENT_API_KEY=
WHATSAPP_API_URL=
WHATSAPP_API_KEY=
VOICE_API_URL=
VOICE_API_KEY=

# Google Calendar Integration (Optional)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
```

#### 6.2 Fill in Values

Replace placeholders with your actual Supabase credentials from Step 3.2.

**⚠️ Important Notes:**
- Never commit `.env.local` to git (it's in `.gitignore`)
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret - it has admin access
- The `NEXT_PUBLIC_` prefix makes variables available in the browser

### Step 7: Run Development Server

```bash
npm run dev
```

The application will start at [http://localhost:3000](http://localhost:3000)

### Step 8: Login

1. Open [http://localhost:3000](http://localhost:3000)
2. You'll be redirected to login page
3. Login with:
   - **Email**: `proxeadmin@proxe.com`
   - **Password**: `proxepass`

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret!) | `eyJhbGciOiJIUzI1NiIs...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Application URL | `http://localhost:3000` |
| `PORT` | Server port (production) | `3000` |
| `WEB_AGENT_API_URL` | Web Agent API endpoint | - |
| `WEB_AGENT_API_KEY` | Web Agent API key | - |
| `WHATSAPP_API_URL` | WhatsApp API endpoint | - |
| `WHATSAPP_API_KEY` | WhatsApp API key | - |
| `VOICE_API_URL` | Voice API endpoint | - |
| `VOICE_API_KEY` | Voice API key | - |

### Production Environment Variables

For production deployment, set these in your hosting platform:
- Vercel: Project Settings > Environment Variables
- VPS: `.env.local` file (see Deployment section)

---

## Database Schema

### Core Tables

#### `dashboard_users`
- **Purpose**: User accounts with roles
- **Key Columns**:
  - `id` (UUID, Primary Key, references `auth.users`)
  - `email` (TEXT, NOT NULL)
  - `full_name` (TEXT)
  - `role` (TEXT, 'admin' or 'viewer', default: 'viewer')
  - `is_active` (BOOLEAN, default: true)
  - `last_login` (TIMESTAMP)
  - `created_at`, `updated_at`

#### `user_invitations`
- **Purpose**: Invitation tokens for adding new users
- **Key Columns**:
  - `id` (UUID, Primary Key)
  - `email` (TEXT, NOT NULL)
  - `token` (TEXT, UNIQUE)
  - `role` (TEXT, default: 'viewer')
  - `invited_by` (UUID, references `dashboard_users`)
  - `expires_at` (TIMESTAMP)
  - `accepted_at` (TIMESTAMP, nullable)
  - `created_at`

#### `dashboard_settings`
- **Purpose**: Dashboard configuration
- **Key Columns**:
  - `id` (UUID, Primary Key)
  - `key` (TEXT, UNIQUE)
  - `value` (JSONB)
  - `description` (TEXT)
  - `updated_by` (UUID, references `dashboard_users`)
  - `created_at`, `updated_at`

### Multi-Touchpoint Schema

#### `all_leads`
- **Purpose**: Minimal unifier - one record per unique customer
- **Key Columns**:
  - `id` (UUID, Primary Key)
  - `customer_name`, `email`, `phone`
  - `customer_phone_normalized` (TEXT, for deduplication)
  - `first_touchpoint` (TEXT, NOT NULL, 'web' | 'whatsapp' | 'voice' | 'social')
  - `last_touchpoint` (TEXT, NOT NULL, 'web' | 'whatsapp' | 'voice' | 'social')
  - `last_interaction_at` (TIMESTAMP, default: NOW())
  - `brand` (TEXT, default: 'proxe', CHECK: 'proxe')
  - `unified_context` (JSONB, default: '{}')
  - `status` (TEXT, nullable)
  - `booking_date` (DATE, nullable)
  - `booking_time` (TIME, nullable)
  - `created_at`, `updated_at`
- **Deduplication**: Unique on `(customer_phone_normalized, brand)`
- **Indexes**: 
  - `customer_phone_normalized`, `brand`
  - `first_touchpoint`, `last_touchpoint`
  - `last_interaction_at`

#### `web_sessions`
- **Purpose**: Self-contained Web PROXe session data
- **Key Columns**:
  - `id` (UUID, Primary Key)
  - `lead_id` (UUID, Foreign Key to `all_leads`)
  - `brand` (TEXT, default: 'proxe')
  - `customer_name`, `customer_email`, `customer_phone`
  - `customer_phone_normalized` (TEXT)
  - `external_session_id` (TEXT)
  - `chat_session_id` (TEXT)
  - `website_url` (TEXT)
  - `conversation_summary` (TEXT)
  - `user_inputs_summary` (JSONB)
  - `message_count` (INTEGER, default: 0)
  - `last_message_at` (TIMESTAMP)
  - `booking_status` (TEXT, 'pending' | 'confirmed' | 'cancelled')
  - `booking_date` (DATE)
  - `booking_time` (TIME)
  - `session_status` (TEXT, default: 'active', 'active' | 'completed' | 'abandoned')
  - `channel_data` (JSONB, default: '{}')
  - `created_at`, `updated_at`

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
  - `lead_id` (UUID, Foreign Key to `all_leads`)
  - `channel` (TEXT, 'web' | 'whatsapp' | 'voice' | 'social')
  - `sender` (TEXT, 'customer' | 'agent' | 'system')
  - `content` (TEXT)
  - `message_type` (TEXT, 'text' | 'image' | 'file' | 'system')
  - `metadata` (JSONB, default: '{}')
  - `created_at`

### Views

#### `unified_leads`
- **Purpose**: Dashboard display view - aggregates all customer data
- **Columns**:
  - `id`, `name`, `email`, `phone`
  - `first_touchpoint`, `last_touchpoint`
  - `brand`, `timestamp`, `last_interaction_at`
  - `status`, `booking_date`, `booking_time`
  - `metadata` (JSONB with aggregated channel data)
- **Data Source**: `all_leads` + joins to channel tables
- **Ordering**: `last_interaction_at DESC`
- **RLS**: Enabled, authenticated users can SELECT

### Functions

#### `normalize_phone(phone_number TEXT)`
- **Purpose**: Normalize phone numbers (remove all non-digits)
- **Returns**: TEXT (digits only)
- **Example**: `"+91 98765-43210"` → `"919876543210"`

#### `handle_new_user()`
- **Purpose**: Trigger function to create `dashboard_users` entry when auth user is created
- **Trigger**: `on_auth_user_created` on `auth.users`

#### `update_updated_at_column()`
- **Purpose**: Trigger function to update `updated_at` timestamp
- **Used on**: All tables with `updated_at` column

### Row Level Security (RLS)

All tables have RLS enabled with policies:
- **Authenticated users**: Can SELECT, INSERT, UPDATE (where applicable)
- **Service role**: Full access (used by webhooks)

---

## API Routes

### Dashboard APIs

#### `GET /api/dashboard/leads`
**File**: `src/app/api/dashboard/leads/route.ts`

**Purpose**: Fetch leads with filtering and pagination

**Authentication**: Required (authenticated user)

**Query Parameters**:
- `page?: number` - Page number (default: 1)
- `limit?: number` - Items per page (default: 100)
- `source?: string` - Filter by channel ('web' | 'whatsapp' | 'voice' | 'social')
- `status?: string` - Filter by status
- `startDate?: string` - Start date filter (ISO format)
- `endDate?: string` - End date filter (ISO format)

**Response**:
```json
{
  "leads": [
    {
      "id": "uuid",
      "name": "Customer Name",
      "email": "customer@example.com",
      "phone": "+1234567890",
      "source": "web",
      "first_touchpoint": "web",
      "last_touchpoint": "web",
      "brand": "proxe",
      "timestamp": "2024-01-15T10:00:00Z",
      "last_interaction_at": "2024-01-15T14:30:00Z",
      "status": "New Lead",
      "booking_date": "2024-01-20",
      "booking_time": "14:30:00",
      "metadata": {}
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 500,
    "totalPages": 5
  }
}
```

**Data Source**: `unified_leads` view
**Ordering**: `last_interaction_at DESC`

---

#### `PATCH /api/dashboard/leads/[id]/status`
**File**: `src/app/api/dashboard/leads/[id]/status/route.ts`

**Purpose**: Update lead status

**Authentication**: Required

**Path Parameters**:
- `id` - Lead UUID

**Request Body**:
```json
{
  "status": "New Lead" | "Follow Up" | "RNR (No Response)" | "Interested" | "Wrong Enquiry" | "Call Booked" | "Closed"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Status updated successfully"
}
```

**Data Source**: Updates `all_leads.status` column

---

#### `GET /api/dashboard/bookings`
**File**: `src/app/api/dashboard/bookings/route.ts`

**Purpose**: Fetch scheduled bookings

**Authentication**: Required

**Query Parameters**:
- `startDate?: string` - Start date filter (ISO format)
- `endDate?: string` - End date filter (ISO format)

**Response**:
```json
{
  "bookings": [
    {
      "id": "uuid",
      "name": "Customer Name",
      "email": "customer@example.com",
      "phone": "+1234567890",
      "booking_date": "2024-01-20",
      "booking_time": "14:30:00",
      "source": "web",
      "metadata": {
        "conversation_summary": "Customer inquiry"
      }
    }
  ]
}
```

**Data Source**: `unified_leads` view (filtered by `booking_date`, `booking_time`)
**Ordering**: `booking_date ASC, booking_time ASC`

---

#### `GET /api/dashboard/metrics`
**File**: `src/app/api/dashboard/metrics/route.ts`

**Purpose**: Get aggregated metrics

**Authentication**: Required

**Response**:
```json
{
  "totalConversations": 1000,
  "activeConversations": 50,
  "avgResponseTime": 5,
  "conversionRate": 25,
  "leadsByChannel": [
    {
      "channel": "web",
      "count": 600
    },
    {
      "channel": "whatsapp",
      "count": 300
    }
  ],
  "conversationsOverTime": [
    {
      "date": "2024-01-15",
      "count": 50
    }
  ],
  "conversionFunnel": [
    {
      "stage": "New Lead",
      "count": 800
    },
    {
      "stage": "Interested",
      "count": 200
    }
  ],
  "responseTimeTrends": [
    {
      "date": "2024-01-15",
      "avgTime": 5.2
    }
  ]
}
```

**Data Source**: `unified_leads` view

---

#### `GET /api/dashboard/channels/[channel]/metrics`
**File**: `src/app/api/dashboard/channels/[channel]/metrics/route.ts`

**Purpose**: Get channel-specific metrics

**Authentication**: Required

**Path Parameters**:
- `channel` - 'web' | 'whatsapp' | 'voice' | 'social'

**Response**:
```json
{
  "totalConversations": 500,
  "activeConversations": 25,
  "avgResponseTime": 3,
  "conversionRate": 30,
  "conversationsOverTime": [
    {
      "date": "2024-01-15",
      "count": 25
    }
  ],
  "statusBreakdown": [
    {
      "status": "New Lead",
      "count": 400
    }
  ]
}
```

**Data Source**: Channel-specific tables (`web_sessions`, `whatsapp_sessions`, etc.)

---

### Integration APIs (Webhooks)

#### `POST /api/integrations/web-agent`
**File**: `src/app/api/integrations/web-agent/route.ts`

**Purpose**: Web PROXe webhook endpoint

**Authentication**: Service role key (bypasses RLS, no user auth required)

**Request Body**:
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
  "conversation_summary": "Customer inquiry about pricing",
  "user_inputs_summary": {
    "questions": ["pricing", "service area"]
  },
  "message_count": 15,
  "last_message_at": "2024-01-15T14:30:00Z"
}
```

**Required Fields**:
- `name` - Customer's name
- `phone` - Customer's phone (any format, will be normalized)

**Optional Fields**:
- `email` - Customer's email
- `brand` - 'proxe' (defaults to 'proxe')
- `booking_status` - 'pending' | 'confirmed' | 'cancelled'
- `booking_date` - Scheduled date (YYYY-MM-DD)
- `booking_time` - Scheduled time (HH:MM:SS)
- `external_session_id` - External session ID
- `chat_session_id` - Chat session ID
- `website_url` - URL where session originated
- `conversation_summary` - AI summary of chat
- `user_inputs_summary` - JSONB object
- `message_count` - Number of messages
- `last_message_at` - Timestamp (ISO format)

**Response**:
```json
{
  "success": true,
  "lead_id": "uuid",
  "message": "Lead created successfully"
}
```

**Processing Logic**:
1. Validate required fields (`name`, `phone`)
2. Normalize phone number (remove all non-digits)
3. Check for existing lead in `all_leads` by `(customer_phone_normalized, brand)`
4. If new: Create `all_leads` with `first_touchpoint='web'`, `last_touchpoint='web'`
5. If existing: Update `all_leads.last_touchpoint='web'` and `last_interaction_at`
6. Create `web_sessions` record with all provided data
7. Insert into `messages` table with `channel='web'`, `sender='system'`
8. Return success response

---

#### `GET /api/integrations/web-agent`
**File**: `src/app/api/integrations/web-agent/route.ts`

**Purpose**: Fetch web leads (for dashboard)

**Authentication**: Required

**Response**: Array of leads from `unified_leads` view

---

#### `POST /api/integrations/whatsapp`
**File**: `src/app/api/integrations/whatsapp/route.ts`

**Purpose**: WhatsApp webhook endpoint

**Authentication**: API key verification (or service role)

**Process**: Similar to web-agent (creates `whatsapp_sessions`)

---

#### `POST /api/integrations/voice`
**File**: `src/app/api/integrations/voice/route.ts`

**Purpose**: Voice webhook endpoint

**Authentication**: API key verification (or service role)

**Process**: Similar to web-agent (creates `voice_sessions`)

---

#### `GET /api/integrations/whatsapp/system-prompt`
**File**: `src/app/api/integrations/whatsapp/system-prompt/route.ts`

**Purpose**: Get context-aware system prompt for WhatsApp AI agent

**Authentication**: API key verification (`x-api-key` header)

**Query Parameters**:
- `phone` (required) - Customer phone number
- `name` (optional) - Customer name

**Response**:
```json
{
  "success": true,
  "systemPrompt": "You are PROXe, an AI sales agent...",
  "hasContext": true,
  "context": {
    "hasWebHistory": true,
    "hasWhatsAppHistory": false,
    "hasBooking": false,
    "unifiedSummary": "...",
    "webSummary": { "summary": "...", "timestamp": "..." }
  }
}
```

**Features**:
- Fetches customer context from `all_leads` table
- Checks `unified_context` for conversation history
- Falls back to individual channel tables if needed
- Builds personalized system prompt based on:
  - Previous conversation history (web, WhatsApp, voice, social)
  - Upcoming bookings
  - Customer name and touchpoint history
- Returns context-aware greeting instructions for AI agent

**Service**: `src/services/claudeService.js` - Contains `getWhatsAppSystemPrompt()` function

---

### Authentication APIs

#### `POST /api/auth/invite`
**File**: `src/app/api/auth/invite/route.ts`

**Purpose**: Create user invitation (admin only)

**Authentication**: Required (admin role)

**Request Body**:
```json
{
  "email": "user@example.com",
  "role": "viewer"
}
```

**Response**:
```json
{
  "success": true,
  "invitation": {
    "id": "uuid",
    "email": "user@example.com",
    "token": "invitation_token",
    "expires_at": "2024-01-20T00:00:00Z"
  }
}
```

---

## Components

### DashboardLayout
**File**: `src/components/dashboard/DashboardLayout.tsx`
**Type**: Client Component

**Purpose**: Main layout wrapper with collapsible sidebar navigation

**Features**:
- Collapsible sidebar (240px expanded, 64px collapsed - icons only)
- Toggle button to expand/collapse sidebar
- State persistence via localStorage (`sidebar-collapsed`)
- Dark/light mode toggle with theme persistence
- Custom SVG icons for channels (Website, WhatsApp, Voice, Social)
- Active state highlighting with accent colors
- Smooth hover transitions
- Mobile responsive (overlay sidebar on mobile)
- Version badge (v1.0.0) and dynamic last updated date/time
- User menu with logout
- Custom scrollbar styling with brand colors

**Navigation Items** (in order):
1. **Inbox** (`/dashboard/inbox`) - Unified inbox for all conversations
2. **Dashboard** (`/dashboard`) - Overview page
3. **All Leads** (`/dashboard/leads`) - Leads management
4. **Bookings** (`/dashboard/bookings`) - Calendar view
5. **[Divider]**
6. **Website** (`/dashboard/channels/web`) - Web PROXe channel
7. **WhatsApp** (`/dashboard/channels/whatsapp`) - WhatsApp channel
8. **Voice** (`/dashboard/channels/voice`) - Voice channel
9. **Social** (`/dashboard/channels/social`) - Social channel
10. **[Divider]**
11. **Marketing** (`/dashboard/marketing`) - Marketing tools
12. **Configure** (`/dashboard/settings`) - Settings (renamed from "Settings")
13. **[Divider]**
14. **Billing** (`/dashboard/billing`) - Billing management
15. **Docs** (external) - https://docs.goproxe.com
16. **Support** (external) - https://support.goproxe.com

**Design Specs**:
- Sidebar background: `var(--bg-secondary)` (#111111 dark, #F5F5F5 light)
- Border right: 1px solid `var(--border-primary)`
- Nav items: padding 10px 16px, border-radius 6px
- Hover state: background `var(--bg-hover)`
- Active state: background `var(--accent-subtle)`, text `var(--accent-light)`, left border 2px solid `var(--accent-primary)`
- Text: 14px, font-weight 500
- Icons: 20px, margin-right 12px (when expanded), centered (when collapsed)
- Transition: all 0.2s ease for smooth collapse animation

---

### MetricsDashboard
**File**: `src/components/dashboard/MetricsDashboard.tsx`
**Type**: Client Component

**Purpose**: Display key metrics and charts

**Props**:
- `detailed?: boolean` - Show detailed charts (default: false)

**Features**:
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

**Data Source**: `/api/dashboard/metrics`

---

### LeadsTable
**File**: `src/components/dashboard/LeadsTable.tsx`
**Type**: Client Component

**Purpose**: Display leads in a table with filtering

**Props**:
- `limit?: number` - Limit number of leads shown
- `sourceFilter?: string` - Pre-filter by source channel

**Features**:
- Real-time updates via `useRealtimeLeads` hook
- Filters:
  - Date range (today, week, month, all)
  - Source channel (web, whatsapp, voice, social, all)
  - Status (New Lead, Follow Up, RNR, Interested, Wrong Enquiry, Call Booked, Closed)
- Export to CSV
- Lead details modal
- Status update functionality
- Pagination support

**Columns**:
- Name
- Email
- Phone
- **First Source** (displays `first_touchpoint` or `source` fallback)
- Timestamp
- Status
- Actions

**Note**: "Source" column renamed to "First Source" to indicate the first touchpoint where the lead originated.

---

### BookingsCalendar
**File**: `src/components/dashboard/BookingsCalendar.tsx`
**Type**: Client Component

**Purpose**: Wrapper for calendar view

**Props**:
- `view?: 'calendar' | 'list' | 'full'` - View mode

**Features**:
- Calendar view of bookings
- Filter by date range
- Real-time updates

**Data Source**: `/api/dashboard/bookings`

---

### CalendarView
**File**: `src/components/dashboard/CalendarView.tsx`
**Type**: Client Component

**Purpose**: Interactive calendar view with weekly/monthly toggles

**Features**:
- Weekly view with hourly slots
- Monthly view with day grid
- Mini-calendar for date selection
- Navigation (previous/next week/month, "Today" button)
- Bookings color-coded by source
- Booking blocks display:
  - Time
  - Call title
  - Customer name
- Clickable booking blocks → Booking Details Modal
- "View Client Details" button → Lead Details Modal
- Mobile-responsive with horizontal scrolling
- Sticky time column

---

### ChannelMetrics
**File**: `src/components/dashboard/ChannelMetrics.tsx`
**Type**: Client Component

**Purpose**: Channel-specific metrics display

**Props**:
- `channel: string` - Channel name ('web' | 'whatsapp' | 'voice' | 'social')

**Features**:
- Channel-specific metrics cards
- Channel-specific charts
- Real-time updates

**Data Source**: `/api/dashboard/channels/[channel]/metrics`

---

### LeadDetailsModal
**File**: `src/components/dashboard/LeadDetailsModal.tsx`
**Type**: Client Component

**Purpose**: Modal showing detailed lead information with multi-channel conversation summaries

**Props**:
- `lead: Lead` - Lead data (includes `unified_context`)
- `isOpen: boolean` - Modal open state
- `onClose: () => void` - Close handler

**Features**:
- Lead details display
- Status update functionality
- Booking information display
- **Multi-Channel Conversation Summaries**:
  - Fetches summaries from `unified_context` or individual channel tables
  - Displays summaries organized by channel:
    - 🌐 **Web** - Blue accent (#3B82F6)
    - 💬 **WhatsApp** - Green accent (#22C55E)
    - 📞 **Voice** - Purple accent (#8B5CF6)
    - 📱 **Social** - Pink accent (#EC4899)
  - Each channel card shows:
    - Channel icon and name
    - Conversation summary text
    - Timestamp of last interaction
  - **Unified Summary** section at bottom (highlighted box)
    - Shows `unified_context.unified_summary` if available
    - Falls back to most recent channel summary
- Backdrop blur effect when modal opens
- Channel-specific styling with left border colors

---

## Custom Hooks

### useRealtimeLeads
**File**: `src/hooks/useRealtimeLeads.ts`

**Purpose**: Real-time leads subscription

**Returns**:
```typescript
{
  leads: Lead[],
  loading: boolean,
  error: string | null
}
```

**Features**:
- Initial fetch from `unified_leads` view
- Real-time subscription to `all_leads` table
- Automatic refetch on changes
- Error handling with helpful messages

**Data Ordering**: `last_interaction_at DESC`

**Usage**:
```typescript
const { leads, loading, error } = useRealtimeLeads();
```

---

### useRealtimeMetrics
**File**: `src/hooks/useRealtimeMetrics.ts`

**Purpose**: Real-time metrics subscription

**Returns**:
```typescript
{
  metrics: Metrics,
  loading: boolean
}
```

**Features**:
- Fetches metrics from `/api/dashboard/metrics`
- Polling for updates (every 30 seconds)
- Calculates derived metrics

**Usage**:
```typescript
const { metrics, loading } = useRealtimeMetrics();
```

---

## Data Flow

### Creating a Lead (Web PROXe Example)

```
1. Web PROXe System
   ↓ POST /api/integrations/web-agent
2. API Handler (web-agent/route.ts)
   ↓ Validate & Normalize
3. Check all_leads (phone_normalized + brand)
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

---

## Build & Development

### Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

### Development Server

- **URL**: http://localhost:3000
- **Hot Reload**: Enabled
- **TypeScript**: Strict mode enabled

### Build Process

1. **Prebuild Step**: 
   - Runs `node scripts/set-build-time.js` (via `prebuild` script)
   - Sets `NEXT_PUBLIC_BUILD_TIME` in `.env.local` with current UTC timestamp
   - Format: ISO 8601 (e.g., `2024-12-15T10:30:45.123Z`)

2. **Build Step**:
   - Sets `NEXT_PUBLIC_BUILD_TIME` environment variable (UTC with milliseconds)
   - Runs `next build` to compile the application
   - TypeScript compilation check (strict mode enabled)
   - Next.js optimization and bundling

3. **Build Verification**:
   - Checks for `.next` directory existence
   - Verifies `BUILD_ID` file creation
   - Validates build exit code

### Build Scripts

```bash
# Development
npm run dev              # Start development server (localhost:3000)

# Production Build
npm run build           # Full production build with build time tracking
npm start               # Start production server (default port 3000, configurable via PORT)

# Quality Checks
npm run lint            # ESLint validation
npm run type-check      # TypeScript type checking without emit
```

### Build Output

- `.next/` - Build output directory
  - `BUILD_ID` - Unique build identifier (generated by Next.js)
  - `static/` - Static assets and chunks
  - `server/` - Server-side code and API routes
  - `cache/` - Build cache for faster rebuilds
  - `standalone/` - Standalone build output (if configured)

### Build Configuration

**Next.js Config** (`next.config.js`):
- React Strict Mode: Enabled
- App Router: Enabled (default in Next.js 14)

**TypeScript Config** (`tsconfig.json`):
- Target: ES2020
- Module: ESNext
- Strict Mode: Enabled
- Path Aliases: `@/*` → `./src/*`
- Module Resolution: Bundler (Next.js optimized)

### TypeScript Configuration

**File**: `tsconfig.json`

- **Target**: ES2020
- **Module**: ESNext
- **Strict Mode**: Enabled
- **Path Aliases**: `@/*` → `./src/*`

### Next.js Configuration

**File**: `next.config.js`

- **React Strict Mode**: Enabled
- **App Router**: Enabled (default in Next.js 14)

---

## Deployment

### VPS Deployment (Current Setup)

**CI/CD**: GitHub Actions
**Workflow**: `.github/workflows/deploy-dashboard.yml`
**Trigger**: Push to `master` branch

#### Deployment Process

1. **Source Deployment**:
   - Uses `appleboy/scp-action@master` to copy files to VPS
   - Target: `/var/www/dashboard`
   - Excludes: `node_modules`, `.git`
   - Timeout: 60 seconds

2. **Build Process** (on VPS):
   - Sets `BUILD_TIME` variable (UTC ISO format with milliseconds)
   - Creates/updates `.env.local` with:
     - Supabase credentials
     - `NEXT_PUBLIC_BUILD_TIME` (for build tracking)
     - `PORT=3001` (production port)
   - Exports environment variables for build
   - Installs dependencies: `npm install`
   - Builds application: `npm run build`
   - Verifies build success (exit code check)
   - Validates `.next` directory exists
   - Checks for `BUILD_ID` file

3. **Application Restart**:
   - Stops existing PM2 process: `pm2 stop dashboard`
   - Deletes old process: `pm2 delete dashboard`
   - Waits 2 seconds for cleanup
   - Starts new process: `PORT=3001 pm2 start npm --name dashboard -- start`
   - Saves PM2 configuration: `pm2 save`
   - Waits 10 seconds for startup
   - Verifies PM2 status and port 3001 listening
   - Displays recent logs (last 100 lines)

#### VPS Requirements

- **Node.js 18+**
- **PM2** process manager
- **SSH access** configured
- **Port 3001** available

#### Environment Variables on VPS

Create `.env.local` on VPS with:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3001
```

#### PM2 Configuration

**Process Name**: `dashboard`
**Port**: `3001` (configured via `PORT` environment variable)
**Start Command**: `npm start` (runs `next start -p ${PORT:-3000}`)

```bash
# Start application
PORT=3001 pm2 start npm --name dashboard -- start

# Save PM2 config (persists across reboots)
pm2 save

# View logs
pm2 logs dashboard
pm2 logs dashboard --lines 100 --nostream  # Last 100 lines without streaming

# Check status
pm2 status

# Restart application
pm2 restart dashboard

# Stop application
pm2 stop dashboard
```

#### Build Time Tracking

The build process automatically sets `NEXT_PUBLIC_BUILD_TIME` which:
- Is available in the browser via `process.env.NEXT_PUBLIC_BUILD_TIME`
- Can be displayed in the UI for version tracking
- Format: `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC ISO 8601 with milliseconds)
- Set during both local builds and CI/CD deployments

### Alternative Deployment Options

#### Vercel (Recommended for Next.js)

1. Connect GitHub repository
2. Configure environment variables
3. Deploy automatically on push

#### Netlify

1. Connect GitHub repository
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Configure environment variables

#### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

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

### Dark/Light Mode
- **Implementation**: CSS variables with theme switching
- **Storage**: localStorage (`theme-preference`)
- **Default**: System preference (detected on mount)
- **Toggle**: Theme toggle button in sidebar
- **Theme Variables**:
  - Light mode: `--bg-primary` (#FFFFFF), `--bg-secondary` (#F5F5F5), `--accent-primary` (#5B1A8C)
  - Dark mode: `--bg-primary` (#0D0D0D), `--bg-secondary` (#111111), `--accent-primary` (#8B5CF6)
- **Initialization**: Blocking script in `layout.tsx` sets theme before React hydrates (prevents white flash)

### Responsive Design
- **Mobile**: Collapsible sidebar, stacked layout, horizontal scrolling for calendar
- **Tablet**: Adjusted grid layouts
- **Desktop**: Full sidebar, multi-column layouts

### Calendar Features
- **Weekly View**: Hourly slots (48px height)
- **Monthly View**: Day grid
- **Mini Calendar**: Date picker
- **Navigation**: Previous/next, Today button
- **Interactive**: Clickable booking blocks
- **Modals**: Booking details → Client details
- **Mobile**: Horizontal scrolling, compact layout

### Unified Inbox
- **Page**: `/dashboard/inbox`
- **Layout**: Two-panel design (30% conversations list, 70% messages)
- **Features**:
  - Real-time conversation updates via Supabase Realtime
  - Search conversations by name, phone, or message content
  - Channel filters (All, Web, WhatsApp, Voice, Social)
  - Message history display with timestamps
  - Channel-specific icons and styling
  - Unread count badges (structure ready, count logic pending)
  - Read-only message input (reply feature pending)

### Custom Scrollbar Styling
- **Implementation**: CSS custom scrollbar using CSS variables
- **Colors**: Brand purple accent (`var(--accent-primary)`)
- **Styling**: 
  - Webkit browsers: Custom scrollbar track and thumb
  - Firefox: `scrollbar-color` property
  - Matches theme (dark/light mode aware)

---

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

### User Roles

- **Admin**: Full access, can invite users
- **Viewer**: Read-only access

---

## Styling & UI

### Framework
- **CSS Framework**: Tailwind CSS
- **Theme**: Custom purple accent (`#5B1A8C`)
- **Dark Mode**: Full support with custom dark colors

### Color Palette

**Primary Colors**:
- `primary-50` to `primary-900` (Purple scale)
- Main: `#5B1A8C` (primary-600)

**Dark Mode Colors**:
- `dark-darkest`: `#0D0D0D`
- `dark-darker`: `#1A1A1A`
- `dark-dark`: `#262626`
- `dark-base`: `#333333`

**Light Mode Colors**:
- `light-white`: `#ffffff`
- `light-lightest`: `#f6f6f6`
- `light-lighter`: `#ececec`
- `light-light`: `#d0d0d0`

### Icons
- **Library**: `react-icons/md` (Material Design icons)
- **Custom SVG Icons**: Channel navigation uses custom SVG files:
  - `public/browser-stroke-rounded.svg` - Website channel
  - `public/whatsapp-business-stroke-rounded.svg` - WhatsApp channel
  - `public/ai-voice-stroke-rounded.svg` - Voice channel
  - `public/video-ai-stroke-rounded.svg` - Social channel
- **Usage**: Navigation, metrics cards, channel cards

### Typography
- **Fonts**: System fonts (Exo 2, Zen Dots available but not default)
- **Sizes**: Responsive text sizes (mobile: smaller, desktop: larger)

---

## Troubleshooting

### "Invalid login credentials"
- Verify user exists in Supabase Auth > Users
- Check email/password are correct
- Ensure user is confirmed (Auto Confirm was checked)
- Verify `dashboard_users` table has the user

### "Supabase client error"
- Check `.env.local` file exists
- Verify environment variables are correct (no extra spaces)
- Restart dev server after adding env vars
- Verify Supabase project URL and keys are correct

### "Can't access dashboard after login"
- Check `dashboard_users` table has your user
- Verify RLS policies are set correctly
- Check browser console for errors
- Verify user role is set correctly

### "Real-time updates not working"
- Verify Realtime is enabled for `all_leads` table (Database > Replication)
- Check Supabase project has Realtime enabled
- Verify you're using the correct Supabase URL
- Check browser console for WebSocket errors

### "Build failed"
- Check Node.js version (18+ required)
- Verify all dependencies installed (`npm install`)
- Check for TypeScript errors (`npm run type-check`)
- Verify environment variables are set
- Clear `.next` cache: `rm -rf .next && npm run build`
- Check for module resolution errors (e.g., "Cannot find module './682.js'")

### "White screen on dashboard load"
- Verify theme initialization script in `layout.tsx` is present
- Check browser console for hydration errors
- Ensure `suppressHydrationWarning` is set on `<html>` and `<body>` tags
- Verify CSS variables are defined in `globals.css`
- Check that `DashboardLayout` has proper background colors set
- Ensure `dynamic = 'force-dynamic'` is set in `dashboard/layout.tsx`

### "502 Bad Gateway" (VPS)
- Check PM2 process is running (`pm2 status`)
- Verify `.next` directory exists after build
- Check port 3001 is not in use
- Verify environment variables are set on VPS
- Check PM2 logs (`pm2 logs dashboard`)

### "New leads not showing in unified_leads"
- Verify `unified_leads` view exists and has correct RLS policies
- Check migration `009_fix_unified_leads_view_rls.sql` was run
- Verify `all_leads` table has the new lead
- Check channel-specific table (e.g., `web_sessions`) has the record

### Database migration errors
- Make sure you're running migrations in order (001, 007, 008, 009)
- Check if tables already exist (may need to drop and recreate)
- Verify you have proper permissions
- Check Supabase SQL Editor for error messages

---

## Future Enhancements

- [ ] Advanced search functionality
- [ ] Bulk actions on leads
- [ ] Custom dashboard widgets
- [ ] Email notifications
- [ ] Google Calendar integration
- [ ] Advanced reporting
- [ ] Lead notes and activity tracking
- [ ] Multi-user collaboration features
- [ ] Export to Excel/PDF
- [ ] Custom status workflows
- [ ] Lead scoring
- [ ] Automated follow-up reminders

---

## Support & Documentation

### Additional Documentation

- **README.md** - Quick start guide
- **SETUP_GUIDE.md** - Detailed setup instructions
- **QUICK_START.md** - Quick reference
- **WEB_PROXE_LEAD_FLOW.md** - Web PROXe lead flow details

### Getting Help

1. Check this documentation first
2. Review troubleshooting section
3. Check Supabase dashboard for database issues
4. Review browser console for frontend errors
5. Check PM2 logs for server errors (VPS)

---

---

## Latest Build Details

### Build Information
- **Version**: 1.0.0
- **Package Name**: `proxe-command-center`
- **Build Status**: ✅ Production Ready
- **Build Time Tracking**: `NEXT_PUBLIC_BUILD_TIME` environment variable (UTC ISO format)

### Recent Changes (Latest Build)

#### UI/UX Improvements
1. **Custom Scrollbar Styling**
   - Brand purple accent colors
   - Theme-aware (dark/light mode)
   - Webkit and Firefox support

2. **Navigation Updates**
   - Renamed "Settings" to "Configure"
   - Added "Inbox" as first navigation item
   - Reordered navigation: Dashboard → Inbox → All Leads → Bookings
   - Custom SVG icons for channel navigation

3. **Sidebar Enhancements**
   - Version badge (v1.0.0) display
   - Dynamic "Last Updated" date/time (updates every minute)
   - Improved collapse/expand animations
   - Better mobile responsiveness

#### Feature Additions
1. **Unified Inbox** (`/dashboard/inbox`)
   - Two-panel conversation view
   - Real-time message updates
   - Channel filtering and search
   - Message history display

2. **Multi-Channel Conversation Summaries**
   - LeadDetailsModal now shows summaries from all touchpoints
   - Channel-specific cards with icons and timestamps
   - Unified summary section at bottom
   - Fetches from `unified_context` or individual tables

3. **Context-Aware WhatsApp System Prompt**
   - New API endpoint: `/api/integrations/whatsapp/system-prompt`
   - Service: `src/services/claudeService.js`
   - Builds personalized prompts based on:
     - Previous conversation history
     - Upcoming bookings
     - Customer touchpoint journey

#### Data Model Updates
1. **Leads Table**
   - Column renamed: "Source" → "First Source"
   - Displays `first_touchpoint` with fallback to `source`
   - Updated CSV export headers

2. **Lead Interface**
   - Added `unified_context?: any` to Lead type
   - Supports multi-channel conversation data

#### Bug Fixes
1. **White Screen Issues**
   - Fixed theme initialization timing
   - Added blocking script in `layout.tsx`
   - Improved hydration handling
   - Added `suppressHydrationWarning` attributes

2. **Build Errors**
   - Added `dynamic = 'force-dynamic'` to API routes
   - Fixed TypeScript import errors
   - Resolved module resolution issues

3. **Navigation Issues**
   - Fixed redirect imports
   - Improved error handling in dashboard layout
   - Added `prefetch={false}` to prevent prefetching issues

### Build Truths

#### Verified Working Features
- ✅ Dark/light mode toggle with persistence
- ✅ Collapsible sidebar with state persistence
- ✅ Real-time leads updates via Supabase Realtime
- ✅ Multi-channel conversation summaries in LeadDetailsModal
- ✅ Unified inbox with real-time updates
- ✅ Context-aware WhatsApp system prompt API
- ✅ Custom scrollbar styling
- ✅ Responsive mobile design
- ✅ CSV export functionality
- ✅ Calendar booking views

#### Known Limitations
- ⚠️ Inbox unread count badge structure ready, count logic pending
- ⚠️ Inbox reply functionality pending (input is read-only)
- ⚠️ Some TypeScript strict mode warnings may exist (non-blocking)

#### Performance Optimizations
- Theme initialization before React hydration (prevents white flash)
- Dynamic imports for better code splitting
- Real-time subscriptions optimized with proper cleanup
- LocalStorage access wrapped in try-catch for SSR safety
- Build time tracking for deployment verification
- Prebuild script ensures build time is set before compilation

### Build Dependencies

**Production Dependencies**:
- `next@^14.2.18` - Next.js framework
- `react@^18.3.0` - React library
- `react-dom@^18.3.0` - React DOM
- `@supabase/supabase-js@^2.39.0` - Supabase client
- `@supabase/ssr@^0.1.0` - Supabase SSR utilities
- `@anthropic-ai/sdk@^0.71.0` - Anthropic Claude API SDK
- `recharts@^2.10.3` - Chart library
- `date-fns@^3.0.6` - Date utilities
- `zod@^3.22.4` - Schema validation
- `clsx@^2.1.0` - Conditional class names
- `tailwind-merge@^2.2.0` - Tailwind class merging
- `react-icons@^4.12.0` - Icon library

**Development Dependencies**:
- `typescript@^5.3.3` - TypeScript compiler
- `@types/node@^20.11.0` - Node.js type definitions
- `@types/react@^18.2.48` - React type definitions
- `@types/react-dom@^18.2.18` - React DOM type definitions
- `eslint@^8.56.0` - Linter
- `eslint-config-next@^14.2.0` - Next.js ESLint config
- `tailwindcss@^3.4.1` - Tailwind CSS
- `postcss@^8.4.35` - PostCSS processor
- `autoprefixer@^10.4.17` - CSS autoprefixer

### Build Environment Variables

**Required for Build**:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for webhooks)

**Build-Time Variables**:
- `NEXT_PUBLIC_BUILD_TIME` - Automatically set during build (UTC ISO format)

**Production Runtime Variables**:
- `PORT` - Server port (default: 3000, production: 3001)

---

**Last Updated**: Based on current build configuration
**Version**: 1.0.0
**Maintained By**: PROXe Team
