# BCON — Changelog

> Brand-specific changelog for **BCON** (`proxe.bconclub.com`). Records what changed in this brand and when. Company-wide history across all brands lives in the repo-root [`/CHANGELOG.md`](../../../CHANGELOG.md). Core changes that belong to every brand should flow BCON → `master` → all branches (see the root changelog's propagation note).
>
> Version auto-bumps per commit that touches `brands/bcon/agent/` (pre-commit hook). Current line: 0.0.21+.

## 2026-07-01 · Dashboard greeting uses the edited name, not the email prefix

- The dashboard greeting ("Good morning, X") read `full_name` from Supabase auth `user_metadata`, but the name edited in User Management is stored in the `dashboard_users` table - two different stores. So renaming a user to "Thanzeel" still greeted them "...Connect" (the `connect@bconclub.com` email prefix). Greeting now reads `dashboard_users.full_name` first, then falls back to auth metadata, then the email prefix.
- Owner display + last-touch actor badge already prefer `full_name` (via the team-members endpoint), so re-assigning an owner now stores the real name. Note: owner/actor values snapshotted BEFORE a name edit keep their old label until the next action.
- User-facing: editing a team member's name in User Management now reflects in the dashboard greeting.
- (pending commit)

## 2026-07-01 · WhatsApp prompt v3 - flow-tree rewrite

- Replaced the WhatsApp system prompt (`bcon-prompt.ts`) with the new v3 supplied by the user: "smart friend" tone, HARD RULES block, a branching FLOW TREE (How it works / Get more leads -> AI in Marketing / Content with AI / AI Lead Machine), UNDERSTAND-before-push (max 2 probes), a BOOKING OVERRIDE priority block, and KB-RULES that pull named blocks (PRICING/LEAD_MACHINE/CASES/AUDIT) only when triggered.
- Kept the `getBconSystemPrompt(context, messageCount)` signature; wired the KB `{{context}}` placeholder to the existing `${context}` var and kept the messageCount first-message signal.
- Stripped em-dashes from the supplied section headers (the prompt's own HARD RULE bans them).
- Welcome line + buttons unchanged from the version already shipped in `7fe95915`, so the LLM path and the keyword quick-reply stay in lockstep.
- Note: KB-block pulls depend on the knowledge base, which is still broken in prod (empty chunks / RPC error, separate open item).
- (pending commit)

## 2026-07-01 · New WhatsApp first-message greeting + buttons

- Updated the WhatsApp opening line and its 3 routing buttons per direct request. Body: "Hey! I'm PROXe, BCON's marketing AI. We help businesses get more customers using AI. What brings you here?" Buttons: Get more leads / How it works / Book a call.
- Changed in BOTH first-message paths that must stay in lockstep (same voice whether the LLM path or the keyword quick-reply shortcut fires): `bcon-prompt.ts` CORE LINE and `quickReplyMap.ts`'s `greeting` trigger.
- Website prompt greeting is unchanged — this was scoped to WhatsApp only.
- User-facing: every new WhatsApp conversation opens with the new line + buttons.
- (pending commit)

## 2026-07-01 · Team Members: inline name editing, incl. your own

- Team Members table had no way to edit a name/username at all — only role dropdown + deactivate. Added inline edit (pencil icon on hover → input → save/cancel) wired to the existing (already-built) `PATCH /api/dashboard/users/[id]` full_name field.
- The API blanket-blocked ANY self-edit (role, status, AND name) to prevent admin lockout — that's why the single admin in a fresh team couldn't touch their own row at all. Narrowed the self-block to role/is_active only; editing your own display name is safe and now allowed.
- Known gap (not fixed here): only admins can hit this endpoint at all, so a viewer still can't edit their own name — email editing also isn't exposed (it's the Supabase auth identity, not just a display field, so needs a separate auth.updateUser flow).
- (pending commit)

## 2026-07-01 · One universal enrolment GATE — leads can never double-stack sequences

- Root cause of the stacked Day-1/Day-3 duplicates: each note-handler branch (RNR, DEMO_TAKEN, PROPOSAL_SENT, POST_CALL) had its own hand-maintained list of task types to cancel before enrolling a lead in a new sequence, and those lists had drifted out of sync — most were missing `follow_up_day7/day30/day90`, so a worker ONE_TOUCH ladder's long tail survived and stacked under the new note-created ladder.
- Replaced all four ad-hoc cancel lists with a single `cancelPendingFollowUps()` gate backed by one canonical `ALL_FOLLOWUP_TASK_TYPES` superset. Every branch that starts a sequence now clears the lead's entire existing follow-up ladder first. A lead is only ever in ONE ladder.
- Added the gate to POST_CALL too (it previously stacked a post-call nudge on top of a live ghost ladder).
- The worker scanner was already guarded (pending-task exclusion + 72h cooldown + createTaskIfNotExists) — the leak was entirely in the note path.
- User-facing: logging any call outcome or stage-change note no longer leaves duplicate follow-up tracks; note: this prevents NEW dupes, it does not retro-clean leads already stacked before this shipped.
- (pending commit)

## 2026-07-01 · Next Actions: real day labels instead of generic "Follow-up"

- Timeline steps were all labelled "Follow-up" regardless of which day of the cadence they were — now derives "Day 1", "Day 3", "Day 7", "30 min", "Voice call" etc. straight from the task_type (follow_up_day3, booking_reminder_30m, ...).
- AI-dynamic steps (no fixed Meta template — message is LLM-authored at send time) now say so explicitly instead of a vague "generated at send time" placeholder, and point at the reason/angle line right below it.
- User-facing: the lead panel Next Actions timeline now reads as an actual day-by-day cadence.
- (pending commit)

## 2026-07-01 · Fixed double-sequence enrolment on RNR (busy/call-back) notes

- `noteOrchestrator`'s RNR branch (logged when a call connects but the lead says "call back later") only cancelled pending booking reminders before starting its own 4-step follow-up sequence — it never cancelled a lead's pre-existing follow-up ladder (e.g. the worker's ONE_TOUCH scanner). A lead already mid-ladder got double-enrolled, stacking both sequences' tasks in Next Actions (this is what showed up as 5+ near-duplicate "WhatsApp Follow-Up" cards on Jai).
- Now cancels `follow_up_day1/3/5/7/30`, `follow_up_24h`, `nudge_waiting`, `push_to_book`, `re_engage` before creating the RNR sequence — mirrors the existing guard already in the DEMO_TAKEN/PROPOSAL_SENT branches.
- User-facing: logging a "connected, will call back" note no longer creates a duplicate follow-up track for leads already in a cadence.
- (pending commit)

## 2026-07-01 · Config hub reorder + sequence-aware Next Actions timeline

- Settings page (`/dashboard/settings`): Appearance/Theme/Widget Appearance/Preview now lead the page; The Brain, Team & Access, Features, WhatsApp Templates, and Config link-cards moved below.
- Lead modal Next Actions rebuilt as a horizontal step timeline — click a step to expand the exact filled outgoing template message plus which sequence/step it belongs to, instead of a flat "WhatsApp Follow-Up" list with no content.
- Lead owner assignment moved out of the modal header into the footer, next to the lead ID.
- User-facing: clicking a Next Action now shows what will actually be sent, not just a generic label.
- (`f54e9380`)

## 2026-07-01 · STOP opt-out compliance (5 of the newly-wired cadence templates require it)

- WhatsApp webhook now intercepts a literal "stop" reply BEFORE the quick-reply/LLM pipeline, marks the lead `opted_out`, cancels every pending `agent_task`, and sends one fixed (non-LLM) confirmation. Worker's two follow-up scanners and `executeTask`'s final send-time check all honor the flag, so an opted-out lead is never auto-messaged again — including a task already queued before the opt-out.
- User-facing: a lead tapping STOP on any cadence template now gets a clean, quiet opt-out instead of continuing to receive follow-ups.
- (`400707a8`)

## 2026-07-01 · Unified WhatsApp greeting voice + wired 7 unused approved cadence templates

- WhatsApp's LLM-path first-message copy ("Real human energy, AI speed...") didn't match the approved quick-reply greeting ("Hey, lovely to have you here...") — now identical wording/buttons regardless of which path fires on message #1.
- Web widget's third quick button: "View Use Cases" → "AI Lead Machine".
- Found 7 Meta-**approved** templates (`bcon_onetouch_d1/d3/d7/d30_v1`, `bcon_lowtouch_d1/d3/d7_v1`) that were never referenced anywhere in the worker — purpose-built day-1/3/7/30 cadence with `pain_point`/`business_name` personalization and Meta-required STOP buttons, verified live against the Meta Graph API. `getTemplatePreview()` now routes by `task.metadata.bucket` (ONE_TOUCH → onetouch_dN, DEMO_TAKEN/PROPOSAL_SENT → lowtouch_dN) instead of defaulting every send to the same generic `bcon_proxe_followup_noengage` body — the actual root cause of "same message every day."
- User-facing: ghost and engaged leads now get real, varied, personalized follow-ups instead of one repeated generic line.
- (`90571446`)

## 2026-07-01 · Web-form lead dedup + response_count column didn't exist

- `app/api/website/route.ts` (the web-form endpoint) hand-rolled its own duplicate-check instead of the shared `ensureOrUpdateLead()` used by WhatsApp/web-chat — no race-safe retry, so a person contacting through two channels got two lead rows. Phone-present submissions now route through the shared dedup path.
- `all_leads` has **no `response_count` column** at all — any query selecting it 400s the whole request in PostgREST. This silently broke template rotation (always fell to the same default), the day-1/3/5/7 eligibility scanner, and the log-call decision hub's context snapshot. Reply count is now computed live from `conversations` via a shared helper everywhere it's needed.
- (`95dd89c8`)

## 2026-06-22 · Config page (phase 1 — admin-only visibility)

- New **Config** nav entry + `/dashboard/config`: admin-only view of every integration's status + non-secret identifiers + whether each secret is set (never the value), plus lead sources, connected channels, and lead fields. New admin-gated `GET /api/dashboard/config` reads status from env. Phase 2 = write-only token editing (next).

## 2026-06-22 · Flows Triggers + Sequences → master-detail (match Stages hero)

- Rebuilt both tabs as left list + right detail panel like the Stages page: list rows with a status dot, detail panel as a lifted `bg-secondary` card with `bg-tertiary` section cards. Sequences detail shows a numbered vertical step chain (template + Meta status per step) + an `N/total ready` count; Triggers detail shows event, timing, and the template fired.

## 2026-06-22 · Flows lands on Stages + Triggers/Sequences cards lifted

- Default view → **Stages** (the hero); toggle order Stages · Sequences · Triggers. Triggers + Sequences cards lifted to `bg-secondary` + soft shadow (were flat `bg-tertiary`), step chips nest on `bg-tertiary` — first pass to make the three tabs visually cohesive.

## 2026-06-22 · Flows = Sequences (default) · Triggers · Stages

- Reinstated **Stages** and split the page into three toggles: **Sequences** (default landing), **Triggers**, **Stages**. `FlowsAutomation` gained a `section` prop (renders sequences-only or triggers-only); `flows/page.tsx` defaults to the Sequences view. Corrects the earlier change that removed Stages.

## 2026-06-22 · Flows = Triggers + Sequences only (Stages tab removed)

- Flows now shows just **Triggers** (event-fired automations) + **Sequences** (multi-step chains); removed the toggle into the redundant 9-stage funnel view. Stages belong to the Pipeline, and the "sequences" already are the stage chains. Old stages/board/overview code is now unreachable (left for a later cleanup).

## 2026-06-22 · Flows page restyled to match the dashboard

- Brought `/dashboard/flows` (the 9-stage view) up to the dashboard's visual language: active card borders `2px → 1px`, detail-panel containers given a subtle `bg-tertiary` tint (were transparent/flat on the #000 page), active tint softened to `color-mix(… 7%)`, card radius unified to `12`, and legacy hardcoded `rgba(255,255,255,*)` borders swapped for `var(--border-primary)`. Pure styling; no behavior change.

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
