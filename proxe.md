# PROXe — Build Truth

**Last updated:** 2026-04-11

## Changelog

### 2026-04-11
- feat(bcon): web prompt - new first message asks "What is your biggest challenge in marketing right now?"
- feat(bcon): strengthened button rules - only 2-4 specific options, never after open-ended questions
- fix(bcon): delete lead API - added DELETE handler to /api/dashboard/leads/[id]/route.ts
- fix(bcon): delete lead frontend URL changed from query param to REST path /api/dashboard/leads/${id}

### 2026-04-10
- fix(bcon): widget embed.js removed scroll listeners, transform, translateY — always visible
- fix(bcon): widget quick buttons 2x2 grid layout (4 buttons, gridTemplateColumns 1fr 1fr)
- fix(bcon): widget increased font sizes (message 15px, header 16px, buttons 14px, padding 10px 16px)
- fix(bcon): widget input box visible border (rgba white 0.2), background, placeholder color
- fix(bcon): lead dedup — phone+brand first → email+brand → insert → conflict catch+update
- fix(bcon): calendar timezone Asia/Kolkata (GMT+05:30) displayed in CalendarView
- fix(bcon): calendar event colors by status (upcoming=blue, past=gray, no-show=red, completed=green)
- fix(bcon): inbox channel icon badges — web=blue, whatsapp=green, voice=purple, white icons
- fix(bcon): inbox sidebar min-width 280px stable on collapse
- fix(bcon): inbox right panel buttons — Call=green, WhatsApp=#25D366, Email=purple
- fix(bcon): inbox View Full Details router.push /dashboard/leads?leadId
- fix(bcon): widget typing dots hidden once streaming text starts (isLoading && !hasStreamingText)
- fix(bcon): flows page funnel sections TOP/MID/BOTTOM with blue/orange/green headers
- fix(bcon): LeadDetailsModal delete lead button (red outlined, confirm dialog, DELETE API)
- fix(bcon): widget postMessage proxe_lead_context pre-loads name+service, skips generic welcome

