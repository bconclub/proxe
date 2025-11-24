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
│   │   │   │   │   └── route.ts     # POST whatsapp
│   │   │   │   └── voice/           # Voice webhook
│   │   │   │       └── route.ts     # POST voice
│   │   │   └── auth/                # Authentication APIs
│   │   │       └── invite/
│   │   │           └── route.ts     # POST invite
│   │   ├── dashboard/               # Dashboard pages
│   │   │   ├── page.tsx             # Overview page
│   │   │   ├── layout.tsx           # Dashboard layout wrapper
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
│   │   │   └── settings/            # Settings page
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
│   └── PROXE Icon Black.svg
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

**Purpose**: Main layout wrapper with sidebar navigation

**Features**:
- Collapsible sidebar (mobile & desktop)
- Navigation menu with Channels submenu
- User menu with profile and logout
- Dark mode toggle
- Responsive design

**Navigation Items**:
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
- Source (first_touchpoint)
- Timestamp
- Status
- Actions

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

**Purpose**: Modal showing detailed lead information

**Props**:
- `lead: Lead` - Lead data
- `isOpen: boolean` - Modal open state
- `onClose: () => void` - Close handler

**Features**:
- Lead details display
- Status update
- Booking information
- Metadata display

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

1. **Type Checking**: TypeScript compilation check
2. **Linting**: ESLint validation
3. **Next.js Build**: 
   - Compiles pages and API routes
   - Optimizes images and assets
   - Generates static pages where possible
   - Creates `.next` directory with build output

### Build Output

- `.next/` - Build output directory
  - `BUILD_ID` - Unique build identifier
  - `static/` - Static assets
  - `server/` - Server-side code
  - `cache/` - Build cache

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

#### Deployment Process

1. **Trigger**: Push to `master` branch
2. **Deploy Source**: SCP files to VPS (`/var/www/dashboard`)
3. **Build**: 
   - Install dependencies (`npm install`)
   - Build application (`npm run build`)
   - Verify `.next` directory exists
4. **Restart**: 
   - Stop old PM2 process
   - Start new PM2 process on port 3001
   - Save PM2 configuration

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

```bash
# Start application
PORT=3001 pm2 start npm --name dashboard -- start

# Save PM2 config
pm2 save

# View logs
pm2 logs dashboard

# Check status
pm2 status
```

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

### Dark Mode
- **Implementation**: Tailwind CSS dark mode
- **Storage**: localStorage
- **Default**: System preference
- **Toggle**: User menu

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

**Last Updated**: 2024
**Version**: 1.0.0
**Maintained By**: PROXe Team
