# PROXe Endpoint Inventory

> **Scope note.** Per the brand-isolation rule for windchasers work, `brands/bcon/` was **not** read for this inventory. The `bcon` agent is structurally a sibling of `proxe` and `windchasers` (same Next.js scaffold) and almost certainly exposes the same route surface — but routes/payloads/auth in `brands/bcon/agent/src/app/api/**` are not represented below. Re-run with bcon included if you need it.

---

## Framework summary

- **Backend stack:** Next.js 14 App Router (`src/app/api/**/route.ts`). All routes are TypeScript Route Handlers. No Express/Hono/Fastify, no Supabase Edge Functions (`supabase/functions/` does not exist), no Cloudflare Workers, no standalone Lambdas. The entire backend is the same Next.js process that serves the dashboard.
- **Per-brand deployment.** The repo contains **three parallel agent apps** that each ship their own copy of the route tree:
  - `master/agent/` — canonical/source-of-truth scaffold
  - `brands/proxe/agent/` — proxe brand
  - `brands/windchasers/agent/` — windchasers brand (the one that powers `proxe.windchasers.in`)
  - (`brands/bcon/agent/` — not inspected)
  - `src/app/api/` at repo root is a smaller, partial scaffold (flows + leads + website + dashboard) used by the top-level dashboard checked into the root; it is not the production-deployed app for any brand.
  Each agent is a Next.js project with its own `package.json`, `vercel.json`, `middleware.ts`, and `nginx/proxe-unified.conf`. Routes are largely identical across brands; **windchasers has the most additions** (admin/backfill, agent/leads/inbound, agent/voice, cron/booking-reminders, dashboard/flows, dashboard/inbox, dashboard/changelog, integrations/landing-pages, whatsapp/templates, website).
- **Deployment target:** Both Vercel (`vercel.json` present in each agent) **and** a self-hosted nginx + Node setup (`nginx/proxe-unified.conf` proxies to `127.0.0.1:3003`). The README/nginx config indicate a single Next.js upstream on port 3003 with PM2 (`ecosystem.config.js`).
- **Base URL(s) in production:**
  - **windchasers:** `https://proxe.windchasers.in` (server_name in nginx, `Access-Control-Allow-Origin: https://goproxe.com` set in middleware — see CORS notes)
  - **proxe / bcon:** `https://proxe.proxe.in` and `https://proxe.bconclub.com` (referenced via `NEXT_PUBLIC_APP_URL` defaults in route code)
- **Global CORS** (from each `middleware.ts`): for **every** `/api/*` request the Next middleware overwrites response headers with:
  - `Access-Control-Allow-Origin: https://goproxe.com`
  - `Access-Control-Allow-Methods: GET, POST`
  - `Access-Control-Allow-Headers: Content-Type`
  Routes that set their own `Access-Control-Allow-Origin: *` (the chat/widget routes) get **overwritten** by middleware in production. The middleware also runs `updateSession()` (Supabase SSR cookie refresh) on every API call but does not enforce auth; auth is enforced inside each route handler.
- **Key auth modes used across routes:**
  - `x-api-key` header → matched against `INBOUND_API_KEY`, `WHATSAPP_API_KEY`, or `VOICE_API_KEY` env vars
  - `Authorization: Bearer <CRON_SECRET>` for cron jobs
  - `Authorization: Bearer <WEBHOOK_SECRET>` for the website form route
  - Supabase session cookie (via `createClient()` + `auth.getUser()`) for all dashboard routes
  - Meta `hub.verify_token` query for WhatsApp webhook verification
  - **Several routes have NO auth** (chat, calendar/availability, widget embed, health, build-info)

---

## Endpoints

> Routes below come from `brands/windchasers/agent/src/app/api/`. Where the same path also exists under `master/agent/` and `brands/proxe/agent/`, that is noted as "Also in: master, proxe". Brand-only additions are tagged with which brand has them.

---

