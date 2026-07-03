# BCON — Changelog

> Brand-specific changelog for **BCON** (`proxe.bconclub.com`). Records what changed in this brand and when. Company-wide history across all brands lives in the repo-root [`/CHANGELOG.md`](../../../CHANGELOG.md). Core changes that belong to every brand should flow BCON → `master` → all branches (see the root changelog's propagation note).
>
> Version auto-bumps per commit that touches `brands/bcon/agent/` (pre-commit hook). Current line: 0.0.21+.

## 2026-06-19 · Calls dashboard view + overview Calls KPI

- New **Calls** section: nav entry (Chats → Calls → Pipeline) + `/dashboard/calls` page listing inbound/outbound voice calls (direction, contact, duration, status, transcript turns, recording). Row → slide-in drawer with `<audio>` player + full transcript + summary.
- APIs `GET /api/dashboard/calls` (direction/status/search/date filters) and `GET /api/dashboard/calls/[id]`. Read-only over existing data: merges `voice_sessions` with `conversations` channel=voice rows (recording/summary/transcript) by `metadata.call_id === voice_sessions.external_session_id`.
- Overview: new **Calls** KPI card (in/out + 7-day sparkline) → `/dashboard/calls`; `founder-metrics` returns a `calls` block. No DB/schema change — pure view layer over the existing Vapi voice backend.

## 2026-06-18 · Settings: surface the token-usage link (was unreachable)

- BCON had the token-usage feature (`/tokens` → `/dashboard/tokens`) but no link to it — the Settings page still showed an "Other Settings… coming soon" placeholder. Replaced that with the **Token usage** card (matches WC) so it's reachable. Page + metering were already there; this just surfaces it.

## 2026-06-17 · More WC catch-up: known-contact prompt + web-chat & modal bug fixes

- **promptBuilder**: ported WC's KNOWN CONTACT block + `userEmail`/`userPhone` (tells the LLM which of name/phone/email are already captured so it never re-asks), keeping bcon's brand-switch + B2B form note.
- **web/chat bug fixed**: `postProcess()` referenced `messageCount` + `attributionSignal` that weren't its parameters (left out of scope by a refactor) — so web-lead capture, attribution, and summaries silently failed at runtime. Threaded both through. (bcon-specific drift; WC wasn't affected.)
- **LeadDetailsModal bug fixed**: admin-note mic + save buttons each had a duplicate `className` (React kept only the last → focus-ring class was dropped).

## 2026-06-17 · Catch up to Windchasers: token metering + clean-core sync

- **Token metering shipped** (was entirely missing — WC had it, BCON recorded nothing): `lib/token-usage.ts` + claudeClient now records usage, `/api/dashboard/token-usage` route, and the `/tokens` page. Stored as a key/value row (`dashboard_settings.key='token_usage'`) — no schema migration; already handles the `updated_by` UUID gotcha.
- **47 clean shared-core files re-synced from WC** (real improvements with no brand content, so they render with BCON's own theme = pixel-parity): MicroCharts, NotificationCenter, TodaySnapshotButton, WhatsAppTemplatePicker, EndpointHealthDetail, BookingsCalendar, ThemeProvider, founder-metrics, notifications/preferences/tasks/leads routes, attribution, businessCrawler, conversationLogger, dashboard-prefs, sound-prefs, claudeClient, status pages, calendar routes, etc.
- BCON-specific fixes so the synced core compiles cleanly: added `BRAND_ID` export to configs; kept `referrer` on `AttributionPayload`; `getAvailableSlots` accepts an optional (ignored) sessionType (BCON booking is single-type).
- `next build` VERCEL=1 EXIT 0, 46/46 pages (new `/tokens` page).
- Brand identity preserved — brand-touched files (home accent/copy, lead fields, prompts, whatsappSender templates) NOT touched; reconciled separately.

## 2026-06-17 · Cross-brand versioning + changelog

- BCON now auto-versions on commit like the other brands (was frozen at 0.0.20 — its build-time `increment-build.js` never committed back). `prebuild` dropped `increment-build.js`; committed `package.json` version (bumped by the shared pre-commit hook) is the single source of truth. First real bump: **0.0.20 → 0.0.21**.
- This per-brand changelog added.

## 2026-06-17 · Home synced to Windchasers latest

- **Engine Overview toggle** now 24h / 7D / 14D / All (added Today).
- **Engine funnel is a real per-window cohort:** `founder-metrics` returns a `funnel` map — of leads acquired in the window, how many reached each stage — so all five nodes (incl. Follow-up Due + Booked) scale with the window. FounderDashboard reads it with a fallback to the old per-metric counts.
- **Lighter KPI card tint** (7%→4% fill, 22%→14% border); **High Intent Leads** card now green (not red); **Upcoming Events** name gets breathing room (baseline row, date · owner grouped).
- Ports WC `ed1cbc7a` + `8735fa16` + `0cf5c08d` (brand theme/accent untouched).

## 2026-06-16 · Windchasers parity catch-up (pixel + functional), live

- **Home / FounderDashboard** redesigned to WC parity: top-bar greeting, KPI cards with status-coloured accents (Follow-up Health follows status), Engine Overview funnel, chip-style Upcoming Events, Priority Lead Queue, Conversations Trend chart.
- **Flows** funnel-first redesign (per-stage template manager: add/edit/approve/reject/delete).
- **Inbox**: anonymous web-visitor sessions surface before contact capture; real-WhatsApp-style template bubbles; Notes tab human-only.
- **Lead modal**: notes tab, name-edit, copy-details, WhatsApp markdown, lead merge, owner picker.
- **Engine**: noteOrchestrator (Haiku classifier; WA sends gated to the 24h window), quick-reply map (B2B), conversation intelligence (B2B schema), attribution (inbound + web + WhatsApp CTWA), lead ownership, dashboard prefs (sounds + theme), health strip + status page, NotificationCenter, today-snapshot, token-usage meter.
- **DB fixes**: created `activities` + `follow_up_templates` + `changelog` tables; `conversations.lead_id` made nullable.
- Auth re-enabled on dashboard routes; multiple data-integrity fixes (response-rate, avg-score, cancelled/completed task filters).
