# PROXe — Multi-Brand AI Agent Platform

**Last updated:** February 2026

PROXe is a unified AI agent platform that powers multi-channel customer engagement (web chat, WhatsApp, voice) across multiple brands from a single codebase.

---

## Repository Structure

```
PROXe/
├── master/                        Single source of truth
│   ├── agent/                     Unified Next.js 14 app
│   │   ├── src/
│   │   │   ├── app/               Next.js App Router
│   │   │   │   ├── api/agent/     AI agent API routes
│   │   │   │   ├── api/dashboard/ Dashboard API routes
│   │   │   │   ├── api/calendar/  Calendar dashboard routes
│   │   │   │   ├── api/chat/      Backward-compat stubs
│   │   │   │   ├── dashboard/     Dashboard UI pages
│   │   │   │   ├── widget/        Chat widget pages
│   │   │   │   └── auth/          Authentication
│   │   │   ├── components/
│   │   │   │   ├── dashboard/     Dashboard UI components
│   │   │   │   └── widget/        Chat widget components
│   │   │   ├── configs/           Brand configs + prompts
│   │   │   ├── contexts/          React contexts
│   │   │   ├── hooks/             Custom hooks (useChat, useChatStream)
│   │   │   ├── lib/
│   │   │   │   ├── agent-core/    Channel-agnostic AI brain
│   │   │   │   ├── services/      Shared business logic
│   │   │   │   └── supabase/      Supabase client utilities
│   │   │   ├── styles/            CSS + theme variables
│   │   │   └── types/             TypeScript types
│   │   ├── public/                Static assets
│   │   ├── package.json
│   │   ├── next.config.js
│   │   └── .env.local             (not tracked — brand-specific secrets)
│   └── nginx/
│       └── proxe-unified.conf     Nginx config template
│
├── brands/                        Brand deployments (synced from master)
│   ├── windchasers/
│   │   ├── agent/                 Identical src from master + brand .env.local
│   │   ├── nginx/
│   │   ├── supabase/              Brand-specific migrations (24 files)
│   │   └── docs/
│   └── proxe/
│       ├── agent/
│       ├── nginx/
│       ├── supabase/
│       └── docs/
│
├── scripts/                       Sync & utility scripts
│   ├── sync-master-to-brand.sh    Push master → brand
│   ├── sync-brand-to-master.sh    Pull brand → master
│   ├── sync-all-brands.sh         Push master → all brands
│   └── kill-build-ports.sh
│
├── docs/                          System documentation
├── .github/workflows/             CI/CD pipelines
├── proxe.md                       This file
└── package.json                   Root orchestrator
```

---

## Architecture

### Unified Agent — One App, All Channels

Previously PROXe ran two separate Next.js apps per brand (web-agent + dashboard). Now everything is consolidated into **one unified app** (`agent/`):

```
Website (embed.js)    WhatsApp (webhook)    Voice    Social DMs
       │                     │                │           │
       ▼                     ▼                ▼           ▼
┌──────────────────────────────────────────────────────────────┐
│                    UNIFIED AGENT (Next.js 14)                │
│                                                              │
│  API Routes:                                                 │
│    /api/agent/web/chat          SSE streaming                │
│    /api/agent/whatsapp/webhook  Incoming messages             │
│    /api/agent/whatsapp/respond  AI responses (NEW)           │
│    /api/agent/calendar/book     Google Calendar booking      │
│    /api/agent/calendar/availability                          │
│    /api/agent/summarize         Conversation summaries       │
│    /widget                      Full-page chat widget        │
│    /widget/bubble               Bubble mode (for iframe)     │
│    /api/widget/embed.js         Embed script for websites    │
│    /dashboard/*                 Admin dashboard              │
│    /api/dashboard/*             Dashboard data APIs          │
│                                                              │
│  lib/agent-core/         Channel-agnostic AI brain           │
│    engine.ts             Orchestrator (process + stream)     │
│    claudeClient.ts       Claude API (stream + sync)          │
│    promptBuilder.ts      Channel-aware prompts               │
│    knowledgeSearch.ts    RAG search (Supabase)               │
│    intentExtractor.ts    User type, course, timeline         │
│    followUpGenerator.ts  Suggested response buttons          │
│    summarizer.ts         Conversation summarization          │
│                                                              │
│  lib/services/           Shared business logic               │
│    sessionManager.ts     Session CRUD (web/WA/voice)         │
│    leadManager.ts        Lead creation + deduplication        │
│    conversationLogger.ts Message logging + summaries         │
│    bookingManager.ts     Google Calendar integration         │
│    contextBuilder.ts     Cross-channel context assembly      │
│    supabase.ts           Service-role Supabase client        │
└──────────────────────────────────────────────────────────────┘
                            │
                   Supabase (per-brand DB)
```

### Key Design Decisions