### Inbound lead capture (Pabbly / Facebook / Google / website forms)
- **URL:** `/api/agent/leads/inbound`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/agent/leads/inbound/route.ts](brands/windchasers/agent/src/app/api/agent/leads/inbound/route.ts) — windchasers only
- **Purpose:** Single inbound funnel for Facebook lead-ads, Google ads, website forms, manual entry, and Pabbly. Creates or updates a lead and schedules a `first_outreach` task.
- **Auth:** `x-api-key` header must match `INBOUND_API_KEY` env var.
- **Expected payload shape:**
```json
{
  "name": "string",
  "phone": "string (required)",
  "email": "string?",
  "source": "facebook|google|website|web|form|manual|pabbly|whatsapp|voice|social|ads|referral|organic|meta_forms",
  "campaign": "string?",
  "notes": "string?",
  "brand": "string? (defaults to NEXT_PUBLIC_BRAND or 'bcon')",
  "city": "string?",
  "brand_name": "string?",
  "urgency": "string?",
  "custom_fields": {
    "Do You Have Your Website Ready": "Yes|No?",
    "How Many Leads Can You Handle A Month": "string?",
    "How Fast Do You Want This Set Up": "string?",
    "Do You Have Any AI Systems Running": "Yes|No?"
  }
}
```
Also accepts `application/x-www-form-urlencoded` (Pabbly fallback) and best-effort regex extraction of malformed JSON.
- **What it does:**
  - Normalises `phone` and maps free-text `source` → canonical touchpoint enum
  - Checks `all_leads` for an existing record by `customer_phone_normalized`; updates or inserts
  - Folds form fields into `unified_context.form_data` and `unified_context.lead_sources[]`
  - Inserts a `first_outreach` row into `agent_tasks` so the agent picks the lead up
- **Writes to:** `all_leads`, `agent_tasks`
- **Returns:** `{ success: true, lead_id, is_new, task_created }`
- **CORS:** none in the handler; middleware applies `Access-Control-Allow-Origin: https://goproxe.com`.

---

### Generic website form submission
- **URL:** `/api/website`
- **Method:** GET (health), POST (submit)
- **File:** [brands/windchasers/agent/src/app/api/website/route.ts](brands/windchasers/agent/src/app/api/website/route.ts) — windchasers and root `src/app/api/website/route.ts`
- **Purpose:** Catch-all endpoint for non-chat website forms (contact form, newsletter, etc.). Creates/updates a lead and triggers a WhatsApp template auto-responder.
- **Auth:** `Authorization: Bearer <WEBHOOK_SECRET>` (skipped if `WEBHOOK_SECRET` env var is unset).
- **Expected payload shape:**
```json
{
  "name": "string (required)",
  "email": "string? (one of email/phone required)",
  "phone": "string? (one of email/phone required)",
  "message": "string?",
  "form_type": "contact|newsletter (default: contact)",
  "page_url": "string?",
  "brand": "string (required, lowercased)",
  "service_interest": "AI in Marketing|Brand Marketing|Business Apps|...?",
  "utm_source": "string?",
  "utm_medium": "string?",
  "utm_campaign": "string?"
}
```
- **What it does:**
  - Looks up `all_leads` by phone (then email) scoped to the brand; updates or creates
  - Stores `web.form_submission` (last 5 retained) + `web.profile` + `web.utm` into `unified_context`
  - For newly created leads with a phone, sends the `bcon_welcome_web_v1` WhatsApp template via Meta Graph API (fire-and-forget). For email-only new leads, posts to `https://bconclub.com/api/send-email`.
- **Writes to:** `all_leads`. Calls Meta Graph API and external `bconclub.com` email service.
- **Returns:** `{ success, lead_id, action: 'created'|'updated', lead_stage }`
- **CORS:** none in handler; middleware applies its origin pin.

---

### Landing-page lead capture (Windchasers)
- **URL:** `/api/integrations/landing-pages`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/integrations/landing-pages/route.ts](brands/windchasers/agent/src/app/api/integrations/landing-pages/route.ts) — windchasers only
- **Purpose:** Receives lead submissions from Windchasers landing pages / standalone forms. Upserts the lead and posts a `landing_page` conversation row so the lead surfaces in the inbox.
- **Auth:** `x-api-key` header must match `WHATSAPP_API_KEY` env var (shared secret).
- **Expected payload shape:**
```json
{
  "name": "string (required)",
  "phone": "string (required)",
  "email": "string?",
  "course_interest": "string?",
  "city": "string?",
  "training_type": "string?",
  "user_type": "string?",
  "timeline": "string?",
  "utm_source": "string?",
  "utm_medium": "string?",
  "utm_campaign": "string?",
  "utm_content": "string?",
  "utm_term": "string?",
  "page_url": "string?",
  "form_name": "string?",
  "brand": "string (default: 'windchasers')"
}
```
- **What it does:** Upserts `all_leads` keyed on `(customer_phone_normalized, brand)`, merges into `unified_context.landing_page`, inserts a `landing_page` conversation row, fires AI scoring via `/api/webhooks/message-created`.
- **Writes to:** `all_leads`, `conversations`
- **Returns:** `{ success, lead_id, message }`
- **CORS:** none in handler; middleware applies origin pin.

---