### 2026-04-09
- fix(bcon): inbox source channel icons with colored backgrounds (web=blue, whatsapp=green)
- fix(bcon): inbox sidebar min-width 280px for stable layout on collapse/expand
- fix(bcon): inbox right panel action button colors (Call=green, WhatsApp=#25D366, Email=purple)
- fix(bcon): inbox View Full Details button opens lead in new tab
- fix(bcon): calendar event color coding (upcoming=blue, past=gray, no-show=red, completed=green)
- fix(bcon): calendar sync error banner with visible alert
- fix(bcon): widget loading state - hide 3-dots when streaming text starts
- fix(bcon): flows page 3-category funnel layout (Top/Mid/Bottom with colored headers)
- fix(bcon): lead dedup by phone + brand filter to prevent cross-brand duplicates
- fix(bcon): web prompt marketing-only focus with redirect for non-marketing queries
- fix(bcon): widget embed.js scroll-trigger reveal removed, shows immediately on load
- fix(bcon): widget streaming cursor removed, 3-dot indicator only

### 2026-04-07
- fix: sync script preserves brand configs, prompts, theme CSS
- feat(bcon): bcon-web-prompt.ts created for web widget
- feat(bcon): promptBuilder routes web channel to web prompt
- fix(bcon): mobile quick actions now dynamic from config
- fix(bcon): exploreButtons AI in Marketing
- fix(bcon): widget preview 30/70 layout with browser mockup
- feat(bcon): BCON identity updated across prompts

**Last updated:** 2026-03-17

PROXe is a multi-brand AI agent platform. One codebase powers web chat, WhatsApp, voice, and social channels across multiple brands, each with its own database, theme, prompts, and deployment.

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

**Note:** BCON (`brands/bcon/`) is currently the most evolved brand and has features ahead of master (voice, task worker, admin notes, human handoff). These are being upstreamed.

---

## Repository Structure

```
PROXe/
├── master/                        Source of truth (base)
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
│   └── bcon/                      BCON Club consulting (most evolved)
│       ├── agent/                 Extended: admin notes, handoff, tools
│       ├── voice/                 Standalone voice server (Node.js)
│       │   ├── server.js          WebSocket voice pipeline
│       │   ├── task-worker.js     Autonomous task worker (PM2 cron)
│       │   ├── ecosystem.config.js PM2 config
│       │   └── package.json
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
| Voice STT/TTS | Sarvam AI (speech-to-text, text-to-speech) |
| Voice Telephony | Vobiz (WebSocket-based inbound calls) |
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
Website (embed.js)    WhatsApp (webhook)    Voice (Vobiz)    Social DMs
       │                     │                  │                 │
       ▼                     ▼                  ▼                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    UNIFIED AGENT (Next.js 14)                        │
│                                                                      │
│  lib/agent-core/         Channel-agnostic AI brain                   │
│    engine.ts             Orchestrator: AgentInput → Output           │
│    claudeClient.ts       Claude API (stream + sync + tools)          │
│    promptBuilder.ts      Channel-aware, brand-aware prompts          │
│    knowledgeSearch.ts    RAG search (Supabase vectors)               │
│    intentExtractor.ts    User type, course, timeline                 │
│    followUpGenerator.ts  Claude-powered contextual buttons           │
│    summarizer.ts         Conversation summarization                  │
│                                                                      │
│  lib/services/           Shared business logic                       │
│    sessionManager.ts     Session CRUD (web/WA/voice)                 │
│    leadManager.ts        Lead creation + phone dedup                 │
│    conversationLogger.ts Message logging + summaries                 │
│    bookingManager.ts     Google Calendar + Meet links                │
│    contextBuilder.ts     Cross-channel context + admin notes         │
│    whatsappSender.ts     WhatsApp message dispatch (template + free) │
│    supabase.ts           Service-role Supabase client                │
│                                                                      │
│  configs/                Brand identity                              │
│    index.ts              Config loader (env + hostname)              │
│    proxe.config.ts       PROXe colors, buttons, avatar              │
│    brand.config.ts       Windchasers config                          │
│    bcon.config.ts        BCON Club config                            │
│    prompts/              System prompts per brand                    │
└──────────────────────────────────────────────────────────────────────┘
         │                                              │
  Supabase (per-brand DB)                    Voice Server (standalone)
                                             Vobiz → Sarvam STT → Claude
                                             → Sarvam TTS → WebSocket audio
```

### Key Design Decisions

- **Channel-agnostic core**: `engine.ts` takes `AgentInput`, returns `AgentOutput` — no HTTP/SSE knowledge
- **Tool-enabled AI**: Engine uses Claude tool_use for booking (`check_availability`, `book_consultation`) and lead profiling (`update_lead_profile`) across all channels
- **Retry + graceful fallback**: AI generation retries once, then returns human-sounding fallback + flags lead for human follow-up
- **Human handoff detection**: Regex-based detection of "talk to a human" patterns → flags `needs_human_followup` on lead
- **Admin notes in AI context**: Team notes from dashboard flow into Claude's system prompt via `crossChannelContext`
- **Booking loop prevention**: `bookingsCompletedThisSession` Set prevents re-booking within a single tool session
- **Client-safe widget**: Widget uses `fetch()` to API routes, never imports server-only modules (googleapis, fs)
- **CSS scoping**: Widget uses `data-theme` attribute for style isolation from dashboard
- **Brand detection**: `NEXT_PUBLIC_BRAND_ID` env var → hostname fallback → defaults per brand
- **Static env access**: `NEXT_PUBLIC_*` vars must use static string keys (Next.js build-time inlining)
- **Backward-compat stubs**: `/api/chat` proxies to `/api/agent/web/chat` for old embed scripts

---

## Active Brands

| Brand | Slug | Theme | Dev Port | Prod Port | Domain |
|---|---|---|---|---|---|
| Windchasers | `windchasers` | Gold/Brown (aviation-gold) | 4000 | 3003 | proxe.windchasers.in |
| PROXe | `proxe` | Purple (proxe-purple) | 4001 | 3000 | — |
| BCON Club | `bcon` | Electric Purple (bcon-electric) | 4003 | 3005 | proxe.bconclub.com |
| BCON Voice | — | — | — | 3006 | voiceproxe.bconclub.com |
| Master | — | — | 4002 | — | — |

---

## API Endpoints

### Agent Routes (AI-Powered)

| Endpoint | Method | Channel | Response |
|---|---|---|---|
| `/api/agent/web/chat` | POST | Web | JSON (tool-enabled response + follow-ups) |
| `/api/agent/whatsapp/webhook` | POST | WhatsApp | JSON (stores incoming message) |
| `/api/agent/whatsapp/respond` | POST | WhatsApp | JSON (AI response, plain text) |
| `/api/agent/whatsapp/meta` | POST | WhatsApp | Meta Cloud API webhook |
| `/api/agent/voice/answer` | POST | Voice | JSON (Vobiz call answer) |
| `/api/agent/voice/test-call` | POST | Voice | JSON (trigger test call) |
| `/api/agent/calendar/book` | POST | Any | JSON (Google Calendar event) |
| `/api/agent/calendar/availability` | POST | Any | JSON (available time slots) |
| `/api/agent/summarize` | POST | Any | JSON (conversation summary) |

### Dashboard Routes

| Endpoint | Purpose |
|---|---|
| `/api/dashboard/leads` | Lead list, search, pagination, filters, DELETE by query params |
| `/api/dashboard/leads/[id]` | GET lead details, DELETE lead by ID |
| `/api/dashboard/leads/[id]/summary` | Full lead detail with channel data |
| `/api/dashboard/leads/[id]/stage` | Update lead stage |
| `/api/dashboard/leads/[id]/score` | Lead score breakdown |
| `/api/dashboard/leads/[id]/activities` | Activity log CRUD |
| `/api/dashboard/leads/[id]/admin-notes` | Admin notes CRUD (dual-writes to unified_context + activities) |
| `/api/dashboard/metrics` | Overall dashboard metrics |
| `/api/dashboard/channels/[channel]/metrics` | Per-channel analytics |
| `/api/dashboard/bookings` | Calendar bookings |
| `/api/dashboard/founder-metrics` | Executive dashboard (30s cache) |
| `/api/dashboard/insights` | Analytics insights |
| `/api/dashboard/web/messages` | Web chat messages |
| `/api/dashboard/whatsapp/messages` | WhatsApp messages |
| `/api/dashboard/summarize` | Conversation summaries |
| `/api/dashboard/settings/widget-style` | Widget styling config |
| `/api/dashboard/inbox/reply` | Inbox reply (AI generate or send via channel) |
| `/api/dashboard/tasks` | Autonomous task monitoring |

### Cron & Admin Routes

| Endpoint | Purpose |
|---|---|
| `/api/cron/booking-reminders` | Sends 24h/1h/30m reminders via WhatsApp templates |
| `/api/admin/backfill-calendar` | Backfill Google Calendar events |
| `/api/admin/backfill-leads` | Backfill lead records |
| `/api/whatsapp/templates` | WhatsApp template management |

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
| `/dashboard/inbox` | Multi-channel conversation inbox |
| `/dashboard/tasks` | Autonomous task monitoring |
| `/dashboard/agents` | Agent management hub |
| `/dashboard/agents` (Voice tab) | Voice agent testing + status |
| `/dashboard/agents` (WhatsApp tab) | WhatsApp agent config |
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
| `agent_tasks` | Autonomous task queue + execution logs | — |
| `lead_stage_changes` | Stage transition audit log | — |
| `activities` | Team-logged activities + admin notes | — |

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
  needs_human_followup BOOLEAN,        -- flagged for human agent
  metadata JSONB,                      -- human_followup_reason, human_followup_at
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

### unified_context JSONB Structure

```jsonc
{
  "web": {
    "booking_date": "2026-03-20",
    "booking_time": "3:00 PM",
    "profile": { "full_name", "email", "city", "company", "business_type", "notes" }
  },
  "whatsapp": {
    "booking_date": "...",
    "booking_time": "...",
    "profile": { "full_name", "email", "city", "company", "business_type", "notes" }
  },
  "admin_notes": [
    { "text": "...", "created_by": "admin@...", "created_at": "2026-03-17T..." }
  ]
}
```

### Lead Stages

| Stage | Score Range | Meaning |
|---|---|---|
| New | 0-20 | Initial contact |
| Engaged | 21-40 | Active conversation |
| Qualified | 41-60 | Shows interest, gave contact info |
| High Intent | 61-80 | Pricing/timeline discussions |
| Booking Made | 81-90 | Appointment scheduled |
| Converted | 91-100 | Purchase/enrollment completed |
| Cold | N/A | 30+ days inactive |
| Closed Lost | N/A | Explicit rejection |

### Lead Score Formula

**Total = (AI x 0.6) + (Activity x 0.3) + (Business x 0.1)**

- **AI Score (60%)**: Intent keywords (40%) + Sentiment (30%) + Buying signals (30%)
- **Activity Score (30%)**: Message count + Response rate + Recency + Channel mix bonus
- **Business Score (10%)**: Booking exists (+10) + Contact provided (+5) + Multi-channel (+5)

---

## Agent Core — How It Works

### Engine Pipeline (engine.ts)

```
Message in → extractIntent() → searchKnowledgeBase() → checkBooking()
           → buildPrompt() → generateResponseWithTools() → cleanResponse()
           → generateFollowUps() → AgentOutput
```

**Key behaviors by channel:**

| Channel | Tools | Follow-ups | Formatting | Booking |
|---|---|---|---|---|
| Web | check_availability, book_consultation, update_lead_profile | Claude-generated buttons | HTML (`<br><br>`, `**bold**`) | Requires email or phone |
| WhatsApp | check_availability, book_consultation, update_lead_profile | None (no buttons) | Plain text only, no markdown | Phone known from WA |
| Voice | None | None | Plain spoken text | N/A |

**Error handling:** Retry once after 2s delay. If both attempts fail → return friendly fallback message + flag lead for human follow-up.

### Tool Definitions (engine.ts)

| Tool | Purpose | Required Fields |
|---|---|---|
| `check_availability` | Get open calendar slots for a date | `date` (YYYY-MM-DD) |
| `book_consultation` | Create Google Calendar event + store booking | `date`, `time`, `name`, `phone`, `title` |
| `update_lead_profile` | Save lead info to unified_context | Any of: `full_name`, `email`, `city`, `company`, `business_type`, `notes` |

### Prompt Architecture (promptBuilder.ts)

```
System Prompt = getBrandSystemPrompt(brand, knowledgeBase, messageCount)
              + userName line
              + channelInstructions (WhatsApp rules / Web rules / Voice rules)
              + crossChannelContext (admin notes)

User Prompt   = conversationSummary
              + recentHistory
              + bookingNote
              + formattingInstructions
              + dateContext
              + firstMessageGuidance (messageCount 0-1)
              + thirdMessageGuidance (messageCount 3)
              + "Latest user message: {message}"
```

**Channel instructions:**
- **WhatsApp**: Plain text only, no HTML/markdown, 1-2 sentences max, booking tool flow documented
- **Web**: 2-4 sentences, `**bold**` allowed, collect name/email early, booking tools enabled
- **Voice**: Brief, natural-sounding, no formatting

### Intent Extraction (intentExtractor.ts)

Keyword-based classification:
- **Questions**: cost/price/fee, eligibility/requirements, timeline/duration, course/program
- **User type**: student, parent, professional
- **Course interest**: pilot, helicopter, drone, cabin crew
- **Timeline**: asap, 1-3mo, 6+mo, 1yr+
- **Booking intent**: call, demo, book, schedule, meeting, appointment

### Follow-Up Buttons (followUpGenerator.ts)

Brand-specific button pools (windchasers, bcon, proxe). Logic:
- First message → 2 buttons (Claude-generated + pool)
- Subsequent → 1 button (contextual to cost/interest/generic)
- Booking-aware filtering (no booking buttons if already booked)
- Explore click → show brand's explore buttons
- Web only (WhatsApp/voice get no buttons)

### Human Handoff Detection (engine.ts — bcon)

Regex patterns match phrases like "talk to a human", "real person", "stop the bot", "need someone real". When detected:
1. AI still generates a response
2. Lead flagged: `needs_human_followup = true` on `all_leads`
3. Reason + timestamp stored in `metadata`

---

## Brand Prompts

### BCON (bcon-prompt.ts)

**Tone:** Bold, confident, direct. Like a smart founder.
**Strategy:** Understand pain point → Probe deeper → Push AI Brand Audit
**Conversation flow:**
1. Engage (messages 1-2): Greet + ask what they do
2. Probe (messages 3-5): Dig into pain point, one question at a time
3. Connect (messages 5-7): Mirror problem, connect to AI
4. Push AI Brand Audit (message 6+): Position audit as next step

**First message rules:** Max 1-2 sentences, greet warmly + ask what they do, never parrot form data, never qualify early.
**Objection handling:** Cost → "Audit scopes that out", Info → "Audit > brochure", Thinking → reference their pain.
**CTA:** AI Brand Audit (never "book a call" or "strategy session").

### Windchasers (windchasers-prompt.ts)

**Tone:** Honest, warm, professional aviation career advisor.
**Programs:** CPL, Helicopter, Cabin Crew, Drone, DGCA Ground Classes.
**Pricing:** ₹40-75 lakhs (only when asked). Timeline: 18-24 months.
**Qualification flow (after message 3+):** User type → Education → Timeline → Course interest.
**Data collection:** Name (after 3 msgs) → Phone (after 5) → Email (after 7).
**De-escalation:** Acknowledge frustration immediately, hand off to admissions, never repeat/pitch after frustration.

---

## Voice Agent (BCON only)

Standalone Node.js server at `brands/bcon/voice/`.

### Pipeline

```
Inbound call (Vobiz) → WebSocket connection → Pre-recorded greeting
  → User speaks → Sarvam STT (multipart) → Text
  → Claude Haiku (with lead context from Supabase) → Response text
  → Sarvam TTS → WAV audio → Chunked delivery (300ms @ 16kHz)
  → Repeat until hangup
```

**Phone:** +918046733388
**Server:** voiceproxe.bconclub.com:3006
**Features:** Pre-loaded greeting audio, WAV header stripping, silence detection, conversation history, lead context loading from Supabase.

---

## Autonomous Task Worker (BCON only)

Runs via PM2 every 5 minutes (`brands/bcon/voice/task-worker.js`).

### Task Types

| Task | Trigger | Action |
|---|---|---|
| Booking reminder (24h) | 24h before call | WhatsApp template message |
| Booking reminder (1h) | 1h before call | Free-form WhatsApp message |
| Booking reminder (30m) | 30m before call | Free-form WhatsApp message |
| Follow-up | Lead at specific stage | Automated WhatsApp follow-up |
| Cold re-engagement | Lead inactive 30+ days | Re-engagement message |

**Tables:** `agent_tasks` (queue), `whatsapp_sessions` (booking tracking).
**WhatsApp message types:** Template messages (outside 24h window), free-form messages (within 24h window).

---

## Inbox & Multi-Channel View

### Features
- Multi-channel badges (web, whatsapp, voice, social) with visual indicators
- Unified conversation view across all channels
- Customer journey timeline in sidebar
- Voice tab integration
- Reply system: AI-generated responses for review, or direct send via channel
- 24-hour window validation for WhatsApp replies
- Admin notes passed to AI for context-aware responses

### Reply Flow (`/api/dashboard/inbox/reply`)
- **"generate" mode**: AI generates response draft using full engine pipeline (with admin notes)
- **"send" mode**: Dispatches message via appropriate channel (WhatsApp API or web session)

---

## Components

### Dashboard (30+ files)

| Component | Purpose |
|---|---|
| `DashboardLayout.tsx` | Main layout with sidebar |
| `LeadsTable.tsx` | Leads list + pagination + channel badges |
| `LeadDetailsModal.tsx` | Lead detail view + admin notes section |
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

### Agent Management Pages

| Component | Purpose |
|---|---|
| `AgentsClient.tsx` | Agent management hub (tabs) |
| `VoiceAgentTab.tsx` | Voice agent status + test calls |
| `WhatsAppAgentTab.tsx` | WhatsApp agent configuration |

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

Brand detection order: `NEXT_PUBLIC_BRAND_ID` → `NEXT_PUBLIC_BRAND` → hostname → fallback.

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
  adminNotes?: Array<{ text: string; created_by: string; created_at: string }>;
}