- **Channel-agnostic core**: `engine.ts` doesn't know about HTTP, SSE, or webhooks — it takes `AgentInput` and returns `AgentOutput`
- **Client-safe widget**: Widget components use `fetch()` to API routes instead of importing server-only modules (googleapis, fs)
- **CSS Module scoping**: Widget uses `data-theme="aviation-gold"` CSS variables, isolated from dashboard styles
- **Widget-scoped layout**: `app/widget/layout.tsx` loads Exo_2 font + theme.css without affecting dashboard root layout
- **WhatsApp gets AI**: `/api/agent/whatsapp/respond` generates Claude responses with plain-text formatting
- **Follow-ups skipped for non-web**: WhatsApp/voice don't render suggestion buttons
- **Backward-compat stubs**: `/api/chat` proxies to `/api/agent/web/chat` for old embed scripts

---

## API Endpoints

### Agent Routes (AI-powered)

| Endpoint | Method | Channel | Response |
|---|---|---|---|
| `/api/agent/web/chat` | POST | Web | SSE stream (`chunk`, `followUps`, `done`) |
| `/api/agent/whatsapp/webhook` | POST | WhatsApp | JSON (stores incoming message) |
| `/api/agent/whatsapp/respond` | POST | WhatsApp | JSON (AI response, plain text) |
| `/api/agent/calendar/book` | POST | Any | JSON (Google Calendar event) |
| `/api/agent/calendar/availability` | POST | Any | JSON (available time slots) |
| `/api/agent/summarize` | POST | Any | JSON (conversation summary) |

### Widget Routes

| URL | What It Does |
|---|---|
| `/widget` | Full-page chat widget |
| `/widget/bubble` | Floating bubble mode (for iframe embedding) |
| `/api/widget/embed.js` | JavaScript embed script for external websites |

### Backward-Compat Stubs

| Old URL | Proxies To |
|---|---|
| `/api/chat` | `/api/agent/web/chat` |
| `/api/chat/summarize` | `/api/agent/summarize` |

---

## Development

### Quick Start

```bash
# Run windchasers locally
npm run dev:windchasers

# Run proxe locally
npm run dev:proxe

# Run both brands concurrently
npm run dev

# Build a specific brand
npm run build:windchasers
npm run build:proxe
```

### Workflow: Making Changes

1. **Edit in `master/agent/src/`** — all code changes happen here
2. **Test locally**: `npm run dev:master` (or copy .env.local from a brand)
3. **Sync to brands**: `npm run sync` (runs `scripts/sync-all-brands.sh`)
4. **Build all**: `npm run build`
5. **Commit & push**

### Adding a New Brand

1. Create the brand directory:
   ```bash
   mkdir -p brands/newbrand/{agent,nginx,supabase,docs}
   ```

2. Sync master source:
   ```bash
   ./scripts/sync-master-to-brand.sh newbrand
   ```

3. Create `.env.local` in `brands/newbrand/agent/` with brand-specific secrets

4. Install dependencies:
   ```bash
   cd brands/newbrand/agent && npm install
   ```

5. Add to `scripts/sync-all-brands.sh` (add brand name to the `for` loop)

6. Add dev/build scripts to root `package.json`

7. Create GitHub Actions workflow (copy `deploy-windchasers.yml` as template)

8. Set up Supabase project and add migrations to `brands/newbrand/supabase/`

---

## Environment Variables

Each brand's `agent/.env.local` needs:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Claude AI
CLAUDE_API_KEY=sk-ant-...

# Google Calendar (for booking)
GOOGLE_CALENDAR_ID=xxx@group.calendar.google.com
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# WhatsApp (optional)
WHATSAPP_API_KEY=your-api-key

# App
NEXT_PUBLIC_APP_URL=https://proxe.yourdomain.com
```

---

## Deployment

### Vercel

Set **Root Directory** in Vercel project settings:
- Windchasers: `brands/windchasers/agent`
- Proxe: `brands/proxe/agent`

### VPS (PM2 + Nginx)

GitHub Actions workflows handle VPS deployment automatically on push to `production` branch:
1. Rsync `brands/{brand}/agent/` to VPS
2. `npm ci && npm run build` on VPS
3. PM2 restart

Nginx config: `brands/{brand}/nginx/proxe-unified.conf`
- Single upstream to the agent (port 3003 for windchasers, 4000 for proxe)
- SSE buffering disabled for streaming chat
- Backward-compat rewrites for old endpoints

---

## Database

Each brand has its own Supabase project. Key tables:

| Table | Purpose |
|---|---|
| `all_leads` | Unified lead records (phone-based dedup) |
| `web_sessions` | Web chat sessions |
| `whatsapp_sessions` | WhatsApp sessions |
| `conversations` | All messages across channels |
| `knowledge_base` | RAG knowledge base documents |
| `dashboard_users` | Admin users for dashboard |

Migrations live in `brands/{brand}/supabase/migrations/`.

---

## Git History

The unified agent was built in 7 phases:
1. **Phase 1**: Agent core extraction (`lib/agent-core/`)
2. **Phase 2**: Shared services extraction (`lib/services/`)
3. **Phase 3**: Agent API routes (`app/api/agent/`)
4. **Phase 4**: Widget UI migration (`app/widget/`, `components/widget/`)
5. **Phase 5**: Nginx config simplification
6. **Phase 6**: WhatsApp AI response generation
7. **Phase 7**: Final sync and verification

Then the repo was restructured from `brand/*/dashboard/build/` into the current `master/ + brands/` layout.