### Web chat (SSE streaming)
- **URL:** `/api/agent/web/chat`
- **Method:** POST, OPTIONS
- **File:** [brands/windchasers/agent/src/app/api/agent/web/chat/route.ts](brands/windchasers/agent/src/app/api/agent/web/chat/route.ts) — Also in: master, proxe
- **Purpose:** Server-Sent Events streaming chat endpoint that powers the website widget (`/widget/bubble`). Replaces the old standalone web-agent service.
- **Auth:** **None.** Route is publicly POSTable.
- **Expected payload shape:**
```json
{
  "message": "string (required)",
  "messageCount": 0,
  "usedButtons": [],
  "metadata": {
    "session": {
      "externalId": "string?",
      "user": { "name": "?", "email": "?", "phone": "?" }
    },
    "memory": {
      "recentHistory": [{ "role": "user|assistant", "content": "..." }],
      "summary": "string?"
    }
  }
}
```
- **What it does:** Ensures a `web_sessions` row, builds an `AgentInput`, streams the AI response chunk-by-chunk over SSE (`data: {type:'chunk'|'followUps'|'done'|'error', ...}`), then in fire-and-forget post-processing creates/links a lead when phone or email is captured, logs both messages to `conversations`, and re-summarises every 3rd turn.
- **Writes to:** `web_sessions`, `all_leads`, `conversations`, `web_session_summaries` (via `upsertSummary`)
- **Returns:** `text/event-stream`. Final JSON-on-error has shape `{ error }`.
- **CORS:** Sets `Access-Control-Allow-Origin: *`, `Methods: GET, POST, OPTIONS`, `Headers: Content-Type, Authorization`. **Middleware overwrites the `Allow-Origin` to `https://goproxe.com`** for any request that goes through the standard middleware path. nginx routes this URL specifically with buffering disabled for SSE.

---

### Backward-compat chat proxy
- **URL:** `/api/chat`
- **Method:** POST, OPTIONS
- **File:** [brands/windchasers/agent/src/app/api/chat/route.ts](brands/windchasers/agent/src/app/api/chat/route.ts) — Also in: master, proxe
- **Purpose:** Forwards old `/api/chat` calls to `/api/agent/web/chat` (Phase 4 unified-agent transition shim).
- **Auth:** None at this layer (passthrough).
- **Payload:** Whatever `/api/agent/web/chat` accepts.
- **What it does:** Reads body, builds new URL, `fetch()`-proxies the request server-side and returns the upstream response unchanged.
- **Writes to:** Indirect (via the proxied route).
- **Returns:** Whatever `/api/agent/web/chat` returns (SSE).
- **CORS:** `*` on OPTIONS; same middleware override note as above.

---

### Conversation summarizer
- **URL:** `/api/agent/summarize`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/agent/summarize/route.ts](brands/windchasers/agent/src/app/api/agent/summarize/route.ts) — Also in: master, proxe
- **Purpose:** Generate a running conversation summary from a list of messages.
- **Auth:** None.
- **Expected payload shape:** `{ messages: [{role, content}], sessionId?: string, previousSummary?: string }`
- **What it does:** Calls `generateSummary` (Claude); optionally persists via `upsertSummary` if `sessionId` is provided.
- **Writes to:** `web_session_summaries` (when `sessionId` provided)
- **Returns:** `{ summary }`
- **CORS:** none in handler.

---

### Backward-compat summarize proxy
- **URL:** `/api/chat/summarize`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/chat/summarize/route.ts](brands/windchasers/agent/src/app/api/chat/summarize/route.ts) — Also in: master, proxe
- **Auth/Payload/Behavior:** Forwards to `/api/agent/summarize`.

---

### Calendar — availability (booking widget)
- **URL:** `/api/agent/calendar/availability`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/agent/calendar/availability/route.ts](brands/windchasers/agent/src/app/api/agent/calendar/availability/route.ts) — Also in: master, proxe
- **Purpose:** Returns bookable time slots for a given date.
- **Auth:** None.
- **Expected payload shape:** `{ date: "YYYY-MM-DD" }`
- **What it does:** Delegates to `getAvailableSlots(date)` which queries Google Calendar via service account; returns slot list with `available` booleans.
- **Writes to:** none (read-only)
- **Returns:** `{ date, slots: TimeSlot[], availability: { "HH:MM": boolean } }`
- **CORS:** none in handler.

### Legacy calendar availability (direct Google Calendar)
- **URL:** `/api/calendar/availability`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/calendar/availability/route.ts](brands/windchasers/agent/src/app/api/calendar/availability/route.ts) — Also in: master, proxe
- **Purpose:** Older direct-to-Google-Calendar version of the same check (uses fixed slot list `11:00, 13:00, 15:00, 16:00, 17:00, 18:00`). nginx rewrites this URL → `/api/agent/calendar/availability` for new clients.
- **Auth:** None.
- **Payload/Returns:** Same shape as `/api/agent/calendar/availability`.

---

