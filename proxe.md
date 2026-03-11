# PROXe — Build Truth

**Last updated:** March 2026

PROXe is a multi-brand AI agent platform. One codebase powers web chat, WhatsApp, and voice across multiple brands, each with its own database, theme, prompts, and deployment.

---

## How It Works (30-Second Version)

```
master/agent/src/  ──sync──►  brands/{brand}/agent/src/  ──deploy──►  VPS (PM2 + Nginx)
                                     + .env.local (secrets)
                                     + public/ (brand logos)
```

1. All code lives in `master/agent/src/`
2. `npm run sync` copies it to every brand
3. Each brand has its own `.env.local`, Supabase project, and public assets
4. GitHub Actions deploy each brand independently to VPS

---

## Repository Structure

```
PROXe/
├── master/                        Source of truth
│   ├── agent/                     Unified Next.js 14 app
│   │   ├── src/
│   │   │   ├── app/               App Router (pages + API routes)
│   │   │   ├── components/        Dashboard + Widget UI
│   │   │   ├── configs/           Brand configs + system prompts
│   │   │   ├── contexts/          React contexts
│   │   │   ├── hooks/             useChat, useChatStream, useRealtimeLeads
│   │   │   ├── lib/
│   │   │   │   ├── agent-core/    Channel-agnostic AI engine
│   │   │   │   ├── services/      Session, lead, booking, context logic
│   │   │   │   └── supabase/      Client/server/middleware helpers
│   │   │   ├── styles/            Theme CSS variables
│   │   │   └── types/             TypeScript definitions
│   │   ├── public/                Static assets
│   │   ├── package.json
│   │   ├── next.config.js
│   │   └── tailwind.config.ts
│   ├── nginx/                     Nginx config template
│   ├── supabase/                  Supabase reference
│   └── BRAND-ONBOARDING.md        New brand setup guide
│
├── brands/                        Deployed instances (synced from master)
│   ├── windchasers/               Aviation training academy
│   │   ├── agent/                 Synced src + brand .env.local
│   │   ├── nginx/
│   │   └── supabase/migrations/   31 migration files
│   ├── proxe/                     PROXe AI platform brand
│   │   ├── agent/
│   │   ├── nginx/
│   │   └── supabase/migrations/   24 migration files
│   └── bcon/                      BCON Club consulting
│       ├── agent/
│       └── nginx/
│
├── scripts/                       Automation
│   ├── sync-master-to-brand.sh    Master → one brand
│   ├── sync-brand-to-master.sh    Brand → master (reverse)
│   ├── sync-all-brands.sh         Master → all brands
│   ├── kill-build-ports.sh        Kill dev server ports
│   └── kill-port.sh               Kill specific port
│
├── docs/                          System documentation
├── .github/workflows/             CI/CD (deploy-windchasers, deploy-proxe, deploy-bcon)
├── package.json                   Root orchestrator
└── proxe.md                       This file
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.3 |
| UI | React 18, Tailwind CSS 3.4 |
| Database | Supabase (PostgreSQL per brand) |
| AI | Anthropic Claude SDK (`@anthropic-ai/sdk ^0.71.0`) |
| Charts | Recharts 2.10 |
| Calendar | Google Calendar API (googleapis) |
| Knowledge Base | pdf-parse, mammoth (DOCX), unpdf |
| Process Manager | PM2 (VPS) |
| Reverse Proxy | Nginx |
| CI/CD | GitHub Actions |

---

## Architecture

### Unified Agent — One App, All Channels

```
Website (embed.js)    WhatsApp (webhook)    Voice    Social DMs
       │                     │                │           │
       ▼                     ▼                ▼           ▼