interface AgentOutput {
  response: string;
  followUps: string[];
  updatedSummary?: string;
  intent: ExtractedIntent;
  leadId?: string | null;
}

interface ExtractedIntent {
  buttonClicks?: string[];
  questionsAsked?: string[];
  userType?: 'student' | 'parent' | 'professional';
  courseInterest?: 'pilot' | 'helicopter' | 'drone' | 'cabin';
  timeline?: 'asap' | '1-3mo' | '6+mo' | '1yr+';
}
```

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

# Google Calendar (optional)
GOOGLE_CALENDAR_ID=xxx@group.calendar.google.com
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# WhatsApp — Meta Cloud API (optional)
META_WHATSAPP_ACCESS_TOKEN=...
META_WHATSAPP_PHONE_NUMBER_ID=...
META_WHATSAPP_VERIFY_TOKEN=...

# Voice — Sarvam AI (BCON only)
SARVAM_API_KEY=...

# Scoring / Cron (optional)
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
1. Edit in master/agent/src/         <- all code changes here
2. npm run dev:master                <- test locally (port 4002)
3. npm run sync                      <- push master -> all brands
4. npm run build                     <- build all brands
5. git add + commit + push to main
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
| BCON Voice | — | 3006 | voiceproxe.bconclub.com |
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
npm run sync             # master -> all brands
npm run kill-ports       # kill dev server ports (4000-4003)

# Per-brand agent
npm run dev              # next dev -p {PORT}
npm run build            # prebuild (set-build-time.js) + next build
npm start                # next start -p {PORT}
npm run type-check       # tsc --noEmit
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
| Summarizer | `src/lib/agent-core/summarizer.ts` |
| Session manager | `src/lib/services/sessionManager.ts` |
| Lead manager | `src/lib/services/leadManager.ts` |
| Booking manager | `src/lib/services/bookingManager.ts` |
| Context builder | `src/lib/services/contextBuilder.ts` |
| Conversation logger | `src/lib/services/conversationLogger.ts` |
| WhatsApp sender | `src/lib/services/whatsappSender.ts` |
| Supabase service client | `src/lib/services/supabase.ts` |
| Lead score calculator | `src/lib/leadScoreCalculator.ts` |
| Brand config loader | `src/configs/index.ts` |
| Windchasers config | `src/configs/brand.config.ts` |
| PROXe config | `src/configs/proxe.config.ts` |
| BCON config | `src/configs/bcon.config.ts` |
| BCON prompt | `src/configs/prompts/bcon-prompt.ts` |
| Windchasers prompt | `src/configs/prompts/windchasers-prompt.ts` |
| Chat widget | `src/components/widget/ChatWidget.tsx` |
| Dashboard layout | `src/components/dashboard/DashboardLayout.tsx` |
| Leads table | `src/components/dashboard/LeadsTable.tsx` |
| Lead details modal | `src/components/dashboard/LeadDetailsModal.tsx` |
| Founder dashboard | `src/components/dashboard/FounderDashboard.tsx` |
| Chat hook | `src/hooks/useChat.ts` |
| Stream hook | `src/hooks/useChatStream.ts` |
| Global styles | `src/app/globals.css` |
| Theme CSS | `src/styles/theme.css` |
| Root layout | `src/app/layout.tsx` |
| Widget layout | `src/app/widget/layout.tsx` |
| Voice server | `brands/bcon/voice/server.js` |
| Task worker | `brands/bcon/voice/task-worker.js` |
| Next.js config | `next.config.js` |
| Tailwind config | `tailwind.config.ts` |
| Brand onboarding | `master/BRAND-ONBOARDING.md` |

---

## master/ vs brands/bcon/ Differences

BCON is the most evolved brand. Key differences from master:

| Feature | master/ | brands/bcon/ |
|---|---|---|
| Default brand fallback | `windchasers` | `bcon` |
| Engine retry + fallback | No | Yes (retry once, then friendly fallback) |
| Human handoff detection | No | Yes (regex patterns → flag lead) |
| `update_lead_profile` tool | No | Yes (saves name/email/city/company/business) |
| `book_consultation.title` field | No | Yes (AI-generated call title) |
| Booking loop prevention | No | Yes (`bookingsCompletedThisSession` Set) |
| Admin notes in AI context | No | Yes (via `crossChannelContext`) |
| Web channel instructions | No | Yes (collect name/email, 2-4 sentences) |
| Web booking tools | No | Yes (same tools as WhatsApp) |
| Frustrated customer de-escalation | No | Yes (in windchasers prompt) |
| WhatsApp sender service | No | Yes (`whatsappSender.ts`) |
| Voice server | No | Yes (standalone Node.js) |
| Task worker | No | Yes (PM2 cron, booking reminders) |
| Inbox reply API | No | Yes (AI generate + send) |
| Admin notes API | No | Yes (dual-write) |
| Cron: booking reminders | No | Yes (24h/1h/30m) |
| Agent management pages | No | Yes (Voice + WhatsApp tabs) |

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

Recent evolution (Phase 8+):
8. Voice agent (Vobiz + Sarvam STT/TTS + Claude Haiku)
9. Autonomous task worker (booking reminders, follow-ups, cold re-engagement)
10. Admin notes + human handoff detection
11. Multi-channel inbox (unified conversation view, channel badges, journey timeline)
12. Tool-enabled web chat (booking tools for web, not just WhatsApp)
13. Lead profile tool (`update_lead_profile` — AI saves lead info during conversation)

---

## What's Live (March 2026)

| Brand | Dashboard | Web Agent | WhatsApp | Voice | Task Worker | Knowledge Base |
|---|---|---|---|---|---|---|
| Windchasers | proxe.windchasers.in | widget embedded | Meta Cloud API | — | — | 31 migrations |
| PROXe | deployed | deployed | — | — | — | 24 migrations |
| BCON | proxe.bconclub.com | deployed + booking tools | Meta Cloud API | voiceproxe.bconclub.com | PM2 cron (5min) | active |


---

## Active Sprint - Go-Live Readiness
Start: 2026-04-07 | Target: 2026-04-14

### Done
- [2026-04-01] Form fills wired to /api/website
- [2026-04-07] bcon_welcome_web_v1 template created
- [2026-04-09] Sync script fixed - preserves brand configs
- [2026-04-09] Web widget prompt created (bcon-web-prompt.ts)
- [2026-04-09] Widget preview browser mockup
- [2026-04-09] Inbox source channel icons with colored backgrounds
- [2026-04-09] Inbox sidebar stable layout (min-width 280px)
- [2026-04-09] Inbox right panel action buttons (Call, WhatsApp, Email)
- [2026-04-09] Inbox View Full Details button opens lead in new tab
- [2026-04-09] Calendar event color coding (upcoming/past/no-show/completed)
- [2026-04-09] Calendar sync error banner
- [2026-04-09] Widget loading state fixed (no double indicators)
- [2026-04-09] Flows page 3-category funnel layout
- [2026-04-09] Lead dedup with brand filter
- [2026-04-09] Web prompt marketing-only focus
- [2026-04-09] Widget shows immediately on load (scroll reveal removed)
- [2026-04-11] Web prompt first message updated (marketing challenge question)
- [2026-04-11] Web prompt button rules strengthened (strict 2-4 options only)
- [2026-04-11] Delete lead API fixed (DELETE handler in [id] route)
- [2026-04-10] Widget quick buttons 2x2 grid (4 buttons)
- [2026-04-10] Widget font sizes (message 15px, header 16px, button 14px)
- [2026-04-10] Widget input box visible (border + bg + placeholder)
- [2026-04-10] Lead dedup phone+brand → email+brand → insert → conflict catch
- [2026-04-10] Calendar timezone Asia/Kolkata (GMT+05:30)
- [2026-04-10] Calendar event color coding by status
- [2026-04-10] Inbox channel icon colored backgrounds
- [2026-04-10] Inbox sidebar stable min-width 280px
- [2026-04-10] Inbox right panel button colors
- [2026-04-10] Inbox View Full Details with router.push
- [2026-04-10] Widget typing dots hide on stream start
- [2026-04-10] Flows TOP/MID/BOTTOM funnel sections
- [2026-04-10] LeadDetailsModal delete lead button
- [2026-04-10] Widget proxe_lead_context pre-load from postMessage

### Pending
- Fix phone ID undefined in task worker
- Fix dedup - same template repeating
- Widget live on bconclub.com
- DEMO_TAKEN + PROPOSAL_SENT admin notes
- Stage-based follow-up logic