### Calendar — book a slot
- **URL:** `/api/agent/calendar/book`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/agent/calendar/book/route.ts](brands/windchasers/agent/src/app/api/agent/calendar/book/route.ts) — Also in: master, proxe
- **Purpose:** Confirm a booking — checks for an existing booking, creates a Google Calendar event, stores a row in the bookings/sessions tables.
- **Auth:** None. **Note:** there is a `checkOnly: true` mode that returns whether a booking already exists for `(phone, email)` without writing.
- **Expected payload shape:**
```json
{
  "date": "YYYY-MM-DD or ISO",
  "time": "HH:MM or 'h:MM AM/PM'",
  "name": "string",
  "email": "string",
  "phone": "string",
  "sessionId": "string?",
  "courseInterest": "string?",
  "sessionType": "string?",
  "brand": "string (default: 'bcon')",
  "checkOnly": false
}
```
- **What it does:** Calls `checkExistingBooking(phone, email)`; if free, calls `createCalendarEvent(...)` then `storeBooking(sessionId, ..., 'web', supabase)`.
- **Writes to:** Google Calendar (external); `web_sessions` (booking fields) when `sessionId` provided
- **Returns:** `{ success, eventId, eventLink, message }` or `{ success: false, alreadyBooked: true, ... }`
- **CORS:** none in handler. nginx rewrites `/api/calendar/book` → `/api/agent/calendar/book`.

---

### Calendar — list/manage events (admin)
- **URL:** `/api/calendar/events`
- **Method:** GET, plus likely POST/DELETE
- **File:** [brands/windchasers/agent/src/app/api/calendar/events/route.ts](brands/windchasers/agent/src/app/api/calendar/events/route.ts) — Also in: master, proxe
- **Purpose:** Lists events on the configured Google Calendar. Used by the admin/dashboard.
- **Auth:** None at the handler level (relies on the calendar service-account scope).
- **Returns:** Google Calendar events list.

### Calendar — sync
- **URL:** `/api/calendar/sync`
- **Method:** GET/POST
- **File:** [brands/windchasers/agent/src/app/api/calendar/sync/route.ts](brands/windchasers/agent/src/app/api/calendar/sync/route.ts) — Also in: master, proxe
- **Purpose:** Sync Google Calendar events with `whatsapp_sessions.booking_*` fields.
- **Auth:** Likely none/cron — uses service-account credentials.

---

### WhatsApp — Meta Cloud API webhook (production)
- **URL:** `/api/agent/whatsapp/meta`
- **Method:** GET (verification), POST (incoming)
- **File:** [brands/windchasers/agent/src/app/api/agent/whatsapp/meta/route.ts](brands/windchasers/agent/src/app/api/agent/whatsapp/meta/route.ts) — Also in: master, proxe
- **Purpose:** Direct integration with Meta's WhatsApp Cloud API. Verifies webhook (GET with `hub.challenge`) and processes inbound text messages and delivery/read status updates (POST).
- **Auth:**
  - GET: `hub.verify_token` query param must equal `META_WHATSAPP_VERIFY_TOKEN` (defaults to `bcon-proxe-verify` if unset)
  - POST: **No auth** — Meta does not sign webhook bodies in this implementation (no `x-hub-signature-256` check). Always returns HTTP 200 to prevent Meta retries.
- **Expected POST payload:** Standard Meta WhatsApp webhook body — `{ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [...], statuses: [...], contacts: [...] } }] }] }`.
- **What it does:** Deduplicates by message ID (in-memory + DB); upserts the lead via `ensureOrUpdateLead`; logs the customer message to `conversations`; calls the agent core to generate a response; replies via Graph API (`/v21.0/{phone-number-id}/messages`); marks read; logs the AI response; updates `unified_context.channel_performance`; fires `/api/webhooks/message-created` for scoring. Status updates write `read_at` / `delivered_at` to the matching conversation row.
- **Writes to:** `all_leads`, `conversations`, `whatsapp_sessions`, `web_sessions` (via shared `ensureSession`); calls Meta Graph API.
- **Returns:** `200 OK` always (with `{status}` body).
- **CORS:** none in handler.

---

### WhatsApp — internal-respond (legacy proxy)
- **URL:** `/api/agent/whatsapp/respond`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/agent/whatsapp/respond/route.ts](brands/windchasers/agent/src/app/api/agent/whatsapp/respond/route.ts) — Also in: master, proxe
- **Purpose:** Generate an AI response for a WhatsApp message (non-streaming). Used when Meta is not the inbound source — e.g. an external bridge POSTs the message and asks PROXe to compose the reply.
- **Auth:** `x-api-key` header must match `WHATSAPP_API_KEY` env var.
- **Expected payload:** `{ phone, name?, message, conversationHistory?: [...], sessionId? }`
- **What it does:** Builds `AgentInput`, runs `processMessage`, returns the AI reply. Does **not** send via Meta — caller is responsible.
- **Writes to:** `whatsapp_sessions`, `web_sessions`, possibly `conversations` (via shared services)
- **Returns:** `{ success, response, followUps, intent }`