┌──────────────────────────────────────────────────────────────┐
│                    UNIFIED AGENT (Next.js 14)                │
│                                                              │
│  lib/agent-core/         Channel-agnostic AI brain           │
│    engine.ts             Orchestrator: AgentInput → Output   │
│    claudeClient.ts       Claude API (stream + sync)          │
│    promptBuilder.ts      Channel-aware system prompts        │
│    knowledgeSearch.ts    RAG search (Supabase vectors)       │
│    intentExtractor.ts    User type, course, timeline         │
│    followUpGenerator.ts  Suggested response buttons          │
│    summarizer.ts         Conversation summarization          │
│                                                              │
│  lib/services/           Shared business logic               │
│    sessionManager.ts     Session CRUD (web/WA/voice)         │
│    leadManager.ts        Lead creation + phone dedup         │
│    conversationLogger.ts Message logging + summaries         │
│    bookingManager.ts     Google Calendar integration         │
│    contextBuilder.ts     Cross-channel context assembly      │
│    supabase.ts           Service-role Supabase client        │
│                                                              │
│  configs/                Brand identity                      │
│    index.ts              Config loader (env + hostname)      │
│    proxe.config.ts       PROXe colors, buttons, avatar      │
│    brand.config.ts       Windchasers config                  │
│    bcon.config.ts        BCON Club config                    │
│    prompts/              System prompts per brand            │
└──────────────────────────────────────────────────────────────┘
                            │
                   Supabase (per-brand DB)
