# Changelog

## 2026-05-31 10:10 IST · Windchasers: At-a-Glance fixes + leads page 50-cap

- `founder-metrics/route.ts` — Avg Lead Score now uses `Math.floor` instead of `Math.round`, so a 40.x average reads 40% (was rounding up to 41%).
- `FounderDashboard.tsx` — Warm Leads card now shows a live warm-rate percentage (warm count ÷ total leads, one decimal) on the 'All' filter, mirroring how the Engaged Leads card shows engagementRate. Period filters still show the period label.
- `LeadsTable.tsx` — leads page was capped at 50 with no way to see more (data layer already loads up to 1000). Default display bumped 50→100 and the limit selector gained 100 / 250 / All options. Score-trend arrow lookup raised 50→250.
- User-facing: founders see all their leads (not just the first 50), Avg Lead Score reads correctly, and Warm Leads shows a percentage like Engaged Leads.
- Scope: Windchasers brand only.
- (240de142)

## 2026-05-31 09:54 IST · Dashboard At-a-Glance fixes + leads page 50-cap

- `founder-metrics/route.ts` — Avg Lead Score now uses `Math.floor` instead of `Math.round`, so a 40.x average reads 40% (was rounding up to 41%).
- `FounderDashboard.tsx` — Warm Leads card replaced the static "Score 40–69" caption with a live warm-rate percentage (warm count ÷ total leads, one decimal, matching the Engaged Leads card). It tracks the All/7D/14D/30D filter.
- `LeadsTable.tsx` — leads page was capped at 50 with no way to see more (data layer already loads up to 1000). Default display bumped 50→100 and the limit selector gained 100 / 250 / All options. Score-trend arrow lookup raised 50→250 to stay consistent with the larger view.
- User-facing: founders can now see all their leads (not just the first 50), Avg Lead Score reads correctly, and Warm Leads shows a percentage like Engaged Leads.
- Scope: bcon brand only; type-check clean for all three files.
- (911da396)

## 2026-05-30 16:03 IST · Open inbox conversation from lead-modal channel chips

- Lead modal: the Customer Journey channel chips (WhatsApp, web, etc.) were `cursor-pointer` but had no click handler — clicking did nothing. Each chip now deep-links to that contact's inbox thread via `/dashboard/inbox?lead=<id>&channel=<key>` and closes the modal, so one click jumps from a lead straight into their conversation on the channel you clicked.
- Pairs with the inbox-side `?lead=` / `?channel=` deep-link handling that selects the right thread and pre-sets the channel.
- Tooltip + aria-label changed to "Open <channel> conversation" (first-touch date + message count kept in the tooltip).
- User-facing: faster jump from a lead to their chat thread.
- Scope: Windchasers `LeadDetailsModal.tsx` only; type-check clean for the file. Shipped in commit 0b5b8390.
- (0b5b8390)

## 2026-05-30 15:59 IST · Capture customer email from chat, independent of booking

- Gap: a customer's email was only persisted when the book_consultation tool fired (via updateLeadProfile). The AI profile extractor (ConversationProfile) has no email field. So a lead who typed their email but whose booking didn't complete had the email silently dropped — it never showed on the lead modal (e.g. Swapnanil shared swapnanildutta346@gmail.com, no email recorded).
- `whatsapp/meta/route.ts` — new step 11b detects any email in the inbound customer message (regex) and persists it immediately via `updateLeadProfile(sessionId, { email }, 'whatsapp')`, which writes session.customer_email and syncs to all_leads.email. Runs on every message, before the booking flow, so email is captured regardless of whether a booking is ever made.
- User-facing: when a customer sends their email on WhatsApp, it now appears on the lead right away.
- Note: this is forward-looking — it fires on NEW inbound messages, so it won't retroactively backfill leads whose email was lost under the old code.
- (e5e7633c)

## 2026-05-30 15:53 IST · Booking reliability: real bookings, no leaks, Sunday-aware days, paragraphs