---

### WhatsApp — generic webhook (legacy / external bridge)
- **URL:** `/api/agent/whatsapp/webhook`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/agent/whatsapp/webhook/route.ts](brands/windchasers/agent/src/app/api/agent/whatsapp/webhook/route.ts) — Also in: master, proxe
- **Purpose:** Generic "I just saw a WhatsApp message" webhook used by external bridges (not Meta directly). Persists the message and updates unified context, but does not generate or send a reply.
- **Auth:** `x-api-key` must match `WHATSAPP_API_KEY`.
- **Expected payload:** `{ name, phone, email?, message, sender?, message_type?, external_session_id?, whatsapp_id?, brand?, conversation_summary?, ... }`
- **What it does:** Upserts lead via `ensureOrUpdateLead`; upserts `whatsapp_sessions`; writes the message to `conversations`; sets a 48h follow-up cooldown on the lead; fires `/api/webhooks/message-created` for scoring.
- **Writes to:** `all_leads`, `whatsapp_sessions`, `conversations`
- **Returns:** `{ success, lead_id, message }`

---

### WhatsApp — outbound integration update (legacy)
- **URL:** `/api/integrations/whatsapp`
- **Method:** GET (list leads), POST (write conversation/profile/booking/summary)
- **File:** [brands/windchasers/agent/src/app/api/integrations/whatsapp/route.ts](brands/windchasers/agent/src/app/api/integrations/whatsapp/route.ts) — Also in: master, proxe
- **Auth:** None on POST in handler (uses service-role internally — depends on the caller being trusted).
- **Purpose:** Older write-side WhatsApp bridge (predates `/api/agent/whatsapp/*`). nginx rewrites `/api/integrations/whatsapp` → `/api/agent/whatsapp/webhook` and `/api/integrations/whatsapp/*` → `/api/agent/whatsapp/*`, so in production this file's POST handler is mostly bypassed.
- **Writes to:** `all_leads`, `whatsapp_sessions`, `conversations`

### WhatsApp — system prompt fetch
- **URL:** `/api/integrations/whatsapp/system-prompt`
- **Method:** POST (likely)
- **File:** [brands/windchasers/agent/src/app/api/integrations/whatsapp/system-prompt/route.ts](brands/windchasers/agent/src/app/api/integrations/whatsapp/system-prompt/route.ts) — Also in: master, proxe
- **Purpose:** Returns a brand-specific system prompt with customer context for use by an external WhatsApp bot.
- **Auth:** Likely none (helper endpoint).

### WhatsApp — templates browser
- **URL:** `/api/whatsapp/templates`
- **Method:** GET (list), POST (test send)
- **File:** [brands/windchasers/agent/src/app/api/whatsapp/templates/route.ts](brands/windchasers/agent/src/app/api/whatsapp/templates/route.ts) — windchasers only
- **Purpose:** Lists Meta-approved message templates from the WhatsApp Business Account; POSTs send a test template message.
- **Auth:** None at the handler — relies on `META_WHATSAPP_*` env vars.

---

### Voice — Vobiz answer URL (PlivoML)
- **URL:** `/api/agent/voice/answer`
- **Method:** GET, POST
- **File:** [brands/windchasers/agent/src/app/api/agent/voice/answer/route.ts](brands/windchasers/agent/src/app/api/agent/voice/answer/route.ts) — windchasers only
- **Purpose:** PlivoML/PlivoXML answer-URL for Vobiz inbound and outbound calls. Returns XML that opens a bidirectional WebSocket stream into the voice server.
- **Auth:** None — called by Vobiz with form-encoded body. Trusts caller.
- **Expected payload:** form-encoded `From`, `To`, `CallUUID`, plus URL params `direction`, `lead_name`, `lead_phone`.
- **Returns:** `text/xml` `<Response><Stream ...>wss://voiceproxe.bconclub.com/ws</Stream></Response>`

### Voice — outbound test call
- **URL:** `/api/agent/voice/test-call`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/agent/voice/test-call/route.ts](brands/windchasers/agent/src/app/api/agent/voice/test-call/route.ts) — windchasers only
- **Purpose:** Place an outbound call via Vobiz's REST API to a given phone number; the answer URL points back to `/api/agent/voice/answer`.
- **Auth:** **None on the handler** (no API-key check). Uses `VOBIZ_AUTH_ID/AUTH_TOKEN` env vars to call Vobiz.
- **Expected payload:** `{ phone, leadName?, direction?: 'outbound' }`
- **Returns:** `{ success, callId }` or `{ success: false, error }`