```

### Key Design Decisions

- **Channel-agnostic core**: `engine.ts` takes `AgentInput`, returns `AgentOutput` — no HTTP/SSE knowledge
- **Client-safe widget**: Widget uses `fetch()` to API routes, never imports server-only modules (googleapis, fs)
- **CSS scoping**: Widget uses `data-theme` attribute for style isolation from dashboard
- **Brand detection**: `NEXT_PUBLIC_BRAND_ID` env var → hostname fallback → defaults to windchasers
- **Static env access**: `NEXT_PUBLIC_*` vars must use static string keys (Next.js build-time inlining)
- **Backward-compat stubs**: `/api/chat` proxies to `/api/agent/web/chat` for old embed scripts

---

## Active Brands

| Brand | Slug | Theme | Dev Port | Prod Port | Domain |
|---|---|---|---|---|---|
| Windchasers | `windchasers` | Gold/Brown (aviation-gold) | 4000 | 3003 | proxe.windchasers.in |
| PROXe | `proxe` | Purple (proxe-purple) | 4001 | 3000 | — |
| BCON Club | `bcon` | Electric Purple (bcon-electric) | 4003 | 3005 | proxe.bconclub.com |
| Master | — | — | 4002 | — | — |

---

## API Endpoints

### Agent Routes (AI-Powered)

| Endpoint | Method | Channel | Response |
|---|---|---|---|
| `/api/agent/web/chat` | POST | Web | SSE stream (`chunk`, `followUps`, `done`) |
| `/api/agent/whatsapp/webhook` | POST | WhatsApp | JSON (stores incoming message) |
| `/api/agent/whatsapp/respond` | POST | WhatsApp | JSON (AI response, plain text) |
| `/api/agent/whatsapp/meta` | POST | WhatsApp | Meta Cloud API webhook |
| `/api/agent/calendar/book` | POST | Any | JSON (Google Calendar event) |
| `/api/agent/calendar/availability` | POST | Any | JSON (available time slots) |
| `/api/agent/summarize` | POST | Any | JSON (conversation summary) |

### Dashboard Routes

| Endpoint | Purpose |
|---|---|
| `/api/dashboard/leads` | Lead list, search, pagination, filters |
| `/api/dashboard/leads/[id]/summary` | Full lead detail with channel data |
| `/api/dashboard/leads/[id]/stage` | Update lead stage |
| `/api/dashboard/leads/[id]/score` | Lead score breakdown |
| `/api/dashboard/leads/[id]/activities` | Activity log CRUD |
| `/api/dashboard/metrics` | Overall dashboard metrics |
| `/api/dashboard/channels/[channel]/metrics` | Per-channel analytics |
| `/api/dashboard/bookings` | Calendar bookings |
| `/api/dashboard/founder-metrics` | Executive dashboard (30s cache) |
| `/api/dashboard/insights` | Analytics insights |
| `/api/dashboard/web/messages` | Web chat messages |
| `/api/dashboard/whatsapp/messages` | WhatsApp messages |
| `/api/dashboard/summarize` | Conversation summaries |
| `/api/dashboard/settings/widget-style` | Widget styling config |

### Knowledge Base Routes

| Endpoint | Purpose |
|---|---|
| `/api/knowledge-base` | List/create knowledge items |
| `/api/knowledge-base/upload` | File upload (PDF, DOCX) |
| `/api/knowledge-base/text` | Text input |
| `/api/knowledge-base/url` | URL ingestion |
| `/api/knowledge-base/[id]` | Get/delete item |
| `/api/knowledge-base/[id]/reprocess` | Reprocess embeddings |

### Widget Routes

| URL | Purpose |
|---|---|
| `/widget` | Full-page chat widget |
| `/widget/bubble` | Floating bubble mode (for iframe) |
| `/api/widget/embed.js` | JavaScript embed script for websites |

### Auth Routes

| Endpoint | Purpose |
|---|---|
| `/auth/login` | Login page |
| `/auth/signup` | Signup page |
| `/auth/accept-invite` | Invitation acceptance |
| `/api/auth/callback` | OAuth callback |
| `/api/auth/logout` | Logout handler |
| `/api/auth/invite` | Invite generation |
| `/api/auth/sync-session` | Session sync |

### Backward-Compat Stubs

| Old URL | Proxies To |
|---|---|
| `/api/chat` | `/api/agent/web/chat` |
| `/api/chat/summarize` | `/api/agent/summarize` |
| `/api/calendar/*` | `/api/agent/calendar/*` |
| `/api/integrations/whatsapp` | `/api/agent/whatsapp/webhook` |

### Utility Routes

| Endpoint | Purpose |
|---|---|
| `/api/health` | Health check |
| `/api/status` | System status |
| `/api/status/error-logs` | Error log viewer |
| `/api/build-info` | Build timestamp + version |
| `/api/leads/score` | Rescore a lead |
| `/api/leads/rescore-all` | Batch rescore (requires CRON_SECRET) |

---

## Dashboard Pages

| Route | Purpose |
|---|---|
| `/dashboard` | Main overview (FounderDashboard) |
| `/dashboard/leads` | Leads management table |
| `/dashboard/metrics` | Analytics charts |
| `/dashboard/bookings` | Calendar view |
| `/dashboard/inbox` | Conversation inbox |
| `/dashboard/channels/web` | Web chat analytics |
| `/dashboard/channels/whatsapp` | WhatsApp analytics |
| `/dashboard/channels/voice` | Voice channel analytics |
| `/dashboard/channels/social` | Social DM analytics |
| `/dashboard/settings` | Configuration |
| `/dashboard/settings/knowledge-base` | RAG document management |
| `/dashboard/settings/web-agent` | Web widget configuration |
| `/dashboard/settings/sequences` | Automation sequences |
| `/dashboard/audience` | Audience segmentation |
| `/dashboard/flows` | Workflow builder |
| `/dashboard/status` | System status |

---

## Database Schema

Each brand has its own Supabase project. Key tables:

### Core Tables

| Table | Purpose | Dedup Key |
|---|---|---|
| `all_leads` | Unified lead records | `customer_phone_normalized` + `brand` |
| `web_sessions` | Web chat sessions | `session_id` |
| `whatsapp_sessions` | WhatsApp sessions | `whatsapp_id` |
| `voice_sessions` | Voice call sessions | — |
| `social_sessions` | Social media sessions | — |
| `conversations` | All messages (cross-channel) | — |
| `lead_stage_changes` | Stage transition audit log | — |
| `activities` | Team-logged activities | — |

### Auth & Config

| Table | Purpose |
|---|---|
| `dashboard_users` | Admin accounts (role: admin/viewer) |
| `user_invitations` | Invite tokens |
| `dashboard_settings` | Key-value configuration |
| `widget_settings` | Widget style preferences |
| `error_logs` | Application error logging |

### Knowledge Base

| Table | Purpose |
|---|---|
| `knowledge_base` | Documents (PDF, URL, text) |
| `knowledge_base_chunks` | Vector-searchable chunks with embeddings |

### Lead Schema (all_leads)

```sql
all_leads (
  id UUID PRIMARY KEY,
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  customer_phone_normalized TEXT,       -- dedup key
  first_touchpoint TEXT,                -- web | whatsapp | voice | social
  last_touchpoint TEXT,
  last_interaction_at TIMESTAMPTZ,
  brand TEXT,                           -- proxe | windchasers | bcon
  unified_context JSONB,               -- cross-channel data, brand-specific fields
  lead_score INTEGER (0-100),
  lead_stage TEXT,                      -- New | Engaged | Qualified | High Intent | Booking Made | Converted | Cold
  sub_stage TEXT,                       -- proposal | negotiation | on-hold
  stage_override BOOLEAN,
  is_active_chat BOOLEAN,
  response_count INTEGER,
  days_inactive INTEGER,
  total_touchpoints INTEGER,
  UNIQUE(customer_phone_normalized, brand)
)
```

### Lead Stages

| Stage | Score Range | Meaning |
|---|---|---|
| New | 0–20 | Initial contact |
| Engaged | 21–40 | Active conversation |
| Qualified | 41–60 | Shows interest, gave contact info |
| High Intent | 61–80 | Pricing/timeline discussions |
| Booking Made | 81–90 | Appointment scheduled |
| Converted | 91–100 | Purchase/enrollment completed |
| Cold | N/A | 30+ days inactive |
| Closed Lost | N/A | Explicit rejection |

### Lead Score Formula

**Total = (AI × 0.6) + (Activity × 0.3) + (Business × 0.1)**

- **AI Score (60%)**: Intent keywords (40%) + Sentiment (30%) + Buying signals (30%)
- **Activity Score (30%)**: Message count + Response rate + Recency + Channel mix bonus
- **Business Score (10%)**: Booking exists (+10) + Contact provided (+5) + Multi-channel (+5)

---

## Components

### Dashboard (25+ files)

| Component | Purpose |
|---|---|
| `DashboardLayout.tsx` | Main layout with sidebar |
| `LeadsTable.tsx` | Leads list + pagination |
| `LeadDetailsModal.tsx` | Lead detail view |
| `LeadStageSelector.tsx` | Stage/status dropdown |
| `MetricsDashboard.tsx` | Analytics overview |
| `WebMetrics.tsx` | Web channel analytics |
| `WhatsAppMetrics.tsx` | WhatsApp analytics |
| `MicroCharts.tsx` | Sparkline chart components |
| `BookingsCalendar.tsx` | Calendar integration |
| `CalendarView.tsx` | Calendar UI |
| `KnowledgeBase/` | RAG document management (5 files) |
| `FounderDashboard.tsx` | Executive overview |
| `ThemeProvider.tsx` | Brand theme context |
| `ActivityLoggerModal.tsx` | Activity timeline |
| `ErrorLogsModal.tsx` | Error viewer |
| `LoadingOverlay.tsx` | Loading indicator |

### Widget (6 files)

| Component | Purpose |
|---|---|
| `ChatWidget.tsx` | Main chat UI |
| `BookingCalendarWidget.tsx` | In-chat calendar booking |
| `DeployModal.tsx` | Deployment guide |
| `DeployFormInline.tsx` | Deploy embed code form |
| `InfinityLoader.tsx` | Loading animation |

### Hooks

| Hook | Purpose |
|---|---|
| `useChat.ts` | Chat session management |
| `useChatStream.ts` | SSE streaming connection |
| `useRealtimeLeads.ts` | Real-time lead sync (Supabase) |
| `useRealtimeMetrics.ts` | Real-time metrics sync |

---

## Brand Configuration

Each brand is defined in `src/configs/{brand}.config.ts`. The config interface:

```typescript
interface BrandConfig {
  name: string;                        // Display name
  brand: string;                       // Slug
  colors: { /* 50+ CSS variables */ };
  quickButtons: string[];              // Shown on chat open
  exploreButtons: string[];            // Category buttons
  followUpButtons: string[];           // Follow-up suggestions
  firstMessageButtons?: string[];      // After first AI response
  chatStructure: {
    showQuickButtons: boolean;
    showFollowUpButtons: boolean;
    maxFollowUps: number;
    avatar: { type: 'logo'|'icon'|'image'; source?: string };
  };
  systemPrompt: { path?: string; getPrompt?: Function };
  styles?: { themePath?: string };
}
```

Brand detection order: `NEXT_PUBLIC_BRAND_ID` → `NEXT_PUBLIC_BRAND` → hostname → fallback (windchasers).

---

## Environment Variables

Each brand's `brands/{brand}/agent/.env.local`:

```env
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Claude AI (REQUIRED)
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5-20251001

