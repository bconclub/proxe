# PROXe Build Documentation — Complete Structure & Function Details

## Table of Contents
1. [Build Structure](#build-structure)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema](#database-schema)
4. [API Routes & Functions](#api-routes--functions)
5. [Components](#components)
6. [Libraries & Utilities](#libraries--utilities)
7. [Hooks](#hooks)
8. [Configuration](#configuration)
9. [Multi-Brand Architecture](#multi-brand-architecture)
10. [Deployment](#deployment)
11. [Scripts](#scripts)
12. [AI Prompts & System Prompts](#ai-prompts--system-prompts)
13. [Type Definitions](#type-definitions)
14. [Security & Authentication](#security--authentication)

---

## Build Structure

### Complete Directory Layout

```
PROXe/                                        # Root monorepo
├── .github/workflows/                        # CI/CD
│   ├── deploy-proxe-dashboard.yml
│   ├── deploy-windchasers-dashboard.yml
│   └── deploy-windchasers-web-agent.yml
├── scripts/                                  # Root utility scripts
│   ├── brand.config.template.ts
│   ├── fix-nextjs-error.sh
│   ├── kill-build-ports.sh
│   ├── kill-port.sh
│   └── sync-master-to-brand.sh
├── brand/
│   ├── proxe/                                # ── PROXe Brand ──
│   │   ├── dashboard/
│   │   │   ├── build/                        # Next.js Dashboard (port 4000)
│   │   │   │   ├── src/                      # Source code (see below)
│   │   │   │   ├── public/                   # Static assets
│   │   │   │   ├── scripts/                  # Build scripts
│   │   │   │   ├── next.config.js
│   │   │   │   ├── middleware.ts
│   │   │   │   ├── tailwind.config.ts
│   │   │   │   ├── tsconfig.json
│   │   │   │   ├── package.json
│   │   │   │   └── .env.local
│   │   │   ├── supabase/
│   │   │   │   └── migrations/               # 23 migration files (001–023)
│   │   │   └── docs/
│   │   └── web-agent/                        # Next.js Web Agent (port 4001)
│   │       ├── src/                          # Source code (see below)
│   │       ├── next.config.js
│   │       ├── tsconfig.json
│   │       ├── package.json
│   │       └── .env.local
│   │
│   ├── windchasers/                          # ── Windchasers Brand ──
│   │   ├── dashboard/build/                  # Next.js Dashboard (port 4002/3003)
│   │   ├── web-agent/build/                  # Next.js Web Agent (port 4003/3001)
│   │   └── supabase/migrations/             # 28 migration files
│   │
│   └── master/                               # ── Master Brand (template) ──
│       ├── dashboard/build/
│       └── web-agent/build/
│
├── package.json                              # Root monorepo scripts
├── README.md
├── master-proxe.md                           # This file
├── nginx-proxe-windchasers.conf
└── PROXE_SYSTEM_DOCUMENTATION.md
```

### PROXe Dashboard Source (`brand/proxe/dashboard/build/src/`)

```
src/
├── app/
│   ├── page.tsx                              # Root landing page
│   ├── layout.tsx                            # Root layout (ThemeProvider + auth)
│   ├── globals.css                           # Global styles + CSS variables
│   ├── error.tsx                             # Error boundary
│   ├── global-error.tsx                      # Global error boundary
│   ├── not-found.tsx                         # 404 page
│   │
│   ├── auth/
│   │   ├── login/page.tsx                    # Login page
│   │   ├── signup/page.tsx                   # Signup page
│   │   ├── accept-invite/page.tsx            # Accept invitation
│   │   ├── callback/route.ts                 # Auth callback
│   │   └── logout/route.ts                   # Logout handler
│   │
│   ├── admin/page.tsx                        # Admin page
│   ├── status/page.tsx                       # Status page
│   │
│   ├── dashboard/
│   │   ├── layout.tsx                        # Dashboard layout (server, auth check)
│   │   ├── page.tsx                          # Overview (FounderDashboard)
│   │   ├── error.tsx                         # Dashboard error boundary
│   │   ├── inbox/page.tsx                    # Conversations / Unified inbox
│   │   ├── leads/page.tsx                    # Leads management
│   │   ├── bookings/page.tsx                 # Events / Bookings calendar
│   │   ├── flows/page.tsx                    # Flows (automation)
│   │   ├── audience/page.tsx                 # Audience (coming soon)
│   │   ├── metrics/page.tsx                  # Metrics analytics
│   │   ├── marketing/page.tsx                # Marketing tools
│   │   ├── channels/
│   │   │   ├── web/page.tsx                  # Web channel metrics
│   │   │   ├── whatsapp/page.tsx             # WhatsApp channel metrics
│   │   │   ├── voice/page.tsx                # Voice channel metrics
│   │   │   └── social/page.tsx               # Social channel metrics
│   │   └── settings/
│   │       ├── page.tsx                      # Configure (theme, widget style)
│   │       ├── web-agent/
│   │       │   ├── page.tsx                  # Web Agent settings
│   │       │   └── WebAgentSettingsClient.tsx
│   │       └── knowledge-base/
│   │           ├── page.tsx                  # Knowledge Base page
│   │           └── KnowledgeBaseClient.tsx   # Knowledge Base client UI
│   │
│   └── api/
│       ├── admin/
│       │   └── backfill-leads/route.ts       # POST — Backfill leads
│       ├── auth/
│       │   ├── invite/route.ts               # POST — Send invitation
│       │   └── sync-session/route.ts         # POST — Sync session
│       ├── dashboard/
│       │   ├── leads/
│       │   │   ├── route.ts                  # GET — List leads (paginated)
│       │   │   └── [id]/
│       │   │       ├── activities/route.ts   # GET, POST — Lead activities
│       │   │       ├── override/route.ts     # POST — Override lead stage
│       │   │       ├── score/route.ts        # GET, POST — Lead score
│       │   │       ├── stage/route.ts        # POST — Update lead stage
│       │   │       ├── status/route.ts       # POST — Update lead status
│       │   │       └── summary/route.ts      # GET — Lead summary
│       │   ├── bookings/route.ts             # GET — List bookings
│       │   ├── metrics/route.ts              # GET — Dashboard metrics
│       │   ├── founder-metrics/route.ts      # GET — Founder-level metrics
│       │   ├── insights/route.ts             # GET, POST — Insights
│       │   ├── summarize/route.ts            # POST — AI summarization
│       │   ├── channels/
│       │   │   └── [channel]/metrics/route.ts # GET — Channel-specific metrics
│       │   ├── web/messages/route.ts         # GET — Web channel messages
│       │   ├── whatsapp/messages/route.ts    # GET — WhatsApp messages
│       │   └── settings/
│       │       └── widget-style/route.ts     # GET, POST — Widget style settings
│       ├── knowledge-base/
│       │   ├── route.ts                      # GET — List all KB items
│       │   ├── text/route.ts                 # POST — Add manual text entry
│       │   ├── url/route.ts                  # POST — Add URL (with scraping)
│       │   ├── upload/route.ts               # POST — Upload file (PDF/DOC/TXT)
│       │   └── [id]/route.ts                 # GET, DELETE — Single KB item
│       ├── integrations/
│       │   ├── web-agent/route.ts            # GET, POST — Web agent webhook
│       │   ├── whatsapp/
│       │   │   ├── route.ts                  # POST — WhatsApp webhook
│       │   │   └── system-prompt/route.ts    # GET — Context-aware prompt
│       │   └── voice/route.ts                # POST — Voice integration
│       ├── leads/
│       │   ├── score/route.ts                # POST — Calculate lead score
│       │   └── rescore-all/route.ts          # POST — Batch rescore
│       ├── webhooks/
│       │   └── message-created/route.ts      # POST — Message webhook
│       ├── debug-auth/route.ts               # GET — Debug auth state
│       ├── diagnostics/
│       │   └── supabase/route.ts             # GET — Supabase diagnostics
│       ├── settings/
│       │   └── widget-style/route.ts         # GET, POST — Widget style (alt path)
│       ├── status/route.ts                   # GET — Health check
│       ├── test-connection/route.ts          # GET — Test Supabase connection
│       └── test-scoring/route.ts             # GET — Test scoring algorithm
│
├── components/
│   ├── PageTransitionLoader.tsx              # Route change loading indicator
│   └── dashboard/
│       ├── DashboardLayout.tsx               # Sidebar + layout wrapper
│       ├── FounderDashboard.tsx              # Overview page component
│       ├── LeadsTable.tsx                    # Leads list with filtering
│       ├── LeadDetailsModal.tsx              # Lead detail modal
│       ├── LeadStageSelector.tsx             # Stage dropdown
│       ├── BookingsCalendar.tsx              # Bookings calendar
│       ├── CalendarView.tsx                  # Calendar visualization
│       ├── MetricsDashboard.tsx              # Metrics charts
│       ├── MicroCharts.tsx                   # Small sparkline charts
│       ├── WebMetrics.tsx                    # Web channel metrics
│       ├── WhatsAppMetrics.tsx               # WhatsApp channel metrics
│       ├── ActivityLoggerModal.tsx           # Activity logging modal
│       ├── ThemeProvider.tsx                 # Dark/light theme context
│       ├── LoadingOverlay.tsx                # Loading overlay
│       └── KnowledgeBase/                    # Knowledge Base components
│           ├── index.ts                      # Barrel exports
│           ├── FileUploader.tsx              # Drag-drop file upload
│           ├── UrlInput.tsx                  # URL input + scraper
│           ├── TextInput.tsx                 # Manual text entry
│           ├── KnowledgeList.tsx             # KB items table
│           └── KnowledgeItem.tsx             # Single KB item row
│
├── hooks/
│   ├── useRealtimeLeads.ts                   # Real-time lead subscription
│   └── useRealtimeMetrics.ts                 # Real-time metrics polling
│
├── lib/
│   ├── buildInfo.ts                          # Build time/version info
│   ├── leadScoreCalculator.ts                # Lead scoring algorithm
│   ├── utils.ts                              # cn(), formatDate, etc.
│   └── supabase/
│       ├── client.ts                         # Browser Supabase client (singleton)
│       ├── server.ts                         # Server Supabase client (SSR)
│       └── middleware.ts                     # Auth session middleware
│
├── services/
│   └── claudeService.js                      # Context-aware WhatsApp prompts
│
└── types/
    ├── index.ts                              # Lead, Metrics, KnowledgeBaseItem, etc.
    └── database.types.ts                     # Generated Supabase DB types
```

### PROXe Web Agent Source (`brand/proxe/web-agent/src/`)

```
src/
├── app/
│   ├── page.tsx                              # Home page
│   ├── layout.tsx                            # Root layout
│   ├── widget/
│   │   └── page.tsx                          # Embeddable widget page
│   └── api/
│       ├── chat/
│       │   ├── route.ts                      # POST — Chat streaming (Claude)
│       │   └── summarize/route.ts            # POST — Conversation summary
│       └── calendar/
│           ├── availability/route.ts         # GET — Calendar availability
│           ├── book/route.ts                 # POST — Book appointment
│           └── list/route.ts                 # GET — List events
│
├── components/
│   ├── ChatWidget.tsx                        # Main chat widget (1000+ lines)
│   └── shared/
│       ├── BookingCalendarWidget.tsx          # Cal.com booking widget
│       ├── ChatWidget.tsx                    # Shared chat component
│       ├── DeployFormInline.tsx               # Inline deploy instructions
│       ├── DeployModal.tsx                   # Deploy code modal
│       ├── InfinityLoader.tsx                # Loading animation
│       └── LoadingBar.tsx                    # Progress bar
│
├── configs/
│   ├── index.ts                              # Config barrel
│   └── proxe.config.ts                       # Brand config (colors, buttons, etc.)
│
├── contexts/
│   └── DeployModalContext.tsx                 # Deploy modal context
│
├── hooks/
│   ├── useChat.ts                            # Chat state management
│   └── useChatStream.ts                      # Streaming response handler
│
├── lib/
│   ├── chatLocalStorage.ts                   # Message persistence
│   ├── chatSessions.ts                       # Session management
│   ├── promptBuilder.ts                      # System prompt builder
│   └── supabase.ts                           # Supabase client
│
├── api/prompts/
│   └── proxe-prompt.ts                       # PROXe system prompt
│
└── styles/themes/                            # Theme styles
```

### Supabase Migrations (`brand/proxe/dashboard/supabase/migrations/`)

```
001_dashboard_schema.sql                      # Base: dashboard_users, settings, invitations
007_rename_sessions_to_all_leads.sql          # Core: all_leads, channel tables, conversations
008_update_unified_leads_view.sql             # View: unified_leads
009_fix_unified_leads_view_rls.sql            # Fix: RLS on unified_leads
010_fix_dashboard_users_rls_recursion.sql     # Fix: RLS recursion
011_lead_scoring_system.sql                   # Feature: lead scoring + stages
012_update_unified_leads_with_scoring.sql     # Update: scoring in view
013_proxe_lead_scoring_schema.sql             # Schema: scoring refinements
014_lead_activities_system.sql                # Feature: lead_activities table
015_proxe_lead_scoring_complete.sql           # Fix: complete scoring system
016_fix_lead_stage_rls_and_columns.sql        # Fix: stage RLS
017_fix_scoring_trigger.sql                   # Fix: scoring trigger
018_disable_auth_requirements.sql             # Config: RLS → USING (true)
019_rename_messages_to_conversations.sql      # Rename: messages → conversations
020_ensure_unified_leads_has_scoring_fields.sql
021_diagnostic_check_unified_vs_all_leads.sql
021_fix_all_leads_rls_and_unified_leads.sql   # (duplicate numbering)
022_backfill_leads_from_sessions.sql
023_knowledge_base.sql                        # Feature: knowledge_base table (latest)
```

---

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 14.2 (App Router)
- **Language**: TypeScript 5.3
- **UI**: React 18.3, Tailwind CSS 3.4
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (currently disabled, RLS open)
- **Real-time**: Supabase Realtime subscriptions
- **AI**: Anthropic Claude SDK (@anthropic-ai/sdk)
- **Charts**: Recharts 2.10
- **Icons**: react-icons (Material Design)
- **Dates**: date-fns
- **Validation**: Zod

### Two-App Architecture
PROXe runs as **two independent Next.js apps** per brand:

| App | Port | Purpose |
|-----|------|---------|
| **Dashboard** | 4000 | Command center — leads, bookings, metrics, inbox, settings, knowledge base |
| **Web Agent** | 4001 | AI chat widget — embeds on customer websites via iframe |

### Key Features
- Multi-channel lead tracking (Web, WhatsApp, Voice, Social)
- Unified lead deduplication by normalized phone + brand
- AI-powered lead scoring (0–100 scale, 3-factor algorithm)
- Lead stage management (New → Engaged → Qualified → High Intent → Booking Made → Converted)
- Cross-channel context awareness (unified_context JSONB)
- Real-time dashboard updates via Supabase Realtime
- Embeddable chat widget (bubble + search bar modes)
- Knowledge base management (PDF, DOC, URL, text)
- Booking management with Google Calendar integration
- Activity logging and audit trails
- Context-aware AI agent (knows customer history across all channels)

---

## Database Schema

### Core Tables

#### `all_leads` — Unified Lead Table
**Purpose**: One record per unique customer (deduplicated by phone + brand)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `customer_name` | TEXT | Customer name |
| `email` | TEXT | Email address |
| `phone` | TEXT | Phone (raw) |
| `customer_phone_normalized` | TEXT | Normalized phone (dedup key) |
| `first_touchpoint` | TEXT | First channel: web/whatsapp/voice/social |
| `last_touchpoint` | TEXT | Most recent channel |
| `last_interaction_at` | TIMESTAMPTZ | Last activity timestamp |
| `brand` | TEXT | DEFAULT 'proxe', CHECK IN ('proxe') |
| `unified_context` | JSONB | Cross-channel context data |
| `lead_score` | INTEGER | 0–100, auto-calculated |
| `lead_stage` | TEXT | New/Engaged/Qualified/High Intent/Booking Made/Converted/Closed Lost/In Sequence/Cold |
| `sub_stage` | TEXT | For High Intent: proposal/negotiation/on-hold |
| `stage_override` | BOOLEAN | Manual override flag |
| `is_manual_override` | BOOLEAN | Manual override marker |
| `is_active_chat` | BOOLEAN | Currently chatting |
| `last_scored_at` | TIMESTAMPTZ | Last score calculation |
| `created_at` | TIMESTAMPTZ | Creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated on change |

**Unique Constraint**: `(customer_phone_normalized, brand)`

**`unified_context` JSONB Structure**:
```json
{
  "web": { "conversation_summary": "...", "user_inputs_summary": {...}, "message_count": 10 },
  "whatsapp": { "conversation_summary": "...", "message_count": 5 },
  "voice": { "call_summary": "...", "duration": 300 },
  "social": { "engagement_summary": "..." },
  "unified_summary": "...",
  "budget": "...",
  "service_interest": "...",
  "pain_points": "..."
}
```

#### Channel-Specific Tables

**`web_sessions`** — Web chat interactions
- References `all_leads(id)` ON DELETE CASCADE
- Key fields: booking_date, booking_time, booking_status, google_event_id, conversation_summary, user_inputs_summary, message_count, session_status (active/completed/abandoned)

**`whatsapp_sessions`** — WhatsApp conversations
- References `all_leads(id)` ON DELETE CASCADE
- Key fields: whatsapp_id, sentiment, response_times

**`voice_sessions`** — Voice call interactions
- References `all_leads(id)` ON DELETE CASCADE
- Key fields: call_duration, transcription, recording_url

**`social_sessions`** — Social media engagements
- References `all_leads(id)` ON DELETE CASCADE
- Key fields: platform, engagement_type, sentiment

**`conversations`** — Universal message log (renamed from `messages`)
- References `all_leads(id)`
- Fields: channel, sender (customer/agent/system), content, message_type, metadata (JSONB)
- Trigger: auto-updates lead_score on new conversations

#### Supporting Tables

**`lead_stage_changes`** — Stage transition audit trail
- lead_id, old_stage, new_stage, old_score, new_score, changed_by, is_automatic, change_reason

**`lead_stage_overrides`** — Manual stage overrides
- lead_id, overridden_stage, overridden_by, override_reason, is_active

**`lead_activities`** — Team-logged activities
- lead_id, activity_type (call/meeting/message/note), note, duration_minutes, next_followup_date, created_by

**`dashboard_users`** — Dashboard user accounts
- Extends Supabase auth.users
- Roles: admin, viewer

**`dashboard_settings`** — Dashboard configuration
- Key-value pairs (JSONB), used for widget_style, etc.

**`user_invitations`** — User invite tokens
- email, token, role, invited_by, expires_at, accepted_at

#### `knowledge_base` — Knowledge Base Items (NEW)
**Purpose**: Stores uploaded documents, scraped URLs, and manual text for AI agent context

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `brand` | TEXT | DEFAULT 'proxe' |
| `type` | TEXT | pdf/doc/url/text |
| `title` | TEXT | Item title |
| `source_url` | TEXT (nullable) | URL source |
| `content` | TEXT (nullable) | Extracted text content |
| `file_name` | TEXT (nullable) | Original filename |
| `file_size` | INTEGER (nullable) | File size in bytes |
| `file_type` | TEXT (nullable) | MIME type |
| `chunks` | JSONB | Chunked text array (for embedding pipeline) |
| `embeddings_status` | TEXT | pending/processing/ready/error |
| `error_message` | TEXT (nullable) | Error details |
| `metadata` | JSONB | Additional metadata |
| `created_at` | TIMESTAMPTZ | Creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

**Indexes**: brand, type, status, created_at DESC, full-text search (GIN) on title + content

### Views

**`unified_leads`** — Aggregated dashboard view combining:
- Base lead info from `all_leads`
- Web data from `web_sessions`
- WhatsApp data from `whatsapp_sessions`
- Voice data from `voice_sessions`
- Social data from `social_sessions`
- Lead scoring fields
- Ordered by `last_interaction_at DESC`

---

## API Routes & Functions

### Dashboard API Routes

#### `/api/dashboard/leads` (GET)
**Purpose**: Fetch paginated leads with filtering

**Query Parameters**: page, limit, source, status, startDate, endDate

**Response**: `{ leads: [...], pagination: { page, limit, total, totalPages } }`

**Details**: Queries `unified_leads` view, ordered by `last_interaction_at DESC`, supports filtering by touchpoint

#### `/api/dashboard/leads/[id]/summary` (GET)
**Purpose**: Get detailed summary for a specific lead including channel-specific data and unified context

#### `/api/dashboard/leads/[id]/stage` (POST)
**Purpose**: Update lead stage

**Body**: `{ stage, sub_stage?, override? }`

**Details**: Updates `all_leads`, logs to `lead_stage_changes`, triggers re-scoring

#### `/api/dashboard/leads/[id]/score` (GET, POST)
**Purpose**: Get/calculate lead score with breakdown

**Response**: `{ score: 75, breakdown: { ai: 45, activity: 20, business: 10 } }`

#### `/api/dashboard/leads/[id]/activities` (GET, POST)
**Purpose**: Get/create activity logs

**POST Body**: `{ activity_type, note, duration_minutes?, next_followup_date? }`

#### `/api/dashboard/leads/[id]/override` (POST)
**Purpose**: Override lead stage manually

#### `/api/dashboard/leads/[id]/status` (POST)
**Purpose**: Update lead status

#### `/api/dashboard/metrics` (GET)
**Purpose**: Dashboard-wide metrics

**Response**: `{ totalConversations, activeConversations, avgResponseTime, conversionRate, leadsByChannel, conversationsOverTime, conversionFunnel, responseTimeTrends }`

#### `/api/dashboard/founder-metrics` (GET)
**Purpose**: Founder-level comprehensive analytics across all channels

#### `/api/dashboard/bookings` (GET)
**Purpose**: List bookings (leads with booking_date/time)

#### `/api/dashboard/channels/[channel]/metrics` (GET)
**Purpose**: Channel-specific metrics (web/whatsapp/voice/social)

#### `/api/dashboard/web/messages` (GET)
**Purpose**: Web channel messages filtered by lead_id

#### `/api/dashboard/whatsapp/messages` (GET)
**Purpose**: WhatsApp messages filtered by lead_id

#### `/api/dashboard/summarize` (POST)
**Purpose**: AI-powered conversation summarization via Claude

#### `/api/dashboard/insights` (GET, POST)
**Purpose**: Dashboard insights and analytics

#### `/api/dashboard/settings/widget-style` (GET, POST)
**Purpose**: Widget style preference (searchbar/bubble)

### Knowledge Base API Routes (NEW)

#### `/api/knowledge-base` (GET)
**Purpose**: List all knowledge base items

**Query Parameters**: type (pdf/doc/url/text), status (pending/processing/ready/error)

**Response**: `{ data: KnowledgeBaseItem[] }`

#### `/api/knowledge-base/text` (POST)
**Purpose**: Add manual text entry

**Body**: `{ title, content }`

**Details**: Inserts with `type: 'text'`, `embeddings_status: 'ready'`

#### `/api/knowledge-base/url` (POST)
**Purpose**: Add URL with basic content scraping

**Body**: `{ url, title? }`

**Details**: Auto-generates title from hostname if not provided. Attempts server-side fetch with 10s timeout, strips HTML tags, stores extracted text. Falls back to `embeddings_status: 'pending'` if fetch fails.

#### `/api/knowledge-base/upload` (POST)
**Purpose**: Upload file (PDF, DOC, DOCX, TXT)

**Body**: multipart/form-data with `file` field

**Details**: 10MB max. TXT files: content extracted inline, status `ready`. PDF/DOC: metadata only stored, status `pending` (text extraction deferred to embedding pipeline).

#### `/api/knowledge-base/[id]` (GET, DELETE)
**Purpose**: Get single item / Delete item

### Lead Scoring API Routes

#### `/api/leads/score` (POST)
**Purpose**: Calculate and update score for a single lead

#### `/api/leads/rescore-all` (POST)
**Purpose**: Batch recalculate scores for all leads

#### `/api/test-scoring` (GET)
**Purpose**: Test scoring algorithm with sample data

### Integration API Routes

#### `/api/integrations/web-agent` (GET, POST)
**Purpose**: Web agent data ingestion. Creates/updates `web_sessions`, links to `all_leads`, updates `unified_context`.

#### `/api/integrations/whatsapp` (POST)
**Purpose**: WhatsApp webhook handler. Creates/updates `whatsapp_sessions`, logs to `conversations`.

#### `/api/integrations/whatsapp/system-prompt` (GET)
**Purpose**: Context-aware system prompt for WhatsApp. Calls `claudeService.getWhatsAppSystemPrompt()` with full cross-channel customer history.

#### `/api/integrations/voice` (POST)
**Purpose**: Voice call integration. Creates/updates `voice_sessions`.

### Utility API Routes

#### `/api/status` (GET)
Health check: `{ status: "ok", timestamp: "..." }`

#### `/api/test-connection` (GET)
Test Supabase connection

#### `/api/diagnostics/supabase` (GET)
Supabase diagnostics (table existence, RLS, etc.)

#### `/api/webhooks/message-created` (POST)
Message creation webhook — logs to `conversations`, triggers score recalculation

#### `/api/debug-auth` (GET)
Debug authentication state

#### `/api/admin/backfill-leads` (POST)
Backfill leads from sessions data

### Web Agent API Routes (port 4001)

#### `/api/chat` (POST)
**Purpose**: Main chat endpoint with Claude streaming

**Details**: Searches 6 knowledge tables (system_prompts, agents, conversation_states, cta_triggers, model_context, chatbot_responses) for context. Streams Claude responses. Generates follow-up suggestion buttons.

#### `/api/chat/summarize` (POST)
**Purpose**: Summarize conversation for lead context

#### `/api/calendar/availability` (GET)
**Purpose**: Get calendar availability slots

#### `/api/calendar/book` (POST)
**Purpose**: Book appointment

#### `/api/calendar/list` (GET)
**Purpose**: List calendar events

---

## Components

### Dashboard Components

#### `DashboardLayout.tsx`
**Purpose**: Main sidebar + layout wrapper for all dashboard pages

**Navigation Structure**:
```
PRIMARY
├── Overview         /dashboard              MdDashboard
├── Conversations    /dashboard/inbox        MdInbox
├── Leads            /dashboard/leads        MdPeople
├── Events           /dashboard/bookings     MdCalendarToday
── divider ──
AUTOMATION
├── Flows            /dashboard/flows        MdAccountTree
├── Audience         /dashboard/audience     MdGroup (coming soon)
── divider ──
SYSTEM
├── Configure        /dashboard/settings     MdSettings
│   ├── Web Agent    /dashboard/settings/web-agent       MdChatBubbleOutline
│   └── Knowledge Base /dashboard/settings/knowledge-base MdMenuBook
├── Billing          /dashboard/billing      MdCreditCard (coming soon)
├── Docs             (coming soon)           MdMenuBook
└── Support          (coming soon)           MdSupport
── divider ──
FOOTER: User avatar, theme toggle, help, status monitor, version
```

**Features**: Collapsible sidebar (auto-collapse after 3–5s), hover expansion, mobile responsive, dark/light mode toggle, amber/gold active indicator, build version display

#### `FounderDashboard.tsx`
Main overview page. Real-time metrics, channel distribution, conversation trends, lead scoring stats, bookings calendar.

#### `LeadsTable.tsx`
Lead list with filtering (source, status, date), pagination, real-time updates via `useRealtimeLeads`, score badges (Hot/Warm/Cold), stage selectors, CSV export.

#### `LeadDetailsModal.tsx`
Detailed lead view: channel tabs, conversation history, activity log, score breakdown, stage management, manual override.

#### `LeadStageSelector.tsx`
Stage dropdown with all stages + sub-stages for High Intent (proposal/negotiation/on-hold).

#### `BookingsCalendar.tsx` + `CalendarView.tsx`
Calendar views: full calendar, upcoming list, monthly view. Filters by booking date/status.

#### `MetricsDashboard.tsx` + `MicroCharts.tsx`
Metrics visualization using Recharts. Mini sparklines for metric cards.

#### `WebMetrics.tsx` + `WhatsAppMetrics.tsx`
Channel-specific metric pages.

#### `ActivityLoggerModal.tsx`
Log activities (call/meeting/message/note) with duration, notes, next follow-up date.

#### `ThemeProvider.tsx`
Dark/light mode context. System preference detection. Theme persistence.

#### `LoadingOverlay.tsx` + `PageTransitionLoader.tsx`
Loading states and route transition animations.

### Knowledge Base Components (NEW)

#### `KnowledgeBase/FileUploader.tsx`
Drag-and-drop file upload zone. Accepts PDF, DOC, DOCX, TXT (10MB max). Upload progress per file with status badges (Uploading/Done/Error). Hidden file input triggered by click.

#### `KnowledgeBase/UrlInput.tsx`
URL input field + optional title input. Basic URL validation. Submit button posts to `/api/knowledge-base/url`.

#### `KnowledgeBase/TextInput.tsx`
Title input + textarea for content. Character count display. Posts to `/api/knowledge-base/text`.

#### `KnowledgeBase/KnowledgeList.tsx`
Table component: columns Type, Title, Source, Status, Created, Actions. Loading spinner, error state, empty state with guidance text.

#### `KnowledgeBase/KnowledgeItem.tsx`
Single table row. Type icon (PDF=red, DOC=blue, URL=purple, Text=green). Status badge (Pending=blue, Processing=amber+pulse, Ready=green, Error=red). Relative date display. Delete button with confirmation.

### Web Agent Components

#### `ChatWidget.tsx` (1000+ lines)
Main chat widget. Handles streaming, message history (localStorage), sessions, booking integration, knowledge base search, follow-up suggestions, quick action buttons, Lottie animations.

**Two display modes**:
- **Bubble mode**: Floating 80×80px button, opens modal on click
- **Full modal mode**: Full-screen chat interface

#### Shared Components
- `BookingCalendarWidget.tsx` — Cal.com embed
- `DeployModal.tsx` — Embed code snippet display
- `DeployFormInline.tsx` — Inline deployment instructions
- `InfinityLoader.tsx` / `LoadingBar.tsx` — Loading animations

---

## Libraries & Utilities

### `lib/leadScoreCalculator.ts`
**Exports**: `calculateLeadScore(leadData: Lead): Promise<CalculatedScore>`

**Algorithm** (0–100 scale):

| Factor | Weight | Details |
|--------|--------|---------|
| **AI Analysis** | 60% | Intent signals (40%), Sentiment (30%), Buying signals (30%) |
| **Activity** | 30% | Message count, response rate, recency, channel mix bonus |
| **Business** | 10% | Booking exists (+10), contact info (+5), multi-touchpoint (+5) |

**Stage Assignment**: ≥86 Booking Made, ≥61 High Intent, ≥31 Qualified, active chat → Engaged, <61 In Sequence, default New

### `lib/supabase/client.ts`
Browser-side Supabase client. Singleton pattern. Supports `NEXT_PUBLIC_PROXE_SUPABASE_*` and standard env vars. Auth disabled (`persistSession: false`).

### `lib/supabase/server.ts`
Server-side Supabase client via `@supabase/ssr`. Cookie-based session management. Async `createClient()`.

### `lib/supabase/middleware.ts`
Auth session refresh middleware. Updates cookies on every request.

### `lib/utils.ts`
`cn()` (class merge via clsx + tailwind-merge), `formatDate()`, `formatDateTime()`, `formatTime()`

### `lib/buildInfo.ts`
Reads `NEXT_PUBLIC_BUILD_TIME` env var. Formats in IST timezone.

### `services/claudeService.js`
Context-aware WhatsApp prompt builder.

**Exports**:
- `fetchCustomerContext(phone, brand, supabase)` — Fetches lead + all channel summaries
- `buildSystemPrompt(context, customerName)` — Builds prompt with cross-channel history
- `getWhatsAppSystemPrompt(phone, customerName, brand, supabase)` — Main entry point
- `extractTopics(summary)` — Topic extraction from summaries
- `formatBookingDate(dateString, timeString)` — Date formatting

### Web Agent Libraries

#### `lib/promptBuilder.ts`
Builds context-aware system prompts. Integrates with Supabase for customer history across channels.

#### `lib/chatLocalStorage.ts`
Persists chat messages to localStorage per session.

#### `lib/chatSessions.ts`
Session creation, tracking, and management.

#### `configs/proxe.config.ts`
Brand configuration:
```typescript
{
  name: 'PROXe',
  brand: 'proxe',
  colors: { /* Purple palette */ },
  quickButtons: ['What\'s PROXe', 'Deploy PROXe', 'PROXe Pricing', 'Book a Demo'],
  followUpButtons: ['Schedule a Call', 'Book a Demo', 'Deploy PROXe', ...],
  chatStructure: { showQuickButtons: true, showFollowUpButtons: true, maxFollowUps: 3 }
}
```

---

## Hooks

### `useRealtimeLeads`
Real-time lead updates via Supabase postgres_changes on `all_leads`. Falls back to `unified_leads` view if RLS blocks. Auto-refetches on INSERT/UPDATE/DELETE. Maps field variations (`customer_name` / `name`).

```typescript
const { leads, loading, error } = useRealtimeLeads()
```

### `useRealtimeMetrics`
Fetches from `/api/dashboard/metrics`. Polls every 30 seconds.

```typescript
const { metrics, loading, error } = useRealtimeMetrics()
```

### Web Agent Hooks

#### `useChat`
Chat state management: messages array, sending state, session tracking.

#### `useChatStream`
Handles streaming Claude responses. Token-by-token updates.

---

## Configuration

### Next.js Configuration

**PROXe Dashboard** (`next.config.js`):
- React Strict Mode: Enabled
- CORS headers for `https://goproxe.com`

**PROXe Web Agent** (`next.config.js`):
- Output: standalone

### Package Dependencies

**Dashboard** (`package.json`):
- Port: 4000
- next: ^14.2.18, react: ^18.3.0, @supabase/supabase-js: ^2.39.0, @supabase/ssr: ^0.1.0, @anthropic-ai/sdk: ^0.71.0, recharts: ^2.10.3, date-fns: ^3.0.6, zod: ^3.22.4, react-icons: ^4.12.0

**Web Agent** (`package.json`):
- Port: 4001
- next: ^14.2.35, @anthropic-ai/sdk: ^0.68.0, @calcom/embed-react, lottie-react, motion

### Environment Variables

**Required**:
- `NEXT_PUBLIC_SUPABASE_URL` (or `NEXT_PUBLIC_PROXE_SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`
- `NEXT_PUBLIC_BUILD_TIME` (auto-set during build)

**Optional**:
- `PORT` (default: 4000 dashboard, 4001 web-agent)
- `NODE_ENV`
- `NEXT_PUBLIC_WEB_AGENT_URL`

### Tailwind Configuration
- Content: `src/**/*.{js,ts,jsx,tsx}`
- Dark mode: class-based
- CSS Variables: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-hover`, `--accent-primary`, `--accent-subtle`, `--accent-light`, `--text-primary`, `--text-secondary`, `--border-primary`

### Theme System
```javascript
const ACCENT_THEMES = [
  { id: 'proxe', name: 'PROXe Purple', color: '#8B5CF6' },
  { id: 'gold', name: 'Electric Lime', color: '#afd510' },
  { id: 'orange', name: 'Sunset Orange', color: '#fc7301' },
  { id: 'grey', name: 'Neutral Grey', color: '#6B7280' },
]
```

---

## Multi-Brand Architecture

### Repository Structure
Three brands share the same repo but are completely independent:

| Brand | Dashboard Port | Web Agent Port | Supabase Project |
|-------|---------------|----------------|------------------|
| **PROXe** | 4000 | 4001 | Separate |
| **Windchasers** | 4002 (dev) / 3003 (prod) | 4003 (dev) / 3001 (prod) | Separate |
| **Master** | 4100 | 4101 | Template |

### Brand Separation Principles
1. **Complete Independence**: Each brand has its own `build/`, `package.json`, Supabase project, env vars
2. **No shared code** between brands
3. **Independent deployments** via separate GitHub Actions workflows

### Root package.json Scripts
```json
{
  "dev:proxe": "Run PROXe dashboard + web-agent concurrently",
  "dev:proxe-dash": "cd brand/proxe/dashboard/build && npm run dev",
  "dev:proxe-agent": "cd brand/proxe/web-agent && npm run dev",
  "dev:windchasers": "Run Windchasers dashboard + web-agent",
  "build": "npm run build:proxe && npm run build:windchasers",
  "build:proxe": "cd brand/proxe/dashboard/build && npm run build",
  "build:windchasers": "cd brand/windchasers/dashboard/build && npm run build",
  "kill-ports": "Kill all dev server ports"
}
```

### Windchasers Differences
- ESLint disabled during builds (`ignoreDuringBuilds: true`)
- Webpack server-side chunk splitting disabled
- CORS: `Access-Control-Allow-Origin: *`
- Has bubble widget embed system (`/widget/bubble/`)
- Extended migrations (023–028: auto-create triggers, backfill, test data)
- Brand color: `#C9A961` (gold)

---

## Deployment

### PM2 Configuration

| App | PM2 Name | Port | Memory | VPS Path |
|-----|----------|------|--------|----------|
| PROXe Dashboard | `proxe-dashboard` | 4000 | 1GB | `/var/www/proxe-dashboard/` |
| Windchasers Dashboard | `windchasers-dashboard` | 3003 | 1GB | `/var/www/windchasers-proxe/` |
| Windchasers Web Agent | `windchasers-web-agent` | 3001 | 512MB | `/var/www/windchasers-web-agent/` |

### GitHub Actions Workflows

**PROXe Dashboard** (`.github/workflows/deploy-proxe-dashboard.yml`):
- Triggers: Push to `production`/`main` on `brand/proxe/build/**`
- Steps: Checkout → Node 20 → Set build time → SSH → Rsync → npm ci → build → PM2 restart → health check → Supabase verify

**Windchasers Dashboard** (`.github/workflows/deploy-windchasers-dashboard.yml`):
- Same flow with Windchasers-specific env vars and PM2 name

**Windchasers Web Agent** (`.github/workflows/deploy-windchasers-web-agent.yml`):
- Health check via `/widget` endpoint

### Build Verification
All workflows verify:
1. `.next/BUILD_ID` exists
2. `.next/static/chunks/` has 30+ chunk files
3. CSS files present
4. Build manifest exists

### Health Check Endpoints
- Dashboard: `/api/health` → fallback `/health` (5 retries, 3s delay)
- Web Agent: `/widget`
- Supabase: `/api/status` verifies `canReachSupabase: true`

---

## Scripts

### Build Scripts (`brand/proxe/dashboard/build/scripts/`)
- `set-build-time.js` — Sets `NEXT_PUBLIC_BUILD_TIME` in `.env.local` (prebuild hook)
- `create-admin-user.js` — Create admin user: `node scripts/create-admin-user.js <email> <password>`
- `seed-admin.sql` — SQL seed for admin user
- `create-admin-user.sql` — SQL template for admin creation
- `fix-user-creation.sql` — Fix user creation trigger issues

### Root Scripts (`scripts/`)
- `sync-master-to-brand.sh` — Sync master template to brand directories
- `kill-build-ports.sh` — Kill all dev server ports
- `kill-port.sh` — Kill a specific port
- `fix-nextjs-error.sh` — Fix common Next.js errors
- `brand.config.template.ts` — Brand config template

---

## AI Prompts & System Prompts

### PROXe System Prompt
**Location**: `brand/proxe/web-agent/src/api/prompts/proxe-prompt.ts`

**Core Identity**: AI system that ensures every potential customer becomes an actual opportunity

**Rules**:
- Max 2 sentences per response
- Double line breaks between paragraphs
- Honest, direct (no BS, no emojis)
- Step-by-step lead qualification

**First Message**: "Hey! I'm PROXe. How can I help?"

**Pricing**: Starter ($99/month), Pro ($249/month)

**Differentiators**:
- vs Chatbots: "Chatbots answer questions. PROXe puts every potential customer into an intuitive flow."
- vs CRMs: "CRMs store customer data. PROXe acts on it."

**Core Capabilities**: 24/7 lead capture, cross-channel memory, auto-booking, unified inbox

### Windchasers System Prompt
**Location**: `brand/windchasers/web-agent/build/src/api/prompts/windchasers-prompt.ts`

**Core Identity**: Honest, warm aviation career advisor (Sumaiya's Voice)

**Rules**: Max 2 sentences, no emojis, no sales-y language, always honest about costs (₹40–75L) and timelines (18–24 months)

**Qualification Flow**: User Type → Education → Timeline → Course Interest

**Programs**: CPL, Helicopter License, Cabin Crew, Drone Pilot

### Context-Aware WhatsApp Prompts (`services/claudeService.js`)
Fetches customer history from all channels and builds personalized prompts. If customer chatted on web, the WhatsApp agent knows their questions, interests, and booking status.

---

## Type Definitions

### Core Types (`src/types/index.ts`)

```typescript
type LeadStage = 'New' | 'Engaged' | 'Qualified' | 'High Intent' | 'Booking Made' | 'Converted' | 'Closed Lost' | 'In Sequence' | 'Cold'

type HighIntentSubStage = 'proposal' | 'negotiation' | 'on-hold'

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

type KnowledgeBaseType = 'pdf' | 'doc' | 'url' | 'text'
type EmbeddingsStatus = 'pending' | 'processing' | 'ready' | 'error'

interface KnowledgeBaseItem {
  id: string
  brand: string
  type: KnowledgeBaseType
  title: string
  source_url: string | null
  content: string | null
  file_name: string | null
  file_size: number | null
  file_type: string | null
  chunks: any
  embeddings_status: EmbeddingsStatus
  error_message: string | null
  metadata: any
  created_at: string
  updated_at: string
}

type UserRole = 'admin' | 'viewer'

interface DashboardUser {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
  last_login: string | null
  is_active: boolean
}
```

---

## Security & Authentication

### Current State
- Authentication is **disabled** (commented out in API routes and middleware)
- RLS policies use `USING (true)` (open access, set in migration 018)
- Supabase client uses `persistSession: false`

### Authentication Flow (when enabled)
1. User visits dashboard → middleware checks session
2. No session → redirect to `/auth/login`
3. Login via Supabase Auth → session stored in cookies
4. Server layout (`dashboard/layout.tsx`) validates session via `supabase.auth.getUser()`
5. Handles rate-limiting (429) with degraded experience

### RLS Policies
All tables have RLS enabled. Current policies: open (`USING (true)`). When auth is re-enabled, policies will restrict by `auth.role() = 'authenticated'` with admin/viewer role separation.

### API Security
- CORS configured for `https://goproxe.com`
- Input validation with Zod (where implemented)
- File upload size limit: 10MB
- URL scraping timeout: 10s

---

## API Endpoint Summary

### Dashboard (port 4000)
```
GET    /api/dashboard/leads                    List leads (paginated)
GET    /api/dashboard/leads/[id]/summary       Lead details
POST   /api/dashboard/leads/[id]/stage         Update stage
GET    /api/dashboard/leads/[id]/score         Get score
POST   /api/dashboard/leads/[id]/score         Calculate score
GET    /api/dashboard/leads/[id]/activities    List activities
POST   /api/dashboard/leads/[id]/activities    Create activity
POST   /api/dashboard/leads/[id]/override      Override stage
POST   /api/dashboard/leads/[id]/status        Update status
GET    /api/dashboard/metrics                  Dashboard metrics
GET    /api/dashboard/founder-metrics          Founder metrics
GET    /api/dashboard/bookings                 List bookings
GET    /api/dashboard/channels/[ch]/metrics    Channel metrics
GET    /api/dashboard/web/messages             Web messages
GET    /api/dashboard/whatsapp/messages        WhatsApp messages
POST   /api/dashboard/summarize                AI summarize
GET    /api/dashboard/insights                 Insights
POST   /api/dashboard/insights                 Create insight
GET    /api/dashboard/settings/widget-style    Get widget style
POST   /api/dashboard/settings/widget-style    Set widget style

GET    /api/knowledge-base                     List KB items
POST   /api/knowledge-base/text                Add text entry
POST   /api/knowledge-base/url                 Add URL
POST   /api/knowledge-base/upload              Upload file
GET    /api/knowledge-base/[id]                Get KB item
DELETE /api/knowledge-base/[id]                Delete KB item

POST   /api/leads/score                        Calculate score
POST   /api/leads/rescore-all                  Batch rescore
GET    /api/test-scoring                       Test scoring

POST   /api/integrations/web-agent             Web agent data
POST   /api/integrations/whatsapp              WhatsApp webhook
GET    /api/integrations/whatsapp/system-prompt Context-aware prompt
POST   /api/integrations/voice                 Voice data

POST   /api/webhooks/message-created           Message webhook
POST   /api/admin/backfill-leads               Backfill leads
POST   /api/auth/invite                        Send invite
POST   /api/auth/sync-session                  Sync session

GET    /api/status                             Health check
GET    /api/test-connection                    Test Supabase
GET    /api/diagnostics/supabase               Diagnostics
GET    /api/debug-auth                         Debug auth
```

### Web Agent (port 4001)
```
POST   /api/chat                               Chat streaming (Claude)
POST   /api/chat/summarize                     Summarize conversation
GET    /api/calendar/availability              Calendar slots
POST   /api/calendar/book                      Book appointment
GET    /api/calendar/list                      List events
```

### Dashboard Pages
```
/                                              Landing page
/auth/login                                    Login
/auth/signup                                   Signup
/auth/accept-invite                            Accept invitation
/admin                                         Admin panel
/status                                        Status page
/dashboard                                     Overview (FounderDashboard)
/dashboard/inbox                               Conversations
/dashboard/leads                               Leads management
/dashboard/bookings                            Events / Calendar
/dashboard/flows                               Flows (automation)
/dashboard/audience                            Audience (coming soon)
/dashboard/metrics                             Metrics analytics
/dashboard/marketing                           Marketing tools
/dashboard/channels/web                        Web channel
/dashboard/channels/whatsapp                   WhatsApp channel
/dashboard/channels/voice                      Voice channel
/dashboard/channels/social                     Social channel
/dashboard/settings                            Configure (theme, widget)
/dashboard/settings/web-agent                  Web Agent settings
/dashboard/settings/knowledge-base             Knowledge Base management
```

---

## Performance & Error Handling

### Database Optimization
- Indexes on frequently queried columns (touchpoints, brand, dates, scores)
- GIN index on `unified_context` JSONB
- Full-text search GIN index on `knowledge_base` (title + content)
- Composite unique constraint for lead deduplication

### Frontend Optimization
- React Server Components for layouts and auth
- Client Components only for interactive UI
- Real-time subscriptions (not polling) for leads
- Pagination for large lists
- Singleton Supabase client (browser)

### Error Handling Pattern
```json
// API responses on error
{ "error": "User-facing message", "details": "Dev-only details (production omitted)" }
```
- Try-catch in all API routes
- Dev vs prod error detail levels
- RLS fallback logic (all_leads → unified_leads)
- Graceful degradation for rate-limited auth (429)

---

## Version Information

**Current Version**: 1.0.0

**Build Date**: Auto-set via `NEXT_PUBLIC_BUILD_TIME`

**Last Updated**: February 24, 2026

**Recent Updates**:
- ✅ Knowledge Base feature added (UI + API + Supabase table)
- ✅ Knowledge Base sidebar navigation under Configure
- ✅ File upload (PDF/DOC/TXT), URL scraping, manual text entry
- ✅ Knowledge items table with status badges
- ✅ Multi-brand architecture documented
- ✅ All deployment workflows documented
- ✅ Build configuration details (ESLint, TypeScript, Webpack)
- ✅ AI prompts documented (PROXe and Windchasers)
- ✅ Complete file system structure documented

**Next Phase**: Embedding pipeline for knowledge base (PDF text extraction, chunking, vector embeddings)