### Voice — inbound bridge (call data)
- **URL:** `/api/integrations/voice`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/integrations/voice/route.ts](brands/windchasers/agent/src/app/api/integrations/voice/route.ts) — Also in: master, proxe
- **Purpose:** Accepts post-call data from a voice integration (call_id, transcript, duration, booking info) and stores it.
- **Auth:** `x-api-key` must match `VOICE_API_KEY`.
- **Writes to:** `sessions`

---

### Internal scoring webhook
- **URL:** `/api/webhooks/message-created`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/webhooks/message-created/route.ts](brands/windchasers/agent/src/app/api/webhooks/message-created/route.ts) — Also in: master, proxe
- **Purpose:** Internal fanout webhook called by every channel handler after writing a message. Triggers AI lead scoring.
- **Auth:** **None.** Treated as internal but is publicly POSTable.
- **Expected payload:** `{ lead_id: string, message_id?: string }`
- **What it does:** POSTs to `/api/leads/score` with the same `lead_id`.
- **Returns:** `{ success, message, score_data? }`

### Score a lead
- **URL:** `/api/leads/score`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/leads/score/route.ts](brands/windchasers/agent/src/app/api/leads/score/route.ts) — Also in: master, proxe
- **Auth:** Loose — calls `auth.getUser()` but does not block when null (allows service-role / internal callers). Effectively open.
- **Payload:** `{ lead_id }`
- **Writes to:** `all_leads` (score, stage)

### Rescore all leads (cron)
- **URL:** `/api/leads/rescore-all`
- **Method:** POST
- **File:** [brands/windchasers/agent/src/app/api/leads/rescore-all/route.ts](brands/windchasers/agent/src/app/api/leads/rescore-all/route.ts) — Also in: master, proxe
- **Auth:** `Authorization: Bearer <CRON_SECRET>`.
- **Purpose:** Daily background job — recomputes score and `days_inactive` for every active lead.
- **Writes to:** `all_leads`

### Booking reminders cron
- **URL:** `/api/cron/booking-reminders`
- **Method:** GET
- **File:** [brands/windchasers/agent/src/app/api/cron/booking-reminders/route.ts](brands/windchasers/agent/src/app/api/cron/booking-reminders/route.ts) — windchasers only
- **Auth:** `Authorization: Bearer <CRON_SECRET>`.
- **Purpose:** Sends 24h / 1h / 30m WhatsApp template reminders for upcoming bookings; sets `reminder_24h_sent` / `reminder_1h_sent` flags to dedupe.
- **Writes to:** `whatsapp_sessions` (reminder flags). Calls Meta Graph API.

### WhatsApp delivery-status sync cron
- **URL:** `/api/cron/sync-whatsapp-status`
- **Method:** GET, POST
- **File:** [master/agent/src/app/api/cron/sync-whatsapp-status/route.ts](master/agent/src/app/api/cron/sync-whatsapp-status/route.ts) — master only (not in windchasers/proxe brand copies)
- **Auth:** `CRON_SECRET` header.
- **Purpose:** Daily reconciliation — pulls statuses for pending/sent messages from Meta to fill gaps from missed webhooks.

---

### Widget — embed loader script
- **URL:** `/api/widget/embed.js`
- **Method:** GET
- **File:** [brands/windchasers/agent/src/app/api/widget/embed.js/route.ts](brands/windchasers/agent/src/app/api/widget/embed.js/route.ts) — Also in: master, proxe
- **Purpose:** The third-party-embeddable script. Returns JavaScript that injects an iframe pointing to `<base>/widget/bubble`. This is what website owners include via `<script src="https://proxe.windchasers.in/api/widget/embed.js"></script>`.
- **Auth:** None — fully public.
- **Returns:** JS source as `application/javascript` (effectively).
- **CORS:** Public by design — middleware origin pin still applies to the response headers.

---

### Web-agent integration (multi-action)
- **URL:** `/api/integrations/web-agent`
- **Method:** GET (list leads), POST (multi-action)
- **File:** [brands/windchasers/agent/src/app/api/integrations/web-agent/route.ts](brands/windchasers/agent/src/app/api/integrations/web-agent/route.ts) — Also in: master, proxe
- **Auth:** **None enforced** on POST or GET (the file even comments "AUTHENTICATION DISABLED").
- **Purpose:** Old multi-purpose endpoint used by the previous standalone web-agent. POST takes an `action` ∈ `'open' | 'message' | 'profile' | 'button' | 'summary'` and an `external_session_id`, then either creates a session, attaches a profile, logs a message, records a button click, or updates a conversation summary.
- **Expected payload (POST):** `{ action, external_session_id, name?, email?, phone?, brand?, message?, conversation_summary?, user_inputs_summary?, booking_status?, booking_date?, booking_time?, brand_data?, metadata? }`
- **Writes to:** `web_sessions`, `all_leads`, `conversations`
- **Returns:** `{ success, lead_id?, session_id?, message }`
- Mostly superseded by `/api/agent/web/chat` but still wired up.