# Brand Identity (REQUIRED)
NEXT_PUBLIC_BRAND_ID=windchasers|proxe|bcon
NEXT_PUBLIC_APP_URL=https://proxe.yourdomain.com

# Google Calendar (optional — Windchasers uses this)
GOOGLE_CALENDAR_ID=xxx@group.calendar.google.com
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# WhatsApp — Meta Cloud API (optional)
META_WHATSAPP_ACCESS_TOKEN=...
META_WHATSAPP_PHONE_NUMBER_ID=...
META_WHATSAPP_VERIFY_TOKEN=...

# Scoring (optional)
CRON_SECRET=xxx
```

**Critical**: `NEXT_PUBLIC_*` variables are baked in at build time. Must use static string keys — dynamic `process.env[\`NEXT_PUBLIC_${brand}\`]` does NOT work client-side.

---

## Development

### Quick Start

```bash
# Run all 3 brands concurrently
npm run dev

# Run one brand
npm run dev:windchasers    # port 4000
npm run dev:proxe          # port 4001
npm run dev:bcon           # port 4003
npm run dev:master         # port 4002 (template)
```

### Workflow: Making Changes

```
1. Edit in master/agent/src/         ← all code changes here
2. npm run dev:master                ← test locally (port 4002)
3. npm run sync                      ← push master → all brands
4. npm run build                     ← build all brands
5. git add + commit + push
```

### Sync Behavior

`scripts/sync-master-to-brand.sh` copies:
- `src/`, `public/`, `next.config.js`, `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`

Preserves (never overwritten):
- `.env.local` (brand secrets)
- Brand-specific logos in `public/` (`logo.svg`, `logo.png`, `favicon.ico`, `icon.*`)
- `package-lock.json`, `node_modules/`, `.next/`
- Supabase migrations (brand-specific)

### Adding a New Brand

See `master/BRAND-ONBOARDING.md` for the full checklist. Summary:

1. `mkdir -p brands/{brand}/agent`
2. Run `./scripts/sync-master-to-brand.sh {brand}`
3. Create `.env.local` with brand Supabase creds
4. Create brand config: `src/configs/{brand}.config.ts`
5. Create system prompt: `src/configs/prompts/{brand}-prompt.ts`
6. Update `src/configs/index.ts` to include new brand
7. Update `src/lib/agent-core/promptBuilder.ts` import
8. Add brand assets to `public/`
9. Full search-and-replace for brand name, colors, unified_context keys
10. Set up Supabase project + run migrations
11. Add to `scripts/sync-all-brands.sh`, root `package.json`
12. Create GitHub Actions workflow (copy `deploy-bcon.yml`)
13. Configure Nginx on VPS

---

## Deployment

### GitHub Actions (CI/CD)

Three workflows in `.github/workflows/`:
- `deploy-windchasers.yml` — triggers on push to `production` or `main` when `brands/windchasers/agent/**` changes
- `deploy-proxe.yml` — same pattern for proxe
- `deploy-bcon.yml` — same pattern for bcon

**Workflow steps:**
1. Checkout + Node.js 18 setup
2. Increment build version (`scripts/increment-build.js`)
3. SSH + rsync `brands/{brand}/agent/` to VPS (excludes `.env.local`, `node_modules`, `.next`)
4. On VPS: `npm ci` → `npm run build` (NODE_OPTIONS="--max-old-space-size=4096") → PM2 restart
5. Health check loop (5 retries, 3s each)

### VPS Port Map

| Brand | Dev Port | Prod Port | Nginx |
|---|---|---|---|
| Windchasers | 4000 | 3003 | proxe.windchasers.in |
| PROXe | 4001 | 3000 | — |
| BCON | 4003 | 3005 | proxe.bconclub.com |
| Master | 4002 | — | — |

### Nginx

Each brand has `brands/{brand}/nginx/proxe-unified.conf`:
- Single upstream to brand port
- SSE buffering disabled for `/api/agent/web/chat`
- Backward-compat rewrites for old endpoints
- Static assets cached 1 year
- SSL via Let's Encrypt

### Build Scripts

```bash
# Root package.json
npm run dev              # concurrently run all brands
npm run build            # build all brands sequentially
npm run sync             # master → all brands
npm run kill-ports       # kill dev server ports (4000-4003)

# Per-brand agent
npm run dev              # next dev -p {PORT}
npm run build            # prebuild (set-build-time.js) + next build
npm start                # next start -p {PORT}
npm run type-check       # tsc --noEmit
```

---

## Agent Core Types

```typescript
type Channel = 'web' | 'whatsapp' | 'voice' | 'social';

interface AgentInput {
  channel: Channel;
  message: string;
  messageCount: number;
  sessionId: string;
  userProfile: { name?, email?, phone?, websiteUrl? };
  conversationHistory: HistoryEntry[];
  summary: string;
  usedButtons?: string[];
  metadata?: Record<string, any>;
}

interface AgentOutput {
  response: string;
  followUps: string[];
  updatedSummary?: string;
  intent: ExtractedIntent;
  leadId?: string | null;
}
```

---

## Key Files Reference

| What | Path |
|---|---|
| AI engine | `src/lib/agent-core/engine.ts` |
| Claude client | `src/lib/agent-core/claudeClient.ts` |
| Prompt builder | `src/lib/agent-core/promptBuilder.ts` |
| Knowledge search | `src/lib/agent-core/knowledgeSearch.ts` |
| Intent extraction | `src/lib/agent-core/intentExtractor.ts` |
| Follow-up generator | `src/lib/agent-core/followUpGenerator.ts` |
| Session manager | `src/lib/services/sessionManager.ts` |
| Lead manager | `src/lib/services/leadManager.ts` |
| Booking manager | `src/lib/services/bookingManager.ts` |
| Context builder | `src/lib/services/contextBuilder.ts` |
| Conversation logger | `src/lib/services/conversationLogger.ts` |
| Supabase service client | `src/lib/services/supabase.ts` |
| Lead score calculator | `src/lib/leadScoreCalculator.ts` |
| Brand config loader | `src/configs/index.ts` |
| Windchasers config | `src/configs/brand.config.ts` |
| PROXe config | `src/configs/proxe.config.ts` |
| BCON config | `src/configs/bcon.config.ts` |
| Chat widget | `src/components/widget/ChatWidget.tsx` |
| Dashboard layout | `src/components/dashboard/DashboardLayout.tsx` |
| Leads table | `src/components/dashboard/LeadsTable.tsx` |
| Founder dashboard | `src/components/dashboard/FounderDashboard.tsx` |
| Chat hook | `src/hooks/useChat.ts` |
| Stream hook | `src/hooks/useChatStream.ts` |
| Global styles | `src/app/globals.css` |
| Theme CSS | `src/styles/theme.css` |
| Root layout | `src/app/layout.tsx` |
| Widget layout | `src/app/widget/layout.tsx` |
| Next.js config | `next.config.js` |
| Tailwind config | `tailwind.config.ts` |
| Brand onboarding | `master/BRAND-ONBOARDING.md` |

---

## Git History

The unified agent was built in 7 phases:
1. Agent core extraction (`lib/agent-core/`)
2. Shared services extraction (`lib/services/`)
3. Agent API routes (`app/api/agent/`)
4. Widget UI migration (`app/widget/`, `components/widget/`)
5. Nginx config simplification
6. WhatsApp AI response generation
7. Final sync and verification

Then the repo was restructured from `brand/*/dashboard/build/` into the current `master/ + brands/` layout.

---

## What's Live (March 2026)

| Brand | Dashboard | Web Agent | WhatsApp | Knowledge Base |
|---|---|---|---|---|
| Windchasers | proxe.windchasers.in | widget embedded | Meta Cloud API | 31 migrations |
| PROXe | deployed | deployed | — | 24 migrations |
| BCON | proxe.bconclub.com | deployed | Meta Cloud API | new (no migrations) |