- BIGGEST BUG — bookings never completed: in a multi-turn WhatsApp flow the booking tools were only wired when one of the last 6 *user* messages had a booking keyword. By the time the user was just sending their email / "yeah" / "ok", "book a call" had scrolled out of that window, so tools got UNWIRED mid-flow. The model then typed the `book_consultation` args as text and falsely said "Done… locked" while nothing was booked (not in the dashboard, not on Google Calendar). Fix: new `isBookingFlowStep()` keeps tools wired whenever the LAST assistant turn was a booking step (asked for date/time/email, offered slots, "confirming for", "lock it in"). Applied to both the WhatsApp (`process`) and web (`processStream`) paths.
- Hallucinated-booking guard widened: it was gated on `needsBookingTools`, so the toolless free-typed "Done." slipped through. Now it fires whenever NO booking completed this turn and there's no pre-existing booking — overwrites the false confirmation with "hit a snag, let me try once more" and flags the lead for human follow-up.
- Tool-arg leaks scrubbed in `cleanResponse`: strips both JSON blobs (`{ "date": …, "session_type": "online", … }`) and bare leaked lines (a standalone `2026-05-31` ISO date and a standalone `online`/`offline`) so customers never see raw tool args.
- "Today" after hours via quick-reply: the hardcoded `quickReplyMap` "demo/book" trigger ([Today][This week][Pick a date]) bypassed the time-aware LLM flow and kept offering "Today" at 9 PM. Removed it — booking intent now flows into the LLM, which is time-aware and actually wires the tools.
- Sunday-aware day buttons: "Tomorrow" is no longer offered when tomorrow is a Sunday (we're closed Sundays). `promptBuilder` now computes the exact day buttons per turn — e.g. Sat after close → `[Monday][Pick a date]`, Sat daytime → `[Today][Monday][Pick a date]`. The upcoming-date list flags Sundays as CLOSED and the model is told never to offer/check/confirm a Sunday.
- Paragraphs on WhatsApp: `cleanResponse` was collapsing ALL whitespace (`\s{2,}`→space), which flattened `\n\n` paragraph breaks into one block. Now collapses spaces/tabs only and keeps newlines; the WhatsApp rules tell the model to split multi-part answers into 2-3 short paragraphs with the call-to-action on its own line.
- User-facing: calls actually get booked (or the lead is flagged, never a false "Done"); no raw JSON/date/online leaks; never offered a closed day; longer replies read as tidy paragraphs.
- (d3d14c83)

## 2026-05-30 15:41 IST · Lead summary: stop hallucinating, drop BCON "business" language

- Bug: a Windchasers lead with only one outbound outreach message (no reply) got a confident AI summary — "received initial outreach… no information about their business or needs has been shared… continue following up." All invented; there was nothing to summarize.
- `leads/[id]/summary/route.ts` — added a STEP 0 hallucination guard that runs BEFORE the cached-summary step: if there's no inbound reply AND no captured profile / key-info / booking, it skips Claude entirely and returns an honest line ("Not enough context yet to summarize {name} … Currently in the {stage} stage."), with `insufficientContext: true` in the payload. Runs ahead of caching so a previously-fabricated cached summary is replaced too.
- Rewrote the summary prompt for the aviation brand: it was copied from BCON and talked about "runs a furniture business / Meta ads / AI qualification" — that's where "business" leaked in. Now uses pilot-training framing (CPL/PPL/cabin-crew/counselling-call), bans inventing details, and explicitly forbids "haven't shared info about their business" since these aren't businesses. If context is thin, the model is told to reply exactly "Not enough context yet — more interaction needed to summarize this lead."
- User-facing: low-context leads now read "not enough context yet" instead of a made-up story, and summaries no longer talk about a "business" for pilot-training leads.
- (26764bb6)

## 2026-05-30 15:34 IST · Tint the whole call-log card by outcome

- Notes tab: the entire call-log card is now tinted by outcome, not just the badge — no-answer-type calls (No Answer / Busy / Voicemail / RNR / unreachable) read amber end-to-end, Connected (and outcome-less) calls stay green. Previously every call card was hardcoded green.
- Refactor: extracted a shared `isNoAnswerOutcome()` classifier used by both the badge (`getNoteOutcomeClass`) and the new card tint (`getCallCardClass`), so the two can never drift.
- User-facing: operators can scan the notes list and instantly see which calls connected vs didn't, by card color alone.
- Scope: Windchasers `LeadDetailsModal.tsx` only; type-check clean for the file.
- (32dac54b)

## 2026-05-30 15:33 IST · Fix relative-date math + slots as buttons + online = 3/4/5 PM only

- Bug: lead typed "next Monday" (today is Sat May 30) and the bot replied "next Monday (June 2)" — June 2 is a Tuesday; next Monday is June 1. The model was doing calendar arithmetic itself and getting it wrong.
- `promptBuilder.ts`: the injected IST context now includes a deterministic 14-day "upcoming dates" lookup (weekday → exact ISO date, today/tomorrow tagged) and instructs the model to resolve EVERY relative date by matching the list — never calculate. "Next <weekday>" = the soonest matching weekday listed.
- Online booking slots reduced to three fixed start times only — 3:00 PM, 4:00 PM, 5:00 PM IST (was a 30-min grid 3:00–5:30 PM that the bot inconsistently summarized to 3/4/5). `bookingManager.ts`: `BOOKING_WINDOWS.online` now `15:00–18:00` with `stepMinutes: 60`; `getAvailableBookingSlotStarts` honors a per-window step. Offline unchanged (30-min grid).
- WhatsApp booking Step 2 now presents open slots as tappable quick-reply BUTTONS (`[BTN: 3:00 PM][BTN: 4:00 PM][BTN: 5:00 PM]`, max 3, exact tool times) instead of a plain "I have 3, 4, or 5 PM" sentence.
- Window text updated everywhere it was stated: `engine.ts` tool description + both booking-hours error/info messages, and both the WhatsApp and web prompts.
- User-facing: relative dates resolve correctly, online demo times show as tap buttons, and only 3/4/5 PM are ever offered for online.
- (06e7b693)

## 2026-05-30 15:22 IST · Differentiate call-log outcomes + Notes refresh button

- Notes tab: the call-log outcome badge is now color-coded by outcome via new `getNoteOutcomeClass()` — Connected/interested/answered/booked read green, No Answer/Busy/Voicemail/RNR/unreachable read amber, anything else neutral slate (previously every outcome was hardcoded green, so No Answer and Connected looked identical).
- Notes tab: added a small Refresh button (top-right of the panel) that re-pulls the lead row and activity timeline on demand (`loadFreshLeadData()` + `loadActivities()`), so a just-logged note/call shows without closing and reopening the modal.
- User-facing: operators can tell answered vs unanswered calls apart at a glance, and can manually refresh notes.
- Scope: Windchasers `LeadDetailsModal.tsx` only; type-check clean for the file.
- Note: shipped in commit 9c24cfc3; this changelog row was added in a follow-up commit (the entry failed to stage with the original push).

## 2026-05-30 15:15 IST · Stop offering "Today" after the booking window closes

- Bug: a WhatsApp lead messaging at 8:35 PM was still offered a "Today" button and told "Let me check what's open today" — but online demos only run 3:00–6:30 PM IST, so today was long closed.
- `promptBuilder.ts`: the injected IST time context now computes live whether today is still bookable and tells the model what to do. Past close (or Sunday) → do NOT offer "Today" or say you'll check today; offer `[BTN: Tomorrow][BTN: Pick a date]` and note today's slots are done. Online-done-but-offline-open → default to Tomorrow unless they ask for an in-person visit. Still open → normal 60-min-lead behavior.
- `bookingManager.ts`: new `getBookableSlotStartsForDate()` drops slot starts already in the past when the requested date is today (IST). Wired into `getAvailableSlots` (returns no slots once today is fully past) and the Supabase availability fallback, so `check_availability(today)` can never hand back stale already-passed slots.
- Booking windows are unchanged: online 3:00–6:30 PM IST, offline 11:00 AM–7:00 PM IST, Mon–Sat.
- User-facing: after hours the bot now offers Tomorrow / Pick a date instead of pretending today is bookable.
- (908fe92f)

## 2026-05-21 16:45 IST · Call logs surface properly in Activity tab

- Team-typed activities (manual call logs, manual notes) now get their own amber bubble on the Activity timeline, matching the customer (emerald) / proxe (blue) bubble pattern. Previously fell into a muted-grey `<p>` paragraph under the icon, easy to miss.
- Pretty action label: `manual_call` → "Call · Connected" / "Call · No Answer" / etc. Outcome prefix `[Connected]` in the note body is parsed out and shown as a small badge in the bubble; the actual note text reads cleanly.
- Actor fix: `created_by` historically stored an email string and the join to `dashboard_users` (which expects UUID FK) silently returned nothing — actor showed as "Team Member" for every call log. Fallback added: when the join is empty but `created_by` looks like an email, surface the local part as the actor.
- Color: team activities now amber (`#F59E0B`) — distinct from PROXe (purple) and customer (green) so the timeline is scannable.
- User-facing: "Spoke to him he wants to jump in tomorrow for a call 2:30" now reads in a proper amber bubble with a `CONNECTED` badge above it and the actor's name below.

## 2026-05-21 16:25 IST · Booking flow: date quick-reply buttons + kill tool-call leak

- WhatsApp booking flow Step 1 now ends with `[BTN: Today][BTN: Tomorrow][BTN: Pick a date]`. Customers can tap instead of typing — extractButtonsFromLLMResponse already converts those markers into Meta interactive buttons.
- New HARD RULE in the booking prompt: NEVER type a tool name (check_availability, book_consultation) as text. Either invoke via tool-use mechanism or omit. Customer was seeing literal "check_availability(2026-05-21)" on WhatsApp because Claude described the call instead of firing it.
- Server-side belt-and-braces in `cleanResponse`: strips `check_availability(...)`, `book_consultation(...)`, bare tool names, and dangling "Let me check today's slots for you." preambles before the message ever leaves the agent.
- User-facing: booking conversations now show quick-tap date buttons + never leak raw function syntax.

## 2026-05-21 16:05 IST · Inbox bubbles: subtle 3-tier tint (customer / AI / template)

- Customer bubbles stay neutral on `var(--bg-secondary)`; PROXe AI free-form bubbles get a faint brand-gold tint (`rgba(201, 169, 97, 0.08)` bg, `0.25` border); template bubbles keep their WhatsApp-green tint.
- Three subtle but distinguishable tints — customer reads as "incoming", AI reads as "us", template reads as "Meta-approved canned send". Works in both themes.
- User-facing: glancing at a thread now tells you who said what without reading the header strip.

## 2026-05-21 15:55 IST · Inbox bubbles: WhatsApp-green templates + kill grid bleed-through

- Inbox chat bubbles got solid opaque backgrounds (`var(--bg-secondary)`) instead of the translucent `--bg-hover` / `--accent-subtle` tokens — the chat pane's dotted grid pattern was visible through every bubble. Added `backdropFilter: blur(8px)` belt-and-braces.
- Template bubbles now use the WhatsApp brand-green tint (`rgba(37, 211, 102, 0.10)` body, `0.45` border) with a `rgba(37, 211, 102, 0.18)` header strip + bright green "Template · WA" label. Reads as a Meta-approved template at a glance vs free-form AI replies.
- User-facing: chat thread looks clean (no dotted bleed-through); templates are unmistakable from regular agent replies via the green tint + header.

## 2026-05-21 15:35 IST · Today's snapshot: full-layout skeleton + rotating status

- Replaced the tiny "Loading…" stub in `TodaySnapshotButton` with a `SnapshotSkeleton` component that mirrors the final layout (4-KPI strip + 2×2 section grid with pulsing placeholders) so the modal expands into the real data instead of jumping from a small box.
- Added a rotating status line that cycles every 700ms through what's actually being fetched: "Pulling today's leads…" → "Counting PAT submissions & demos booked…" → "Sorting by lead score…" → "Ranking most active conversations…". Range-aware copy (today / 7d / 14d / 28d).
- User-facing: opening the snapshot no longer shows an empty mini-modal — it immediately shows the full panel shape with placeholders, plus a gold dot + helpful status text telling the user what's loading.

## 2026-05-21 15:10 IST · Lead modal Activity tab: WhatsApp formatting + readability

- Activity tab in `LeadDetailsModal` had the same literal-asterisk issue the inbox did: free-form AI replies on the WhatsApp channel rendered `*Fri, 22 May*` instead of bold. Added the same `renderWhatsAppMarkdown` helper used by the inbox and the bubble now picks the renderer by `activity.channel === 'whatsapp'`.
- Bumped bubble contrast — was `bg-emerald-50 dark:bg-emerald-900/20` over `text-emerald-900 dark:text-emerald-50` which read as washed-out grey on the dark timeline. Moved to `bg-{c}-100 dark:bg-{c}-900/40` with `text-{c}-950 dark:text-{c}-50` so the message reads cleanly in both themes.
- Width capped at 440px to match the inbox column convention. `whitespace-pre-wrap` added so multi-line WhatsApp content keeps its line breaks.
- User-facing: opening the Activity tab on any WhatsApp lead now shows readable bubbles with bold dates/times, not asterisk soup.

## 2026-05-21 14:50 IST · Inbox WhatsApp formatting + uniform bubble width

- WhatsApp AI free-form replies now render `*bold*`, `_italic_`, `~strike~` properly — previously only template bubbles got the WA-markdown treatment so AI replies (e.g. "Your demo is locked in for *Tuesday, May 26*") showed literal asterisks.
- All chat bubbles in the inbox capped at `max-w-[440px]` to match the template width — non-template bubbles used to stretch to 80% and ran visibly wider than the template card sitting right above them.
- User-facing: messages on the WhatsApp channel inside `/dashboard/inbox` now look like they do on WhatsApp itself (bold dates, no stray asterisks); template / AI / customer bubbles all share one column width.

## 2026-05-21 14:30 IST · Link prior chat session to lead on inbound

- `/api/agent/leads/inbound` now extracts `conversation_id` from `custom_fields.conversation_id`, `page_url`, or `referrer` query string (first hit wins).
- On match, repoints `web_sessions.lead_id` and backfills `conversations.lead_id` for orphan rows tagged with that `session_id`. Soft-fail so lead creation never blocks on the chat-linkage step.
- Backfilled the only historical orphan (Himadri Samadder — 10 messages from chat session `a625440e…` re-linked to her PAT-submitted lead).
- User-facing: the inbox no longer shows the same person split between "Web visitor · …" and a separate lead row; the chat → PAT → demo-booked journey reads as one continuous thread. (`731eeaa2`)

## 2026-05-21 14:10 IST · Multi-user dashboard polish

- Lead modal: Attribution split out of the Interaction tab into its own tab; Interaction reverted to just the 30-day calendar + stats grid.
- Inbox: anonymous web sessions actually show their messages now (was returning 0 rows because the synthetic `session:<sid>` key was being passed as a UUID to `lead_id`); right pane shows a "Anonymous web visitor" stub instead of stuck "Loading details…".
- Sign-out dropdown shows "Signed in as · <email>" header so testers see which account they're acting as.
- New `POST /api/auth/touch` heartbeat endpoint; `DashboardLayout` pings it on mount + every 60s while the tab is visible.
- `/dashboard/settings/users` column renamed `Last Login` → `Last Active`; new helper shows green-dot "Live now" within 2 min, then "X min ago" / "Xh ago" / "Xd ago". Page auto-refreshes every 30s. (`a71daae9`)

## 2026-05-21 14:00 IST · Keep googleapis out of the client bundle

- `LeadDetailsModal.tsx` imports `cleanDisplayName` directly from `@/lib/services/utils` instead of the `@/lib/services` barrel. Adding the `resend` import to the barrel had broken webpack tree-shaking enough to drag `bookingManager → googleapis → fs/net/child_process` into the client bundle and fail the Vercel build. (`c7e02872`)

## 2026-05-21 13:50 IST · Wire Resend into /api/dashboard/users

- The dashboard's invite UI POSTs to `/api/dashboard/users`, not `/api/auth/invite`. The Resend wiring was sitting orphaned in the latter. Mirrored `sendInvitationEmail()` into the users route with the same soft-fail contract.
- Both endpoints now send real invite emails via Resend from `noreply@pilot.windchasers.in`. (`6689502d`)

## 2026-05-21 13:30 IST · Auto-promote real name from chat

- `conversationIntelligence.ts` now also extracts `full_name` when the customer explicitly states their own name in chat. Defence-in-depth: cleaned via `cleanDisplayName()`, validated via `isLikelyRealPersonName()`.
- The WhatsApp meta webhook and web chat route promote `profile.full_name` to `customer_name` only when the stored name fails `isLikelyRealPersonName` (asymmetric — easy to upgrade junk → real, impossible to downgrade real → guess).
- User-facing: `♥⁠╣firru╠⁠♥` → "Firdose" automatically on next AI reply. (`f3ab04b1`)

## 2026-05-21 13:20 IST · SOURCE column never leaks 'WhatsApp' or 'Web'

- `LeadsTable.tsx` no longer surfaces stored attribution.source_label when the stored source is non-marketing (`whatsapp`/`web`/`form`/`voice`/`social`) — fixed the Path A leak where legacy May 19-20 leads kept rendering "WhatsApp" despite the upstream filter.
- New `NON_MARKETING_PLATFORMS` set short-circuits the final `channelConfig[source]` fallback to "Direct" for those platform values — Path B leak fixed too.
- DB backfill (out-of-band): 5 stale rows (Preeti, Mateen, Chanki, Basavaraj, Firdose) flipped from `attribution.source='whatsapp'` → `'ig' / Instagram` based on actual `raw_form_fields.utm_source`. (`7e944244`)

## 2026-05-21 13:00 IST · Multi-user readiness

- New `POST /api/auth/redeem-invite` server endpoint — uses service-role `auth.admin.createUser({ email_confirm: true })` so invitees skip Supabase's "verify your email" wall. Idempotent (falls back to `updateUserById` if the user already exists). Role allowlist on top.
- `accept-invite` page refactored to POST to the new endpoint then `signInWithPassword` to establish the cookie session, then route to `/dashboard`.
- `/api/auth/invite` now sends a real Resend email (branded HTML + plain-text fallback) — `lib/services/email.ts` new file, exported via the services barrel.
- `DashboardLayout`: re-enabled `handleLogout`; added "Sign out" item to the three-dot menu with a divider above it; removed the redundant "Endpoint Health" modal item (System Status page already shows it).
- Re-enabled the auth gate on 13 `/api/dashboard/*` routes that had been commented out. Removed 8 stale `const user = { id: 'system' }` placeholders.
- User-facing: invitees can log in straight after accepting the invite; admins see which account they're signed in as + can sign out from the sidebar; dashboard APIs no longer leak lead PII to unauthed callers. (`bd4cc381`)

## 2026-05-19 · fix(both brands): clear pre-existing TS errors + parent nav-item highlight on sub-pages

Two things in one commit, both related to the `DashboardLayout` active-detection logic.

**Pre-existing TS errors flagged earlier as #31, now killed:**
- `settings/users/page.tsx:153` (windchasers only — bcon doesn't have this page) passed `<DashboardLayout activeNavItem="settings">`, but the layout's props type never declared `activeNavItem`. The prop was a no-op anyway (layout derives active state from pathname). Removed.
- `DashboardLayout.tsx:734` referenced `healthOpen` / `setHealthOpen` without declaring them — picked up by a linter pass that added the `useState` for them at the top of the component, so this one resolved itself before commit.

**Bonus UX fix (mirrored to both brands):**
- The nav-item active matcher only checked `pathname === item.href`. So when on `/dashboard/settings/users` (a sub-page of Configure), NO nav item lit up. Added a `matchesSubPath` helper that also matches `pathname.startsWith(href + '/')`, excluding the bare `/dashboard` to avoid Overview lighting up everywhere. Now sub-pages correctly highlight their parent nav item (Configure for /settings/users, Knowledge for /settings/knowledge-base/*, etc.). Applied to both `windchasers` and `bcon` DashboardLayout for parity.

## 2026-05-19 · feat(windchasers) + fix(inbox UI): counsellor framing rewrite + booking name/email handling + light-mode bubble parity

Three landed in one commit:

**#12 — Counsellor framing (windchasers prompts, WA + web):**
- Cost-answer line rewritten from third-person ("A counsellor walks through the exact breakdown for your path on the call.") to second-person suggestive invitation ("Want me to set up a quick call with a counsellor so they can walk you through specifics?")
- Same rewrite applied to the web-prompt's parent-cost answer ("The counsellor will share current figures…" → "Want me to set up a quick call with a counsellor who can share current figures…?")
- New **COUNSELLOR FRAMING** rule block added to both prompts: do NOT mention the counsellor in messages 1 or 2 (user is still warming up); from message 3 onwards, always phrase as a suggestive second-person invitation, NEVER describe what the counsellor does in third person

**#14 — Booking confirmation script (windchasers WhatsApp):**
- BOOKING FLOW Step 3 rewritten from "Ask for EMAIL if you don't already have it" to a KNOWN-CONTACT-aware branching block:
  - Phone always KNOWN on WhatsApp — never ask
  - Name missing → "Got {date} at {time}. Drop your name and I'll lock it in."
  - Email missing → "Almost done. Drop your email so I can send the calendar invite."
  - Both missing → ask in ONE message
  - Both KNOWN → confirm line "Confirming for {first_name} at this number — lock it in?"

**#29 — Inbox bubble + EVENT pill light-mode parity:**
- Message bubble backgrounds switched from hard-coded `rgba(15,23,42,0.55)` / `rgba(255,255,255,0.10)` / `rgba(99,102,241,0.28)` to theme-aware `var(--bg-secondary)` / `var(--bg-hover)` / `var(--accent-subtle)`. Now reads correctly in BOTH light and dark mode instead of washed-out purple over white
- Borders on all three bubble types switched to `var(--border-primary)` / `var(--accent-subtle)` for theme adaptation
- Template card header strip now uses theme-aware accent + border tokens
- Dropped the redundant "Template" status-tag from the footer when the bubble already has the "Template · WA" header strip — was duplicating the label. Template name still shows beside the (now hidden) tag
- `EVENT` pill in the conversation list softened from solid `#22c55e` + white text to a low-opacity green tint (`rgba(34,197,94,0.15)` bg, `#16a34a` text) so it doesn't shout against either theme

## 2026-05-19 · style(both brands): sidebar nav — drop hard active border, switch to accent-tinted pill

The dashboard sidebar's active item rendered with a 2px solid left border + filled `--bg-hover` background, which read as "old-school" — hard line on the edge, generic neutral fill. Modernised both brand layouts to a current-pattern sidebar (Linear/Vercel/Notion style):

- `DashboardLayout.tsx` (windchasers + bcon): removed the `borderLeft` on active items entirely. Active background switched from `--bg-hover` (neutral) to `--accent-subtle` (low-opacity brand-accent tint). Active text + icon colour switched from `--text-primary` to `--accent-primary` — picks up the brand's gold/electric accent so the active row pops in brand colour. Border-radius bumped 6px → 8px to match the surrounding card style
- Inactive font weight bumped 400 → 500 for clearer hierarchy when nothing's active
- Hover handler now also lifts the inactive text from `--text-secondary` to `--text-primary` so a hovered row feels "ready to click" without competing with the active pill
- Transition list narrowed to the specific properties that animate (`background-color`, `color`, etc.) instead of the shorthand `background`, so the colour interpolation is smooth across themes

User-facing: cleaner, calmer sidebar. Active item is a soft accent-tinted pill, hover gives a gentle neutral tint, nothing has a hard edge. Same look on windchasers (gold) and bcon (whatever accent the brand resolves to).

## 2026-05-19 · fix(windchasers): inbox channel icons — drop coloured container, plain tinted icon

- `app/dashboard/inbox/page.tsx` (`ChannelIcon`): previously each channel rendered as a small white icon inside a coloured square (blue for Web, green for WhatsApp, purple for Voice, orange for Social). In the conversation list that meant a busy row of solid coloured chips next to every name. Replaced with the bare icon, tinted to the channel brand colour via a precomputed CSS filter for the white SVG line-art assets, and stroke-coloured directly for the inline Voice SVG. Icons sit cleanly alongside the lead name without competing for attention
- User-facing: the inbox conversation list reads as a single column of names and snippets with a small coloured glyph in front of each, instead of a row of coloured squares

## 2026-05-19 · feat(bcon): port brand-agnostic dashboard UI parity from windchasers

The bcon dashboard had been left behind on three recent visual improvements that landed on windchasers. Brought them across — explicitly scoped to brand-agnostic UI only, no aviation-specific fields (PAT, Type, Course, Path/Goal) crossed over.

- `LeadDetailsModal.tsx`:
  - Added the shared `CopyIconButton` helper component. Copy-on-hover icons (12px) now appear on the name (`h2`), email link, and phone link in the contact card. Click copies value with a 1.2s green-check confirmation
  - Replaced the inline AI orchestrator strip with a centered overlay inside the lead modal — blurred backdrop, card showing the operator's note text in italic quotes, a "Note added" title line, and each AI step animating in (classification → touchpoint update → task creation → stage change → summary refresh). Visible duration extended from 2s to 4.5s so the operator can read what happened. `noteProgress` state widened with `title` and `note` fields; `handleSaveAdminNote` now passes the note text and title

- `LeadsTable.tsx`:
  - New **LAST TOUCH** column between Source and Score. Channel (Voice / WhatsApp / Web / Form / …) renders as a coloured pill with brand-color tint; the actor — if recorded in `unified_context.last_actor` — renders below as `@username` muted text. Header alignment tightened (Lead/Contact left, everything else centered). Empty-state `colSpan` updated accordingly
  - `source` resolver now falls back to `last_touchpoint` instead of just `unknown`, matching windchasers behaviour

User-facing on bcon: lead modal now shows a clear "AI is processing your note" overlay with the note quoted back; copy icons on name/email/phone for quick clipboard grabs; new LAST TOUCH column makes it obvious which surface a lead's most recent activity landed on.

## 2026-05-19 · fix(windchasers): PAT auto-send was failing silently — language code mismatch + swallowed insert error

Diagnosis: when a lead completes the Pilot Aptitude Test, `/api/agent/leads/inbound` is supposed to fire `windchasers_pat_result_v1` to the lead and write a conversation row. Investigating a missing message for **Himadri samadder** (lead `b989eb3c-…`, score 102/150, tier moderate) revealed two compounding bugs:

1. **Three call-sites defaulted `languageCode` to `en_US`** (the new `send_template` route ×2, the legacy `/api/whatsapp/templates` POST), but every windchasers template (`windchasers_demo_online`, `windchasers_demo_offline_v1`, `windchasers_pat_result_v1`) is approved under language code **`en`** on Meta. Meta rejects with the cryptic 132001 "Template name does not exist in the translation" / "does not exist in en_US"
2. **The PAT-send branch in inbound/route.ts didn't check `.error` on the conversations insert.** So when Meta rejected the send, the insert that should have logged the failure for the operator… also went silently. The lead has `needs_human_followup = false` and no conversations row — the operator had no way to know the PAT message never went out.

Fixes:
- `api/whatsapp/templates/route.ts`, `api/dashboard/inbox/reply/route.ts` (×2): defaults flipped from `'en_US'` → `'en'`. Comment explains why
- `api/agent/leads/inbound/route.ts` PAT branch: capture `.error` from the conversations insert. If the log itself failed, flag `needs_human_followup = true` and log to console so the missing message surfaces somewhere
- Conversation metadata now also stores `sent_by: 'system (inbound webhook)'` and `template_language: 'en'` for audit
- Companion recovery (out-of-band): manually sent `windchasers_pat_result_v1` to Himadri (+918240894956) using the corrected `en` code — Meta accepted with `wamid.HBgMOTE4MjQwODk0OTU2…`. Wrote the conversation row marking `trigger='manual_recovery'`, `sent_by='operator (Sonnet via Claude Code)'`, and the exact reason

User-facing: PAT auto-send works again for every new submission. Existing leads with missing PAT messages can be recovered via the inbox template picker (which now also defaults to `en`).

## 2026-05-18 · feat(windchasers): WhatsApp template picker in the inbox reply bar

- New `WhatsAppTemplatePicker` component — popover anchored bottom-right of the inbox that fetches `/api/whatsapp/templates`, filters to APPROVED-only, lists templates with name + category + body preview, and lets the operator pick one to send. Templates with `{{1}}`, `{{2}}` body variables show inline inputs to fill them in, with a live preview of the rendered message before send. Template list is cached in localStorage for 10 min (the Meta API is slow and the list rarely changes; a refresh icon on the header forces a re-fetch).
- New WhatsApp-icon button in the inbox reply bar — visible only when the active channel is WhatsApp and a lead is selected. Sits between the AI sparkle and the text input.
- New `send_template` action on `POST /api/dashboard/inbox/reply`: calls Meta's template send via Cloud API, **skips the 24h window check** (templates are the legitimate bypass for out-of-window leads), and writes the rendered template body into the conversations table so the operator sees the actual message in the thread. The conversation log row also captures `template_name`, `template_language`, `template_params`, and `meta_message_id` in metadata for audit.
- User-facing: when the 24h reply window has expired, the operator can click the WhatsApp icon, pick an approved template, fill in name etc., and re-open the conversation. No more dead-end "24h window expired" state.

## 2026-05-18 · fix(windchasers): isHumanName tightening + em-dash post-processor sentence break

- `services/utils.ts` (`isLikelyRealPersonName`): added three new rejection heuristics so WhatsApp profile names that aren't real people stop reaching the greeting line.
  - **ALL-CAPS single word ≥ 3 letters** ("INTERIOR", "SHOP", "OFFICE", "COMPANY") → reject. Real names almost never appear as a single all-caps token in a profile field
  - **Business-suffix tokens** in any position (`enterprises`, `traders`, `mart`, `services`, `consultants`, `studios`, `agency`, `group`, `company`, `pvt`, `ltd`, `llc`, `inc`, `co`, `co.`, `and`, `&`, `solutions`, `systems`, `industries`) → "Sharma Enterprises" and "Joshi Traders Pvt Ltd" now treated as business names, not people
  - **Emoji-only / emoji-dominant** strings → reject (strip emoji, require ≥2 chars of actual letters remaining)
- `agent-core/engine.ts` (response post-processor): em/en dashes were being replaced with a bare `-`, producing run-on output like "Happy to help-what aspect..." Now replaced with a **`. ` sentence break**, plus cleanup of `..` artefacts and double-spaces. "Happy to help — what aspect..." → "Happy to help. what aspect..." (readable, no more glued words)
- User-facing: WhatsApp users with profile names like "INTERIOR" or "JOSHI TRADERS PVT LTD" are no longer greeted by that name; the bot falls back to the nameless greeting flow. The em-dash → hyphen squashing that produced "help-what" no longer happens.

## 2026-05-18 · feat(windchasers): current IST time in prompt + filter past slots in check_availability

- `agent-core/promptBuilder.ts`: the date line injected into every WhatsApp / web prompt now also carries the current IST clock time. Was `Today's date: 2026-05-18 (Monday)` — now `Current IST: 3:28 PM on Monday, 2026-05-18. When offering slots for "today", never propose a time earlier than 30 minutes from this moment.` Fixes the case where the bot offered "morning, afternoon, or evening" at 3:27 PM and then suggested a 3 PM slot at 3:28 PM
- `agent-core/engine.ts` (`check_availability` handler): when the requested date is today (IST), the tool now drops any slot whose start time is earlier than `now + 30 minutes`. If the filter leaves no slots, the tool returns an explicit `"No more slots available today. Ask the user if they would like tomorrow or another upcoming date — do NOT silently switch the date for them."` so the model has to confirm a date change rather than guessing
- `check_availability` tool description rewritten to spell out the server-side filtering rule, so the model doesn't try to second-guess or duplicate the logic
- User-facing: WhatsApp bot can no longer offer 3 PM at 3:28 PM. When today is exhausted, it explicitly asks about tomorrow instead of proposing a slot the user can't make

## 2026-05-18 · fix(windchasers): switching to Light mode breaks rest of dashboard

- `app/dashboard/settings/page.tsx`: the Aviation Gold accent preset was unconditionally overriding `--bg-secondary`, `--bg-tertiary`, `--text-primary`, `--text-secondary`, `--border-primary` with dark-brown / cream values via `style.setProperty` on `documentElement`. Those overrides persisted across navigation, so visiting Settings while in Light mode silently corrupted the light-mode CSS variables for every other page (Tasks, Leads, etc.) — text became unreadable
- Fix: only apply the Aviation Gold bg/text overrides when the current dashboard mode is NOT `bw-light`. The accent colour token (`--accent-primary` / `--accent-light` / `--accent-subtle`) is always applied; the dark-themed bg/text overrides only kick in for dark / brand modes
- Also: the settings useEffect now re-runs when `theme` changes, so toggling dark ↔ light immediately refreshes the accent application path (previously the useEffect only ran on mount, so the gold bg/text values lingered after a mode switch)
- User-facing: Light mode is now actually light across the entire dashboard, including after a visit to Settings

## 2026-05-18 · feat(windchasers): centered PROXe AI orchestrator overlay + LAST TOUCH column flip

- `LeadsTable.tsx`: flipped the LAST TOUCH column rendering — channel (Voice / WhatsApp / Web …) is now the primary pill with brand color tint, the actor (if present) renders below as `@username` in muted text. Previously the actor name was uppercase-bold-primary and the channel was the small sub-line, which buried the most important signal (which surface the touch landed on).
- `LeadDetailsModal.tsx`: moved the AI step-by-step progress panel from an inline strip next to the admin-notes form to a **centered overlay** inside the lead modal. While a note is being saved or a call is being logged, a blurred backdrop appears over the modal content with a card showing:
  - The note text the operator just wrote (in quotes, italic)
  - A title line ("Note added" / "Call logged · No Answer")
  - Each step animating in as the AI completes it (classification → touchpoint update → task creation → stage change → summary refresh)
  - Held visible for ~4.5s after the final step so the operator can read what happened (was 2s before, was easy to miss)
- Removed the old inline panel; the centered overlay replaces it for every code path that uses `noteProgress` (admin notes, call logging)
- User-facing: when you log a call or add an admin note, the AI's work is now front-and-centre instead of a thin strip you might miss, and you can see your own note text echoed back inside the same card

## 2026-05-18 · fix(windchasers): rename First Touch label "Whatsapp Prelaunch" → "WhatsApp Pop-Up"

- `services/attribution.ts`: `FIRST_TOUCH_LABELS` table now resolves `whatsapp_prelaunch`, `whatsapp_button`, and the space-separated form-type strings the website sends ("WhatsApp Prelaunch", "WhatsApp Popup") all to **"WhatsApp Pop-Up"** (hyphenated). Previously the title-case fallback was rendering "Whatsapp Prelaunch" for the space-separated form-type that the WordPress site actually sends, which bypassed the lookup
- DB cleanup: backfilled 2 existing windchasers leads whose `unified_context.attribution.first_touch_label` was "Whatsapp Prelaunch" → "WhatsApp Pop-Up" (also normalized `first_touch` to `whatsapp_prelaunch`)
- User-facing: leads list dashboard's First Touch column now reads "WhatsApp Pop-Up" instead of "Whatsapp Prelaunch"

## 2026-05-18 · fix(windchasers): reject junk customer_name values ("Interior", "Submit", etc.)

- New shared helper `isLikelyRealPersonName(value)` in `services/utils.ts` — rejects empty strings, brand names, common page/UI labels accidentally typed into the name field ("Interior", "Pilot Training", "Submit", "Open WhatsApp", …), digit-containing strings, and obvious test/placeholder values
- `api/agent/wa-prelaunch/route.ts`: validate `name` at the lead-capture boundary — a value that fails the check is silently dropped (logged as suspicious) so the lead is still created via phone alone, but `customer_name` is stored as null instead of the junk label. Update path no longer overwrites a previously-good name with a new bad one.
- `agent-core/promptBuilder.ts`: replaced the narrow `BRAND_NAMES` guard with the new shared helper. The "The user is X. Address them by name once…" line and the KNOWN CONTACT block both now skip the name when it doesn't look like a real person — so the agent stops greeting leads as "Interior! Happy to help…"
- DB cleanup: nulled `customer_name` for 1 windchasers lead (`73ffe6b8-…` / phone 917676383185) that was stored as "Interior"
- User-facing: in WhatsApp the agent now treats a junk-named lead as nameless (skips the greeting-by-name) and asks for their name in the natural KNOWN-CONTACT flow when needed

## 2026-05-18 · fix(windchasers): cancelled tasks leak into Next Actions — server + client filter

- `api/dashboard/tasks/route.ts`: added defensive filters to the pending query — `.neq('status','cancelled')`, `.neq('status','completed')`, and `.is('completed_at', null)`. The existing `.in('status', [pending, in_queue, queued])` should already exclude cancelled rows, but we observed cancelled tasks leaking through in the wild (suspected PostgREST/connection caching), so the extra clauses guarantee they never appear in Next Actions
- `LeadDetailsModal.tsx`: belt-and-suspenders frontend filter — drop any task whose `completed_at` is set, regardless of what status the API reports. Applied to both the Next Actions list and the "Next:" one-liner under the intelligence panel
- User-facing: cancelled / completed tasks no longer show up as pending Next Actions

## 2026-05-18 · fix(windchasers): dedupe first_outreach task on repeat inbound submissions

- `api/agent/leads/inbound/route.ts`: before inserting a `first_outreach` row, check whether any pending/queued/awaiting_approval task of the same type already exists for this `lead_id`; skip the insert (and log) if one is found. Prevents the dashboard from accumulating duplicate "First Outreach to X" cards when the same Meta form / PAT form fires twice for the same lead
- DB cleanup: cancelled 3 stale duplicate `first_outreach` rows (kept the oldest per lead) so the dashboard reflects the real state immediately — affected leads `dea38a62-…` (3 → 1) and `fc6b6489-…` Yalamati eswarsai (2 → 1)
- User-facing: Next Actions panel in the lead modal no longer shows duplicate outreach cards

## 2026-05-18 · feat(windchasers): lead modal copy-on-hover + collapsible attribution/PAT + rename Goal→Path

- `LeadDetailsModal.tsx`: added `CopyIconButton` helper component using `MdContentCopy`/`MdCheck` — renders a small (12px) copy icon that appears on row hover and copies the value to clipboard with a 1.2s "copied" check-mark confirmation
- Copy icons now appear on hover for: lead name (h2), email link, and phone link in the contact card
- Attribution panel (Source / First Touch / Last Touch) is now collapsible — click the "Attribution" header to expand/collapse; defaults to collapsed so the lead modal stays compact
- PAT Result panel is now collapsible — the score, tier badge, and chevron remain visible in the header (always-on summary), while the Qual/Apt/Rdy breakdown + 12th-eligibility detail are hidden until clicked
- Renamed "Goal:" label to "Path:" for the `course_interest` row (e.g. "Path: DGCA")
- User-facing: lead modal contact card is much shorter by default; click attribution or PAT header to drill in. Hovering over any of name/email/phone shows a small copy icon to grab the value.

## 2026-05-18 · fix(windchasers): widget welcome buttons render as chips, not full-width cards

- `ChatWidget.module.css`: removed `flex-direction: column` + `align-items: stretch` + `width: 100%` + `min-height: 52px` + `border-radius: 10px` + `text-align: left` override on `[data-brand="windchasers"] .welcomeQuickButtonsContainer/.welcomeQuickButtonRow .quickBtn` that was forcing welcome quick-buttons into a stacked full-width card layout
- Replaced with row-wrap flex container + pill chip styling: `border-radius: 9999px`, `width: auto`, `padding: 8px 14px`, `text-align: center`, `white-space: nowrap`, `min-height: 0` — chips now hug their text and wrap onto multiple lines when needed
- User-facing: WindChasers chat widget's quick-reply buttons ("I want to become a pilot", "I am a parent", "Explore Training Options") now appear as compact inline chips instead of stacked full-width buttons

## 2026-05-14 · fix(windchasers): DGCA theory papers — 5 → 6 (locked fact correction)

- `brand-facts.ts`: `dgcaSequence.detailed` updated from "5 DGCA theory papers" to "6 DGCA theory papers" with full list (Air Navigation, Aviation Meteorology, Air Regulations, Aircraft & Engines [Technical General], Aircraft Specific [Technical Specific], Radio Telephony / Communication)
- `brand-facts.ts`: `PROGRAMS.offered['dgca-ground'].shortDescription` updated to "6 DGCA papers"
- `windchasers-prompt.ts`: WhatsApp "do I need a license" canned answer updated to say "6 theory papers"
- User-facing: All three channels now match the WindChasers website's "6 critical subjects" framing. Locked fact #DGCA-papers added to running log.

## 2026-05-14 · refactor(windchasers): brand-facts single source of truth + prompt refactor (Phase 1)

- `lib/brand-facts.ts` (new): Single source of truth for all WindChasers facts — cost (up to ₹80L), timeline (18-24 months), DGCA sequence, DGCA framing distinction, faculty rules, eligibility, loan partners, international partners, programs offered/not-offered, hard rules, banned phrases, CTAs. All channels import from here.
- `configs/prompts/windchasers-prompt.ts` (WhatsApp/Aria): Replaced 329-line hardcoded prompt with a 75-line shell that imports `getBrandFactsForPrompt()`. Zero hardcoded facts. Fixes ₹40-75L → ₹80L discrepancy. Adds correct DGCA framing. Removes instructor name/salary rules that were missing or wrong.
- `configs/prompts/windchasers-web-prompt.ts` (Web/Avia): Same refactor — imports brand-facts, preserves web-specific flows (aspirant/parent paths, age routing). Channel differences: 2-4 sentences, **bold** markdown, double line breaks.
- `configs/prompts/windchasers-voice-prompt.ts` (new): Source-controlled voice prompt for Vapi. Imports brand-facts. Exports `getAviaVoicePrompt()` — copy output into Vapi dashboard. Includes spoken-number formatting (no ₹ symbols), outbound/inbound opening scripts, parent path.
- User-facing: All three channels now quote the same cost (₹80L), same timeline (18-24 months), same DGCA framing, same program list. No channel will contradict another.

## 2026-05-14 · fix(windchasers): stop AI addressing user as brand name + fix WhatsApp bold formatting

- `promptBuilder.ts`: Added `BRAND_NAMES` guard so "BCON", "windchasers", "proxe" etc. are never injected as the user's name. When WhatsApp contact name resolves to a brand slug, the `Address them by name` instruction is silently skipped.
- `agent/whatsapp/respond/route.ts`: Added post-processing sanitizer on the AI response — converts `**bold**` → `*bold*` (WhatsApp uses single asterisk for bold, not double), converts `<br>` tags to newlines, and strips any remaining HTML. Prevents raw markdown symbols from appearing in WhatsApp messages.
- User-facing: AI no longer says "BCON, great question." — and bold text now renders correctly in WhatsApp instead of showing raw asterisks.

## 2026-05-14 · fix(bcon): replace underscores with spaces in lead profile display fields

- `LeadDetailsModal.tsx`: Applied `.replace(/_/g, ' ')` to `user_type`, `course_interest`, `education`, and `timeline` display values — raw enum-style strings like `full_time` now render as `full time` in the lead details panel.
- User-facing: Lead profile cards in the BCON dashboard inbox no longer show underscored slugs.

## 2026-05-14 · fix(windchasers): preflight getUserMedia to beat Chrome's transient activation expiry

- `ChatWidget.tsx` (`handleVoiceToggle`): Added a preflight `navigator.mediaDevices.getUserMedia({ audio: true })` call immediately after the env-key guard, before creating the Vapi instance. Root cause: in cross-origin iframes Chrome's transient user-activation window is ~1 second; Vapi's `vapi.start()` fires a server network request before calling `getUserMedia()` internally, so the window expires before the mic dialog can appear. The preflight call happens synchronously in the click handler, firing the permission prompt while the activation is still valid. Once the user grants access the permission is stored and Vapi's own internal `getUserMedia()` succeeds.
- User-facing: Mic button on embedded `windchasers.in` pages and incognito tabs will now correctly trigger the browser's microphone permission dialog.

## 2026-05-14 · fix(windchasers): force embed.js no-cache + full mic permissions on widget iframe

- `embed.js/route.ts`: Changed `Cache-Control` from `public, max-age=3600` to `no-cache, no-store, must-revalidate` — previous 1-hour cache meant all visitors who loaded the page before the mic-fix deploy were still running the old iframe without `allow="microphone"`. Now every page load fetches the latest embed.js immediately.
- Added `allowusermedia=""` attribute alongside `allow="microphone; camera; autoplay; clipboard-write"` for maximum browser compatibility (covers older Chrome/Safari)
- User-facing: Vapi mic button on windchasers.in live pages now triggers mic permission dialog immediately for all visitors, not just new ones after cache expiry

## 2026-05-14 · feat(windchasers): make quick-reply buttons full-width clickable cards

- `ChatWidget.module.css`: Added windchasers brand overrides so quick-reply and flow-override buttons stack in a column and stretch to full width — the entire card area is now the click target, not just the text label
- User-facing: Buttons like "Airplane", "Helicopter", "Starting Fresh", "Yes, Completed DGCA" now render as tall full-width cards with left-aligned text, consistent with a card-tap UI pattern

## 2026-05-14 · fix(windchasers): allow microphone in embedded widget iframe

- `embed.js/route.ts`: Added `allow="microphone; camera"` attribute to the dynamically-created iframe so browsers delegate mic permission to the widget on external/live sites
- User-facing: Voice button (Avia) now triggers the microphone permission prompt on all embedded pages, not just the dashboard preview
- Root cause: dashboard preview iframe had `allow="microphone; camera"` but the embed script did not