---

### Knowledge base
- **URL:** `/api/knowledge-base`
- **Methods:** GET, POST
- **File:** [brands/windchasers/agent/src/app/api/knowledge-base/route.ts](brands/windchasers/agent/src/app/api/knowledge-base/route.ts) — Also in: master, proxe
- **Auth:** Supabase session (dashboard auth).
- **Sub-routes:** `/api/knowledge-base/[id]` (GET/PUT/DELETE), `/api/knowledge-base/[id]/reprocess`, `/api/knowledge-base/text`, `/api/knowledge-base/upload`, `/api/knowledge-base/url`. All authenticated.
- **Writes to:** `knowledge_base`

---

### Auth
- **URL:** `/api/auth/invite` — POST. Admin-only (checks `dashboard_users` role). Sends a Supabase magic-link invite.
- **URL:** `/api/auth/sync-session` — POST. Accepts `{ access_token, refresh_token, ... }` and writes the session into the SSR cookie store. Used by client-side login flows. **No auth** (it's the auth establishment endpoint itself).

### Admin / backfill
- **URL:** `/api/admin/create-booking` — POST. Authenticated (Supabase user session). Manual booking creation for an existing lead.
- **URL:** `/api/admin/backfill-leads` — GET. Auth via `?secret=backfill-leads-2026` (hardcoded). Extracts profile fields from `whatsapp_sessions` and writes to `all_leads`. windchasers only.
- **URL:** `/api/admin/backfill-calendar` — GET. Backfills a hardcoded list of bookings into Google Calendar. windchasers only.

---

### Health / diagnostics
- **URL:** `/api/health` — GET. Returns `{ status: 'ok', timestamp }`. No auth. nginx routes this with `access_log off`.
- **URL:** `/api/build-info` — GET. Returns `{ version, buildTimestamp, buildDate }`. No auth.
- **URL:** `/api/status` — GET. Detailed self-diagnostic: env-var presence, Supabase reachability, auth health, DB connectivity, Claude API key format, WhatsApp/Web agent reachability, performance metrics. **No auth — leaks internal config metadata** (env-var names that are set, masked Supabase URL, masked anon-key prefix, response times, RLS recommendations). Treat as semi-sensitive.
- **URL:** `/api/status/error-logs` — GET. Reads from in-memory `errorLogger`. No auth.

---

### Dashboard (auth required — Supabase session)

All routes below require a logged-in dashboard user (Supabase `auth.getUser()`). They live under `/api/dashboard/*`. Listing them flat with one-line descriptions:

| Path | Method(s) | What it does | Brand/Master |
|---|---|---|---|
| `/api/dashboard/leads` | GET, POST | List leads with filters; create lead | All |
| `/api/dashboard/leads/[id]` | GET, PATCH, DELETE | Lead detail/CRUD | windchasers |
| `/api/dashboard/leads/[id]/score` | GET/POST | Manual rescore for a lead | All |
| `/api/dashboard/leads/[id]/status` | PATCH | Update lead status | All |
| `/api/dashboard/leads/[id]/stage` | PATCH | Update lead stage | All |
| `/api/dashboard/leads/[id]/override` | POST | Toggle manual override (skip auto-scoring) | All |
| `/api/dashboard/leads/[id]/summary` | GET | AI summary of the lead | All |
| `/api/dashboard/leads/[id]/activities` | GET | Activity timeline | All |
| `/api/dashboard/leads/[id]/admin-notes` | POST | Add admin note | windchasers |
| `/api/dashboard/leads/[id]/log-call` | POST | Log a manual call entry | windchasers |
| `/api/dashboard/metrics` | GET | Top-level dashboard counters | All |
| `/api/dashboard/founder-metrics` | GET | Founder-specific KPIs | All |
| `/api/dashboard/insights` | GET | LLM-generated insights | All |
| `/api/dashboard/summarize` | POST | Summarize a conversation | All |
| `/api/dashboard/bookings` | GET | List bookings | All |
| `/api/dashboard/changelog` | GET | App changelog feed | windchasers |
| `/api/dashboard/channels/[channel]/metrics` | GET | Per-channel metrics | All |
| `/api/dashboard/web/messages` | GET | Web channel messages | All |
| `/api/dashboard/whatsapp/messages` | GET | WhatsApp messages list | All |
| `/api/dashboard/tasks` | GET | List agent_tasks | All |
| `/api/dashboard/tasks/[id]/action` | POST | Run/skip/snooze a task | windchasers |
| `/api/dashboard/flows` | GET | Funnel/flow stats | windchasers + root `src/app/api` |
| `/api/dashboard/flows/stats` | GET | Funnel breakdown stats | windchasers + root `src/app/api` |
| `/api/dashboard/flows/templates` | GET, POST, PUT, DELETE | Template assignment per stage | root `src/app/api` only |
| `/api/dashboard/flows/sync-meta` | POST | Sync flow templates with Meta | root `src/app/api` only |
| `/api/dashboard/flows/submit-meta` | POST | Submit a template to Meta for approval | root `src/app/api` only |
| `/api/dashboard/inbox/reply` | POST | Send a reply from the inbox UI | windchasers |
| `/api/dashboard/settings/widget-style` | GET, PUT | Widget style settings | All |
| `/api/settings/widget-style` | GET, PUT | Public widget style fetch (used by widget iframe) | All |

Other auth-gated dashboard helpers in root `src/app/api/`: `dashboard/leads/context` (GET — context for lead modal), `dashboard/leads/stage` (PATCH), `dashboard/leads/summary` (GET).

---

## Endpoints potentially useful for WindChasers website integration

Filtering the inventory to routes that `pilot.windchasers.in` (or any windchasers website / landing page) could call to push data into the PROXe backend:

| Endpoint | Auth | Best for |
|---|---|---|
| `POST /api/agent/leads/inbound` | `x-api-key: INBOUND_API_KEY` | **Generic inbound lead** — designed exactly for this. Accepts JSON or form-urlencoded. Schedules a `first_outreach` task automatically. |
| `POST /api/integrations/landing-pages` | `x-api-key: WHATSAPP_API_KEY` | **Landing-page form submission** with course/training/UTM fields and a visible inbox conversation row. |
| `POST /api/website` | `Authorization: Bearer WEBHOOK_SECRET` | **Generic website form** (contact / newsletter). Auto-sends a `bcon_welcome_web_v1` WhatsApp template to new leads. |
| `POST /api/agent/web/chat` (SSE) | None | **Embedded chat**. Used by the widget; can be called directly to drive a chat from your own UI. |
| `POST /api/agent/calendar/availability` | None | Show available slots in the booking UI. |
| `POST /api/agent/calendar/book` | None | Confirm a booking. Use `checkOnly: true` to ask "is this lead already booked?" without writing. |
| `GET /api/widget/embed.js` | None (public) | Drop-in `<script>` tag to add the chat bubble to any page. |

### Recommended endpoint per WindChasers use case

| Website use case | Recommended endpoint | Why |
|---|---|---|
| **PAT submission** (Pilot Aptitude Test) | `POST /api/agent/leads/inbound` with `source: "pat"` (custom value, will be stored as-is) and the test answers in `custom_fields` | Already handles arbitrary `custom_fields`, schedules first outreach, and dedupes by phone. |
| **Guide download lead capture** | `POST /api/integrations/landing-pages` with `form_name: "guide_download_<title>"` and the guide title in `course_interest` | Posts a visible `landing_page` conversation so the inbox shows what they downloaded; UTM fields built in. |
| **Demo booking** | `POST /api/agent/calendar/availability` to render slots → `POST /api/agent/calendar/book` to confirm | Already what the chat widget uses. Use `checkOnly: true` first to short-circuit if the lead already booked. |
| **Visit booking** (in-person) | `POST /api/agent/calendar/book` with a custom `sessionType: "visit"` | Same booking pipeline; sessionType propagates into the calendar event description. |
| **Generic form submission** (contact form, callback request) | `POST /api/website` with `form_type: "contact"` and `brand: "windchasers"` | Auto-sends WhatsApp welcome template if a phone is provided; handles email-only fallback via `bconclub.com/api/send-email`. |
| **Eligibility / early-stage form** | `POST /api/agent/leads/inbound` with `source: "eligibility"`, `urgency`, `city`, and answers in `custom_fields` | Stages the lead with a `first_outreach` task without spending Meta template quota; lighter-touch than `/api/website`. |

Notes for any of the above:
- All "public" routes (chat, calendar, widget) hit middleware that pins `Access-Control-Allow-Origin` to `https://goproxe.com`. To call them from `pilot.windchasers.in` in a browser, either (a) add `pilot.windchasers.in` to the allowed origins in `brands/windchasers/agent/middleware.ts`, or (b) call from server-side code on the website.
- The `INBOUND_API_KEY` and `WHATSAPP_API_KEY` are shared secrets — never embed them in client-side JS. Form submissions should go through a server-side proxy on the windchasers site.
- New leads default to `brand` = `process.env.NEXT_PUBLIC_BRAND` (or `'bcon'` in inbound, `'windchasers'` in landing-pages). Always send `brand: "windchasers"` explicitly to avoid mis-bucketing.

---

**Report path:** `docs/ENDPOINT_INVENTORY.md` — i.e. `C:\Users\user\Builds\PROXe\docs\ENDPOINT_INVENTORY.md`
