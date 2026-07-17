## 2026-07-18 · fix(core): Campaigns brain can only use the brand's allowed variables (kills {{course_name}} bleed)

- The campaign brain was inventing variables like {{course_name}} on brands that have no such field (lokazen etc.) because those brands have no template registry to anchor to. Now the prompt carries a HARD per-brand whitelist: the only variables allowed in any draft are {{customer_name}} + the brand's config.campaigns.variables + (windchasers) its real registry vars. Anything else is forbidden; the model writes plain words instead.
- Belt-and-suspenders server guard: after the model replies, any placeholder outside the allowed set is stripped to "it" so a rogue {{course_name}} can never render even if the LLM ignores the rule. Applied to draft bodies/footers/buttons/variables and the message.
- User-facing: lokazen (and every non-aviation brand) re-engagement drafts no longer show {{course_name}}.
- `(pending-sha)`

## 2026-07-18 · fix(core): Campaigns personalization from real WhatsApp templates + em-dash sweep

- Personalization variables now reflect the variables the brand ACTUALLY uses in its WhatsApp templates: the union of {{vars}} across every loaded template (approved registry + drafts) shows when no single template is picked, instead of a hardcoded guess. Windchasers shows its real set ({{customer_name}}, {{date}}, {{parent_name}}, {{time}}, {{topic}}, {{tier}}...); brands with no template registry fall back to {{customer_name}}.
- Campaign brain instructed to reuse ONLY the brand's existing template variables (never invent new ones like {{course_name}}) and to NEVER emit em dashes or en dashes in messages, drafts, footers or goals.
- Swept the remaining em dashes from the workspace UI (attach/voice tooltips, audience-summary empty state); the intro + save toast were already comma'd in v0.2.48.
- Agent avatar stays the PROXe cycle mark (no dedicated PROXe logo asset exists in the repo; the proxe brand config itself notes this).
- `(pending-sha)`

## 2026-07-18 · feat(core): sidebar reorder + Campaigns agent polish

- Sidebar reordered to the founder's set: Overview, Leads, Chats, Calls (voice-gated), Pipeline, Key Events, Flow, Campaigns, Humans, Agents, Knowledge, Configure. "Events" renamed "Key Events" (route unchanged). Tasks dropped from the nav (page still reachable by URL). Scouts/War Room stay feature-gated. Dividers realigned.
- Campaigns chat agent = a PROXe "cycle" mark (accent orbit ring + node) instead of the generic robot face; the agent is PROXe everywhere.
- Killed the em-dash in the campaign intro + save toast (comma) per the no-dash rule.
- Smart suggestions are now campaign-strategy prompts (neutral, brand-agnostic): "Reach people who replied once but never connected", "Win back leads marked lost this month", etc. Brands still override via config.campaigns.suggestions.
- User-facing: cleaner sidebar, PROXe agent identity in Campaigns, sharper suggestion prompts.
- `(pending-sha)`

## 2026-07-17 · fix(core): Campaigns no-bleed - brand-owned smart suggestions + personalization vars

- The Campaigns workspace no longer bleeds Windchasers aviation content into other brands. Smart-suggestion chips and the default personalization variables now come from config.campaigns.{suggestions,variables}; shared core ships NEUTRAL defaults (generic "Qualified leads from last 30 days" etc + {{customer_name}} only). Windchasers keeps its pilot/cabin-crew prompts + {{course}}/{{city}} vars via its own config.
- Campaign brain (chat route) tools built per brand: the aviation-only filters (course / user_type / webinar) are exposed to the LLM on Windchasers only; every brand keeps the neutral stage/source/city/recency filters. Goal example de-aviation'd (brand-name driven).
- User-facing: bcon (and every non-windchasers brand) now shows its own generic audience prompts + variables, not pilot/cabin-crew.
- `(pending-sha)`

## 2026-07-17 · feat(core): Campaigns polish - PROXe agent everywhere, core-only Features, custom schedule picker

- The campaign agent is now "PROXe" on every brand (was "<Brand> AI" / "Windy") - the product's assistant, brand-neutral. Dropped the windchasers Campaign-Assistant label override.
- Features panel shows CORE features only (Campaigns, Voice/Calls, Dashboard Brain, Brain Actions, Pipeline Funnel, Follow-up Sequence). Removed the "Per-brand setup" section - Scouts/Gigs, War Room and Lead Access are brand-specific DB-bound features and don't belong in every brand's panel.
- Send time now uses a proper picker: a themed month calendar (prev/next month, past days disabled, Clear/Soon shortcuts) plus sorted scrollable hour / minute / AM-PM columns and a Set button - replacing the raw native datetime-local.
- User-facing: cleaner Features screen, PROXe everywhere, a real scheduling picker.
- `(pending-sha)`

## 2026-07-17 · feat(core): Campaigns on every brand + the full feature picture in Configure -> Features

- features.campaigns switched ON for all 5 brands (bcon, lokazen, pop, proxe join windchasers) - the AI campaign workspace is everywhere.
- Configure -> Features now shows the real feature set: Campaigns, Voice/Calls, Dashboard Brain, Brain Actions, Pipeline Funnel (no longer "Soon" - it shipped), Follow-up Sequence - all runtime-toggleable per brand (whitelist extended). Below them a "Per-brand setup" section shows Lead Access, Scouts/Gigs and War Room read-only with their current state - they need per-brand DB setup so they stay config-locked.
- The Campaigns page and its chat API now honor the runtime toggle (Settings override on top of config default), so switching Campaigns off/on takes effect without a redeploy; the nav row already did.
- User-facing: no more "campaign not active in this brand" - and Features finally shows what's actually live where.
- `(pending-sha)`

## 2026-07-17 · feat(windchasers): Campaigns = the AI campaign workspace (1:1 with the reference structure)

- Campaigns now opens the two-column workspace: chat on the left (assistant intro from the brand's campaign persona - "Windy" on windchasers, editable campaign name, Channel: WhatsApp header, plan summary card with Audience detected / Channel / Goal chips, smart-suggestion chips, rotating-placeholder input bar with attach/mic affordances + disclaimer line), and a right rail with Templates (Approved/Draft/Reminder/Nudge/Promo filter pills, live registry + chat drafts via new GET /api/dashboard/campaigns/templates), Audience summary (estimated reach + reach donut, real WhatsApp-reachable split), Campaign setup (channel/template/send-time rows + Review & Schedule Campaign), and Personalization variables ({{vars}} from the selected template, custom add).
- Review & Schedule saves the campaign as ready with scheduled_at + channel (store extended); sending remains un-wired and says so.
- Chat brain also returns a "goal" line for the plan card. windchasers config: labels['Campaign Assistant'] = Windy.
- Header buttons: Create Campaign (fresh workspace) / Previous Campaigns (the overview list with stat cards + campaign table from earlier today).
- Brand theme tokens throughout; the reference mock's colors were not copied.
- `(pending-sha)`

## 2026-07-17 · feat(windchasers): Campaigns page restructured - overview first, builder behind New campaign

- Campaigns now lands on the overview: header with search (Cmd+K) + accent "New campaign" button, status pills (Live / Scheduled / Pending / Completed / All), four aggregate stat cards (Sent, Delivered + delivery rate, Read + read rate, Clicked + click rate - real numbers from the message log, no fabricated trends), and a campaign table (channel badge, target line, status dot + since-date, delivered % bar, read / clicked counts, updated, per-send breakdown on click, delete for planned rows).
- The chat builder is unchanged but moved behind "New campaign" with a back arrow; saving returns to the overview. All colors are brand theme tokens - the reference mock's palette was NOT copied.
- The old Create/Previous tab pair and the bottom "create a campaign in steps" strip are gone.
- User-facing: Campaigns reads like a campaign console; chat only appears when creating.
- `(pending-sha)`

## 2026-07-17 · feat(core): Campaigns - chat-driven campaign builder (windchasers first)

- New /dashboard/campaigns (sidebar row, feature-gated via features.campaigns - ON for windchasers only): a chat where you describe who to reach in plain words. The brain (Claude tool loop) queries the brand's REAL leads - stage groups, course, user type, webinar flag, source, city, recency/inactivity windows - and answers with an audience card (reachable-on-WhatsApp count + sample names) plus the message: up to 3 matching Meta-APPROVED templates from the registry, or exactly two fresh drafts with {{variables}} when nothing fits. Multi-turn refinement works ("only Mumbai", "make it shorter").
- Pick a template, name it, Save -> campaign persists per brand (dashboard_settings key campaigns_v1, zero migrations) as ready/draft; saved list with delete on the page. SENDING IS NOT WIRED - saving never messages anyone; launch stays a separate explicit step for a later round.
- APIs: /api/dashboard/campaigns (GET/POST/PATCH/DELETE store) + /api/dashboard/campaigns/chat (auth + flag-gated brain, read-only tools). Page shows a plain notice on brands without the flag; chat API 403s.
- User-facing (windchasers): new Campaigns item in the left panel - "qualified pilot leads from the last 30 days" pulls the real list and lines up ready templates.
- `(pending-sha)`

## 2026-07-17 · feat(core): Support card under Configure - every reported issue with live status

- Configure gains a Support card -> /dashboard/settings/support: every issue the team filed via Report Issue, newest first, with status chip (Open / In progress / Fixed / Closed), severity, reporter, page + version context, screenshot thumbnails (signed URLs, private bucket), and the fix note once HQ marks it fixed. Tabs: All / Open / Fixed.
- GET /api/dashboard/report-issue lists the brand's own issue-reports bucket (last 6 months, 200 cap) - bucket-only like the POST, zero migrations, works on all brands day one. No bucket yet = clean empty state.
- User-facing: the team can now see what they reported and whether it got fixed, right inside Configure.
- `(pending-sha)`

## 2026-07-17 · feat(core): pipeline click-through actually filters the Leads list

- Clicking any pipeline card/chevron now lands on /dashboard/leads WITH the stage applied. The Leads list expands ?stage=<value> to the stage's whole pipeline group (Qualified = Qualified + High Intent, Lost = Closed Lost/Lost/Cold/Not Qualified...) so the list matches the funnel count, and shows a removable chip named by ?stageLabel= (carries the brand's renamed key event). Previously the param was silently ignored - the pipeline deep link had never filtered anything.
- Canonical group map moved to configs/lead-stages.ts (PIPELINE_STAGE_GROUPS) - pipeline page and LeadsTable read the same source.
- User-facing: pipeline is now the navigation layer - tap New/Qualified/Lost/etc, get exactly those people.
- `(pending-sha)`

## 2026-07-17 · feat(core): pipeline page trimmed to the pure one-screen funnel (v2 mock)

- Pipeline page now matches the final mock exactly, nothing but the funnel at 100vh: header (brand mark + "Pipeline Overview" + subtitle), FOUR top cards (New/Engaged/Qualified/key event, each with its own color + 30d sparkline), KEY MILESTONE hero, post-key + exit rows, chevron flow. Chevron % is now each stage's share of ALL leads (was step conversion), and the % sits inside the chevron.
- REMOVED: the 8-card insights strip and the below-fold lead table (search/sort/pagination/lead modal) - fewer containers per the founder's direction; every card and chevron clicks through to the Leads list filtered by stage instead.
- Lost reason wording: "Unqualified" (was "Not qualified"). Key-milestone rename (admin pencil) unchanged.
- User-facing: pipeline is a single non-scrolling funnel screen on desktop now.
- `(pending-sha)`

## 2026-07-17 · feat(core): Pipeline page redesign - one-viewport funnel, editable key event, Lost + reasons

- Pipeline page rebuilt to the new funnel design and sized to exactly one viewport on desktop (same full-height layout branch as home/inbox): pre-key cards (New/Engaged/Qualified with 30-day sparklines), a KEY EVENT hero with the Qualified→key-event conversion bar, post-key + exit-state card rows with progress rings, the chevron flow with step-conversion % under every stage, and an 8-card insights strip (Key Event Rate, Show-up Rate, True Win Rate, Revivable, Active Pipeline, Avg Time to Close, Biggest Drop-off, Win Rate). The lead table (search/sort/pagination/lead modal) lives below the fold; chevron clicks filter it and scroll to it. All colors are theme tokens + color-mix, so light/dark both work.
- "Closed-Lost" is now "Lost" and the card shows WHY: the lost-stage DB values double as reasons ("Went cold", "Not qualified", unspecified) tallied live per brand.
- The key event is renameable per brand: admins get a pencil on the hero → the label persists in the brand's dashboard_settings (key 'pipeline_config', new /api/dashboard/settings/pipeline GET/POST, admin-gated writes, empty save resets to the brand default). BrandConfig gains optional pipeline.keyEventLabel for pack-level defaults. The name flows through the hero, chevron, table badges, and insight subtitles.
- PipelineFunnel.tsx deleted (absorbed into the page). features.leadAccess scoping (All/Open Pool/My Pipeline/member switcher) preserved and now also scopes the funnel counts, not just the table.
- User-facing: pipeline page looks completely different on every brand - one-screen funnel first, lead list below.
- `(pending-sha)`

## 2026-07-14 · fix(windchasers): webinar reminders actually fire (date parse + scheduled)

- The webinar-reminder cron was skipping ALL registrants: webinar_date is stored as a human label ("18 July 2026 at 11:30 AM IST") which `new Date()` can't parse → NaN → skip. Added parseWebinarDateMs (parses the DD Month YYYY at HH:MM am/pm format as IST). 143 registrants for 18 Jul now compute the correct 24h/2h windows.
- Scheduled the cron hourly in core/vercel.json ("0 * * * *") — it wasn't scheduled at all, so it never ran. Windchasers-gated + idempotent, so it no-ops on other brands' projects.
- STILL BLOCKED (user): windchasers_webinar_reminder_v1 does NOT exist at Meta (only ..._confirmation_v1 is approved). Create + approve it with params {{customer_name}} {{webinar_name}} {{when}} — until then the reminder sends fail (logged, no marker, auto-retried once approved). The 24h reminder is due ~17 Jul.
- `(pending-sha)`

## 2026-07-14 · fix(core): light-mode sweep — hardcoded white borders/bg → theme tokens

- Follow-up to the light-mode token fix: swept the top-traffic dashboards (inbox, pipeline, LeadDetailsModal, humans, Skeleton, TodaySnapshotButton, MicroCharts) for hardcoded `rgba(255,255,255,x)` borders / dividers / backgrounds / skeleton fills / a progress-ring track / disabled-pager color that were invisible on the light background. Replaced with `var(--border-primary)` / `var(--bg-hover)` / `var(--text-muted)` / `var(--text-primary)`. Left the `var(--x, rgba(...))` fallbacks alone (the var is always defined; fallback never used). Text-white on colored avatars/badges/buttons left as-is (correct in both themes).
- `(pending-sha)`

## 2026-07-14 · fix(windchasers): flight-school leads + agent time/fee bugs

- COURSE: flight-school leads no longer mislabelled "Pilot". `normalizeCourse` now maps flight-school/study-abroad → "Flight School" (before the generic "flight"→Pilot rule); inbound route forces COURSE="Flight School" for flight_school form/source/school fields and stores school + country. New COURSE option "Flight School".
- WELCOME: flight-school leads get the generic welcome (has a "Flight Schools" button) instead of the pilot-training welcome. (Dedicated windchasers_flight_school_welcome_v1 can replace it once Meta-approved + param names confirmed.)
- FEES (live bug): the bare-"fees"/"cost" quick-reply asserted Pilot ₹60–70L to everyone (no course context) — cabin-crew/flight-school leads got pilot fees. Now course-neutral: asks which program or offers a counsellor callback. Course-specific fee questions still fast-path via the CPL/DGCA triggers.
- TIME (live bug): agent apologized for a "missed" 5PM call at 2PM. Added a TIME AWARENESS rule (future slot = upcoming, not missed) to the per-turn IST context, and gave the voice channel a current-IST + upcoming line (it had none).
- `(pending-sha)`

##  · fix(core): Key Event updates on rebooking — top-level booking columns refreshed

- Rebooking via a call note updated unified_context.voice.booking_* but NOT the top-level all_leads.booking_date/booking_time columns — which the Key Event card reads FIRST, so the stale old slot shadowed the new one ("Friday 17th July 11am" logged, card stuck on Wed 15th 10:00). The BOOKING_MADE branch now refreshes the columns in the same update.
- Data: R's columns corrected to Fri 17 Jul 11:00; duplicate 10:00-era reminders cancelled (kept: 24h Thu 11:00, 30m Fri 10:30, Thursday-evening callback).
- `(pending-sha)`

##  · fix(core): lead-modal name edit no longer explodes the header layout

- Clicking the name-edit pencil grew the contact card +90px (input's intrinsic size=20 min-width at text-xl) and crushed the Quick Stats column into tall slivers. Fix: size={1} on the edit input + min-w-0 on the contact-card section. Verified: header widths byte-identical before/after entering edit mode. Core modal — applies to every brand's dashboard.
- `(pending-sha)`

##  · feat(bcon): tasks are INTERACTION-DRIVEN only — autonomous scanners retired

- Founder model: a task exists because a human interaction created it (call logged → brain plans next steps per person; booking → reminders). The worker's autonomous creators — createFollowUpTasks, createColdLeadTasks, and the morning-briefing "proactive intelligence" inserts (push_to_book / stale-lead day-1s / cold re-engagement) — are now gated behind AUTO_CREATE_TASKS=true (default OFF). Booking reminders + task execution + Telegram briefings stay.
- Queue purged: 22 scanner-created tasks cancelled ("firing random people at random times"); the 11 interaction-born tasks remain (Raaja + Riitesh RNR ladders, R's booking reminders + Thursday callback).
- Ops: bcon-tasks pm2-deleted from the VPS earlier today (was running every 5 min via cron_restart, completing tasks with dead WhatsApp creds).
- `(pending-sha)`

##  · fix(core): "Friday" books FRIDAY — bare weekday names parse in booking dates

- resolveBookingDate understood "tomorrow"/"next friday"/"25 june" but a BARE weekday ("Friday", "this Friday", "coming Monday") fell to new Date("friday") = Invalid and silently booked TOMORROW — a founder's "he gave me Friday" note booked Tue 10am. Bare/this/coming weekday now maps to the next occurrence; "day after tomorrow" added too.
- Data repaired for lead R: booking moved to Fri 17 Jul 10:00, reminders re-aimed (24h Thu 10:00, 30m Fri 09:30), and the note's "Thursday evening call him back" now exists as a human_followup (Thu 6pm).
- `(pending-sha)`

##  · fix(core): template messages get READ RECEIPTS — wa_message_id logged on every template send

- Delivery/read ticks match conversations on metadata.wa_message_id; the dashboard send_template path logged only meta_message_id and the follow-up cron logged no id at all — template bubbles could never tick past "sent". Both now log wa_message_id + whatsapp_message_id (the worker already did). Raaja's sent row backfilled so late receipts still attach.
- `(pending-sha)`

##  · feat(core): template variables extracted from what the lead SAID (leadFacts)

- New resolveLeadFacts(): goal / brand / pain distilled from the lead's own words — their form answers (Company Name, current_system → human-phrased pain like "managing leads manually on WhatsApp"), the campaign they responded to (utm.campaign, e.g. "AI Lead Machine"), and chat-extracted profile fields. Fallbacks are last resort, never the default.
- Wired into the follow-up cron sender AND the Tasks-board previews (batch lead fetch → real values instead of [[goal]]/[[brand]] chips). Verified live: "saw nilamahal looking into AI Lead Machine", "saw NS Credit Consultant Pvt Ltd looking into Marketing / Ads".
- Fixed en route: selects referenced a nonexistent all_leads.service_interest column, silently zeroing the lead fetch.
- `(pending-sha)`

##  · feat(bcon): day 1/3/5 retries use the DAY-WISE template ladders (onetouch/lowtouch)

- The RNR-sequence day tasks repeated the generic follow-up 3×. Meta already holds day-specific approved copy: onetouch_d1/d3/d7 (ghost — never replied) and lowtouch_d1/d3/d7 (engaged — has replied). Day tasks now route by engagement: engaged→lowtouch, ghost→onetouch; day 5 borrows the d7 body (existing convention). Wired in the worker, the cron sender (with per-template named params), dashboard previews, and the flows/journeys ladders.
- Verified: each day previews DIFFERENT copy on a live lead.
- `(pending-sha)`

##  · fix(core): RNR model corrected — pair fires ONLY on call-miss touches; day 1/3/5 stay standard cadence

- Founder model: first RNR call → rnr_1, a second logged RNR → rnr_2, and the scheduled day 1/3/5 retries send the STANDARD follow-up templates that were already set up (NOT RNR copy). Corrected across the worker (day retries fall through to normal rotation; missed-call picks rnr_1/rnr_2 by last-sent), the cron sender (cap 2 applies only to RNR touches; day steps flow the standard template), dashboard previews, and the flows/journeys ladders.
- Verified live: both open leads preview missed-call = "We just tried calling you", day 1/3/5 = "you reached out recently…", re-engage = re-engagement.
- Removed the "Latest note" card from the lead summary (notes live in the Notes tab).
- `(pending-sha)`

##  · fix(core): inbox renders templates FULLY (body + buttons) + Lokazen chip leak killed + whole Meta form shown

- Template sends from the dashboard now log the RENDERED body (server-side fill from the brand template map) + template_buttons metadata — the thread shows the real message with WhatsApp-style buttons, never "[Template: name]". RNR pair buttons (Book a call / Chat here) added to journeys + worker maps. Raaja's existing row backfilled.
- LEAK: audienceOf() painted Lokazen's OWNER/SCOUT/BRAND chips on every brand — bcon B2B leads with user_type "business_owner" substring-matched "owner". Now lokazen-only (the detail-panel copy of this taxonomy was already gated; the list chip escaped the audit).
- Meta Form Submission card shows EVERY answered field (was a cherry-picked subset — a form matching only "urgency" rendered one lonely field).
- `(pending-sha)`

##  · feat(core): RNR cron sender is brand-aware — bcon ladder fires the real templates to real numbers

- /api/cron/follow-up-sequence was windchasers-only (pilot/generic template names + single customer_name param) — on bcon every send would 4xx. Now brand-routed: bcon → bcon_service_rnr_1/2_v1 with 3 NAMED params (customer_name, service_name, brand_name from lead context), re_engage closes on the re-engagement template, cap 4 RNR sends (windchasers path unchanged, cap 2).
- New sendNamedTemplate() in whatsappSender for multi-named-param templates.
- Verified: authorized local ping → due:0 errors:0; no TEST_RECIPIENT gates in the core send path (real numbers only).
- REMAINING (user): add the bcon URL to the external cron scheduler — nothing pings it on prod yet.
- `(pending-sha)`

## 2026-07-13 · refactor(core): rename won stage 'Converted' → 'Closed Won'

- The won stage is now 'Closed Won' (pairs with 'Closed Lost'), replacing 'Converted' across the taxonomy: stage/override/convert APIs, note classifier (CONVERTED category still triggers it), LeadStageSelector, stage dropdowns, colors, funnel/pipeline/humans groupings, metrics, types, lead-stages config. The 'Converted' classifier category name is unchanged.
- Migration 038 drops the lead_stage CHECK (by definition, any name), migrates existing 'Converted' rows → 'Closed Won', and re-adds the constraint with the full current stage set. RUN THIS in each brand's Supabase before/with the deploy — until then the DB rejects 'Closed Won'.
- Funnel/grouping arrays keep 'Converted' alongside 'Closed Won' so un-migrated brands' legacy rows still count as Won.
- `(pending-sha)`

## 2026-07-13 · feat(core): "Convert lead" action + conversion-date tracking

- New "Convert lead" option in the lead modal's + menu → a modal to enter conversion date (defaults today), program/batch, deal value ₹, and notes. Converting sets stage=Converted, records the date, stores the deal details in unified_context.conversion, cancels pending follow-ups, and logs a stage change + activity note. New endpoint POST /api/dashboard/leads/[id]/convert.
- New `converted_at` column (migration 037, windchasers) — the conversion date is written there (soft-fail if the column isn't present yet) AND always into unified_context.conversion so it works before the migration runs.
- The auto-convert path (note/call classified CONVERTED) now ALSO records converted_at (was only flipping the stage, losing the date).
- `(pending-sha)`

## 2026-07-13 · fix(windchasers): Telegram team alert on escalations + stop name-repetition spam

- flagForHumanFollowup now also pings the team's Telegram group (TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID) alongside the existing Slack ping — so a booking the agent couldn't lock ("passed to our team"), an empty-response escalation, or a repeat-guard trip actually reaches a human on Telegram. Env-guarded no-op for brands without Telegram set; goes only to that brand's own group (no bleed). NOTE: needs TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID in the windchasers CORE/Vercel env (currently only in the worker).
- Agent prompt: added NAME USAGE rule — use the first name at most once (first message), don't re-greet every reply ("Kartik… Kartik… Kartik") — fixes the repetitive/spammy feel.
- `(pending-sha)`

## 2026-07-13 · fix(windchasers): TYPE column falls back to course (cabin-crew leads no longer blank)

- The pipeline TYPE column only showed `user_type` (student/parent). Cabin-crew leads carry `course=Cabin Crew` but no user_type, so TYPE was blank. Now TYPE falls back to the course when user_type is empty, so cabin-crew (and other course-only) leads show their kind. Windchasers-gated (showAviationColumns); other brands unchanged.
- `(pending-sha)`

## 2026-07-13 · fix(windchasers): WhatsApp delivery receipts + last-touch on auto-templates

- Auto-template sends (webinar confirm, cabin-crew, new-lead/parent welcome, FB-lead, dashboard add-lead) never stored Meta's message id, so the status webhook (matches on `metadata.wa_message_id`) could not attach delivery/read receipts — every row stuck on a single tick. Now the send wrappers propagate `messageId` and every log site stores `wa_message_id` + `delivery_status: 'sent'`, so ticks flow. (Forward-only — historical rows have no captured wamid.)
- After a successful auto-welcome/confirm, `last_touchpoint` is bumped to `whatsapp` (+ `last_interaction_at`), so the pipeline LAST TOUCH column reflects the WhatsApp we sent instead of staying "Form".
- `sendCabinCrewWelcome` / `sendWelcomeTemplate` / `sendParentWelcomeTemplate` / `sendWebinarConfirm` return types widened to carry `messageId`.
- `(pending-sha)`

## 2026-07-13 · fix(windchasers): inbox shows the REAL WhatsApp template (body + buttons + footer)

- Mirror of the main-branch fix onto one-core (windchasers-only behavior; pop unaffected). New `core/src/configs/whatsapp-template-bodies.ts` (real Meta-approved windchasers template bodies + footer + buttons + `renderWaTemplate`). Inbound webinar-confirm + new-lead welcome now log the real rendered template; inbox renders the template footer. Other send sites (cabin/facebook-lead/dashboard-add) land when one-core catches up to main.
- `(pending-sha)`

##  · fix(core): eliminate remaining cross-brand bleeds (audit sweep)

- Same as main (pop rides one-core): quickReplyMap gated to windchasers; whatsappSender/bookingManager/calendar de-BCON/de-aviation; TodaySnapshotButton + TeamMessagesView + BookingCalendarWidget + CommunicationsView brand-gated/neutralized.
- `(pending-sha)`

##  · fix(inbox): "Property Owner" audience badge is Lokazen-only (bled onto BCON)

- Same as main. Gated the owner/scout/brand inbox badge to IS_LOKAZEN.
- `(pending-sha)`

##  · feat(agent): bot aware of human takeover — stays silent vs talking over the team

- Same as main (pop rides one-core). Labels human teammate turns in history; engine escalated flag; WhatsApp webhook stays silent when a teammate is handling the lead and the bot only has a generic escalation.
- `(pending-sha)`

##  · feat(inbox): Manual badge on human-sent replies + pop receipt migration

- Same as main (pop rides one-core). Inbox "Manual" badge on human-sent replies; brands/pop/supabase/migrations/003 read-receipt columns.
- `(pending-sha)`

##  · fix(core): teammate-invite email uses the real brand name, not "Windchasers"

- Same brand-bleed fix as main (pop rides one-core). services/email.ts now derives the label from getBrandConfig().name instead of hardcoded "Windchasers PROXe".
- `(pending-sha)`

##  · fix(core): agent no longer says "Lokazen team" on other brands

- Three ungated escalation guards in the shared engine hardcoded "the Lokazen team"; now "our team" (wantsHuman handoff, anti-repeat, empty-response). Lokazen-gated directives keep their branding. Same fix as main (pop rides one-core).
- `(pending-sha)`

## 2026-07-10 · feat(brain): tap-to-talk mic on the docked orb

- The docked mini-orb now has a mic button just below the light: tap to talk to the brain (starts listening via Web Speech), tap again to send; it turns accent + pulses while hearing you. Lets you speak to it directly without waiting on the spoken briefing.
- `(pending-sha)`

## 2026-07-10 · fix(brain+widget): mini-orb strobe + chat-widget open flicker

- Brain mini-orb (docked): stopped the strobe — the airy small-canvas thinning was subsampling the per-frame depth-sorted array (different dots each frame). Now a fixed 1/airy subset by particle identity → sparse but smoothly rotating. (`ddf809cf`)
- Chat widget open (embedded on brand sites): removed the flicker — a post-paint effect was repositioning the panel (centered) and killing the entry transform mid-animation. Now useLayoutEffect + the panel anchors above the launcher matching CSS (no jump), and slideUpBubble is transform-only (no opacity fade → no backdrop-filter repaint flash). Also fixed a hydration mismatch from apostrophes in the widget-layout `<style>` comment.
- `(pending-sha)`

## 2026-07-07 · fix(widget): links in agent messages are now clickable

- formatText() linkifies bare URLs and markdown [text](url) into <a target=_blank> anchors (underlined, bold), so "Register here: https://…" is tappable in the embedded widget instead of plain text.
- Bundled (per user OK): in-progress widget open-animation position changes from a parallel task (useLayoutEffect + bottom:104px anchor, slideUpBubble transform-only) in the same ChatWidget.tsx/.module.css.
- `(pending-sha)`

## 2026-07-07 · feat(windchasers): agent asks parent-or-student before sharing the webinar link

- Avia was picking the student link by default. Now, if the audience isn't already clear, it ASKS "student/aspiring pilot or parent?" first, then shares the matching page (parents → /webinar/parents, student → /webinar/students). Updated CURRENT_WEBINAR.rule in brand-facts (all channels).
- Also instructs presenting the link as a plain full URL (the chat widget linkifies it — see the paired ChatWidget formatText change).
- `(pending-sha)`

## 2026-07-10 11:47 IST · fix(windchasers): deterministic cabin-crew routing via course_interest

- Finished the `course` wiring in the FB Lead Ads path: a static Pabbly param `course_interest=cabin_crew` (or `interest`/`program`/`course`) now (a) stores on the lead as `unified_context.windchasers.course_interest` and (b) is the FIRST attribution signal, so the cabin-crew welcome fires deterministically regardless of ad/adset/form naming.
- Broadened `isCabinCrewSource()` to be separator-tolerant — `cabin crew` / `cabin_crew` / `cabin-crew` / `cabincrew` all match (Pabbly static values and FB ad names use underscores/hyphens). Also applies to the website `leads/inbound` path, which already routed cabin-crew off `course_interest=Cabin`.
- User-facing: a cabin-crew ad lead reliably gets the cabin-crew first WhatsApp message even when the ad isn't named "cabin crew".
- `(pending-sha)`

## 2026-07-07 · feat(windchasers): dedicated cabin-crew welcome (FB ads + website)

- Cabin-crew ads are live; cabin-crew leads now get their own welcome instead of the generic one. New isCabinCrewSource() detection + sendCabinCrewWelcome() (tries windchasers_cabin_crew_welcome_v1, falls back to the generic welcome until Meta approves — auto-upgrades, no redeploy).
- Wired into BOTH paths: facebook-lead (FB Lead Ads → Pabbly) branches parent → cabin crew → pilot/generic; leads/inbound (website) sends the cabin-crew welcome as the first touch for cabin-crew leads (course_interest=Cabin or a cabin-crew signal) and skips the first_outreach task so they aren't messaged twice. Guarded against PAT/demo/webinar double-sends + dedup window.
- Template spec added to templates.md (submit windchasers_cabin_crew_welcome_v1 to Meta).
- User-facing: cabin-crew leads get a cabin-crew-appropriate first WhatsApp message.
- `(pending-sha)`

## 2026-07-10 · feat(brain): Brain drives the dashboard — ACTIONS trailer (open lead / open page / dial) — bcon only, PARKED pending voice keys

- The Brain (chat panel + voice orb) can now act, not just answer: "show me the top lead" opens that lead's inbox conversation; count questions offer an [Open Leads] button; "want me to call him?" renders a [Call <name>] button (click = consent, chat only — voice NEVER dials).
- Protocol: model emits a final `ACTIONS: [...]` line (same pattern as FOLLOWUPS) with short ids copied from DATA; server strips + validates against the lead snapshot (hallucinated ids dropped, phone attached server-side, never sent to the model). New shared module core/src/lib/brain/actions.ts; wired into brain/route.ts (chat, top_leads with id8) and brain/briefing/route.ts (voice: history for "yes"-resolution, people slice, trailer stripped before TTS).
- Client: DashboardBrain executor (inbox deep-link ?lead=&channel=, page routes, test-call POST); auto:true opens immediately on explicit "show me X", proposals render accent-filled buttons; full-screen orb auto-collapses to the corner on navigation so the page shows while it talks. New "Type instead…" pill on the dock fan restores the typed surface (inline pill was removed in v0.2).
- Gated: features.brainActions — ON for bcon only; flag off = prompt and response byte-identical to before (verified).
- Verified live on bcon local: chat auto-open → Uday Katkar's WhatsApp thread; voice nav → pipeline behind the orb; dial button rendered (not clicked); flag off/on; 12/12 validator unit checks; no console errors.
- PARKED: bcon voice AUDIO + DIAL are dark — ELEVENLABS_API_KEY invalid (401), VAPI keys empty, GROQ_API_KEY empty, in local AND all three bcon-proxe Vercel environments (checked). Text brain + actions + voice-driven navigation fully work. Resume = drop valid keys into brands/bcon/.env.local (or authorize pulling from another brand's project — key-isolation rule applies), restart bcon-core-b, re-probe tts/greet/test-call.
- `(pending-sha)`

## 2026-07-10 09:50 IST · feat(brain): CORE COMMUNICATIONS checklist on Eval — windchasers first

- New Eval bench "Communications": every message the brand's agent must handle autonomously as a visible slot — welcome per lead source, AI replies to incoming messages (prompt + knowledge base), confirmations, reminders, follow-ups — each with a LIVE / PARTIAL / MISSING / OFF status pill, trigger, channel, template chip, WhatsApp-style preview, honesty note, and "Send to my WhatsApp" test.
- Per-brand data: new `brain.communications` (CoreCommunication[] in BrandConfig) — hand-curated display truth mirroring whatsappSender + intake routes, updated in the same commit as sender changes (journeys.ts philosophy).
- Windchasers: 18-slot checklist shipped (brands/windchasers/communications.ts) — 11 live · 4 partial (Meta approvals pending: parent welcome, webinar confirm ×2, webinar reminder) · 1 missing (generic website-form welcome — branch disabled, template deleted) · 1 off (day-1/3/5 nurture) · 3 live-with-warning (booking/reminder/missed-call templates carry BCON-branded Meta copy).
- Gating: Eval tab now shows when a brand has journeys OR communications; windchasers gets Eval for the first time (Communications · Team · Calls — the BCON journeys bench correctly never renders there). bcon/pop/lokazen unchanged.
- User-facing: Brain → Eval on windchasers is now the autonomy scorecard — what the agent handles alone, what still needs filling.
- `(pending-sha)`

## 2026-07-07 · feat(windchasers): agent knows the current webinar (web + WhatsApp + voice)

- Avia was answering "I don't have details on a specific webinar" — added a CURRENT_WEBINAR block to brands/windchasers/brand-facts.ts (title, 18 Jul 2026 11:30 IST, what it covers, register links) injected into the shared brand-fact bundle, so every channel prompt (web chat, WhatsApp, voice) can speak to the webinar and route registrants to the right landing page (parents vs students).
- Time-bound: set CURRENT_WEBINAR.active = false once the session passes.
- User-facing: the chat/voice agent now answers "tell me about the webinar" with real details + the register link.
- `(pending-sha)`

## 2026-07-07 · feat(windchasers): webinar registration wired to the website + parent/student welcome split

- Website (separate repo, committed there): windchasers.in/webinar/parents & /students now have a live "Reserve my free seat" form (name/phone/email) that captures into PROXe then redirects to Zoom. Audience tagged by page.
- PROXe: webinar confirmation is now audience-aware — parents get windchasers_webinar_confirm_parents_v1 (named param parent_name), students get windchasers_webinar_confirm_v1. Routed by unified_context.windchasers.user_type. New sender sendWebinarConfirmParents + template spec.
- User-facing: parents and students who register get a different, audience-appropriate WhatsApp confirmation.
- `(pending-sha)`

## 2026-07-07 · feat(windchasers): webinar leads — Zoom intake, Webinar tab, confirm + reminder templates

- leads/inbound recognizes webinar registrations (form_type/lead_type/source = 'webinar', windchasers-gated): tags unified_context.windchasers.lead_type='webinar' + webinar_name/date, touchpoint 'webinar' (migration 035 adds the enum value), fires windchasers_webinar_confirm_v1 (dedup-guarded, soft-fails until Meta approves). Re-registration never demotes an existing real lead; webinar regs skip the first_outreach counsellor task.
- Leads page (windchasers): "Leads | Webinar" toggle — default view excludes registrants, Webinar view shows only them with a webinar name/date column.
- Lead modal: webinar chip + "Move to Leads" button → set-type endpoint made brand-generic (new type 'lead' clears the segment tag; lokazen behavior unchanged and it was UI-less before).
- New cron /api/cron/webinar-reminder (hourly, CRON_SECRET): 24h + 2h WhatsApp reminders before webinar_date, idempotent via per-step context markers. windchasers_webinar_reminder_v1 template spec added to templates.md (both templates need Meta submission).
- User-facing: webinar registrants land in their own tab with confirm/remind automation; one click promotes them to real leads.
- `(pending-sha)`

## 2026-07-07 · fix(dashboard): Activity Sources list no longer clips — scrolls, shows up to 10 sources

- The ranked-source list used justify-center + overflow-hidden: with 6+ sources the stack centered and clipped BOTH ends (top row half-cut, bottom rows hidden). Now my-auto + overflow-y-auto — centered when it fits, scrolls from the top when not.
- Row cap raised 6 → 10 so the full source mix (Meta Ads / Google Ads / WhatsApp / Google Organic / Direct / …) is reachable.
- User-facing: every Activity Sources row visible again.
- `(pending-sha)`

## 2026-07-10 08:40 IST · fix(widget): opaque dark box around the embedded chat widget in in-app browsers

- Root cause: the widget iframe's document declared `color-scheme: dark` (inherited from the dashboard shell) — modern WebKit/Chromium force an OPAQUE iframe canvas when the embedded doc's color-scheme mismatches the host page's, so Instagram/other in-app browsers painted a dark rectangle around the bubble and a dark background behind the open chat.
- Fix, three layers: widget doc forces `color-scheme: normal` + transparent html/body (bubble layout); the root theme-init no longer adds `.dark` (and its body paint) on /widget routes; the embed iframe element also declares `color-scheme:normal` so both sides match.
- Verified on /widget/bubble: html classes none, color-scheme normal, html+body fully transparent, bubble renders; embed.js serves the matching style.
- User-facing: the chat bubble floats clean on brand sites again — no dark box, no dark backdrop, including Instagram's in-app browser.
- `(pending-sha)`

## 2026-07-07 · fix(windchasers): FB lead attribution — real platform data, source mix, 50-50 home rows

- facebook-lead route now captures Meta's real per-lead data from Pabbly: `platform` (ig/fb — drives the SOURCE badge: Instagram/Facebook instead of a hardcoded label), `adset_name`, `form_id`, and the lead-form qualifying answers (`class_12_pcm`, `start_timeline`, `age`) into the windchasers profile.
- Root cause of every lead badging "RES1 PLATFORM": Pabbly hardcoded `utm_source: "Res1 Platform"` — utm_source is priority-1 in deriveSource. Backfill SQL at brands/windchasers/supabase/backfill_res1_platform_source.sql (user runs in Supabase).
- Activity Sources card (windchasers only): touchpoints now grouped by the LEAD's marketing source (Instagram / Meta Ads / Google Ads / Google Organic / Direct …) instead of conversation channel — channel grouping collapsed to "WhatsApp 100%" and hid where leads came from. New brand colors + FA icons for marketing sources.
- Dashboard home (windchasers only): top row now a true 50-50 split (Engine Overview span 8 → 6, Upcoming Events 4 → 6).
- User-facing: SOURCE badges show Instagram/Facebook for new FB leads; Activity Sources shows the real channel mix; home cards evenly sized.
- `(pending-sha)`

## 2026-07-10 · fix(home): cards no longer break on browser zoom

- Priority Lead Queue and Activity Sources hid columns by VIEWPORT breakpoints, but home cards are half the viewport at xl — browser zoom (125-150%) shrinks the effective viewport into exactly that zone, so a ~586px card still rendered all five table columns and the donut, clipping at the card edge.
- New container-query helpers (globals.css `.cq-card`/`.pq-col-*`/`.as-donut`/`.as-split`): the queue's Next Step / Due columns and the sources ring now collapse by the CARD's own width. Verified zero overflow at 375 / 1280 / 1366 / full width.
- `(pending-sha)`

## 2026-07-10 · fix(core): prebuild no longer overwrites the version

- set-build-time.js was recomputing the patch from the git commit count on every Vercel build — fighting the new hook-maintained version (and shallow clones made it plain wrong: live showed v0.1.10 from a depth-10 clone). It now stamps ONLY the build time; the committed package.json version is the single source of truth.
- This commit is also the first auto-bump: the pre-commit hook takes the version to 0.1.1.
- `(pending-sha)`

## 2026-07-10 · feat(core): v0.1 versioning system + release notes

- Version reset to **0.1.0** — the mobile release. package.json / .build-info / generated-version.ts now agree (were 0.2.0 / 0.0.130 / 0.0.19).
- Auto-versioning live: a pre-commit hook runs scripts/bump-version.js on every commit that writes core/ — 0.1.1, 0.1.2, … carry at 100 → 0.2.0. Manual version sets (commits staging .build-info) skip the auto-bump.
- What's-new feed rewritten: newest "PROXe is live on mobile" (v0.1 chip), then Quick Action Brain (desktop), The Brain, Evals live for WhatsApp + call testing. Scrollbar entry removed.
- User-facing: bell shows "PROXe is live on mobile"; sidebar footer reads v0.1.0.
- `(pending-sha)`

## 2026-07-10 · feat(core): full mobile-responsive pass — every dashboard page usable at 375px

- Shell: drawer nav polished — 44px tap targets, scroll-lock while open, safe-area padding, drawer always opens EXPANDED on phones (a desktop-collapsed rail used to open as a 56px sliver). New shared `useIsMobile` hook + opt-in CSS helpers (`.rgrid-4/.rgrid-2` grid collapse, `.safe-b`, `.touch-44`, `.mobile-below-topbar`); `viewport-fit=cover` for notched phones.
- Chats/Inbox: WhatsApp-style stack on mobile — conversation list full-screen, tap → thread full-screen with back arrow + lead name; ⓘ opens lead details as a full-screen overlay; no auto-jump into the first chat on phones (deep links still open the thread). Desktop three-pane unchanged.
- Leads + D2D visits: tables become tappable card lists below 768px (name · stage chip · phone · score · last activity); tap opens the same lead modal / visit drawer. Settings→Users table unclipped + progressive columns.
- Pipeline: insight tiles stack on phones; stage chevron bar swipes; lead list drops to Name · Stage · Last Activity.
- Events: month view shows count dots per day + a tap-day agenda list under the grid (event text pills were unreadable in 48px cells); bookings filter popover clamped to viewport.
- Engine Overview: on phones the 5 funnel circles become compact stat rows (icon · label + sub · right-aligned number) — survives 100/1000/10K counts on any brand; both variants (standard funnel + POP intensity ladder).
- Brain settings: correct height via dvh (no URL-bar jump), Learning grid no longer overflows, BrainHero side vitals hidden on phones (they blanketed the canvas).
- Touch: hover-hidden actions (lead modal edit/clean/delete) always visible below 768px; health chip drops below the mobile top bar; web-agent widget preview clamps to viewport.
- Fixed in passing: hydration warning from whitespace text nodes in LeadsTable's colgroup (same-line JSX comments after `<col />`).
- User-facing: the whole dashboard now works one-handed on a phone; desktop rendering is byte-identical.
- `(pending-sha)`

## 2026-07-10 08:00 IST · fix(home): Activity Sources can no longer clip its right edge

- Ranked-row columns are all shrinkable now (fixed px columns → minmax; name truncates; tighter gaps; ring column flexes 112–148px), so the %/count/arrow columns can't get cut off at narrow xl widths (e.g. 1280 with the sidebar expanded). Verified via DOM measurement at 1024/1280/1366/1440 and squeezed to a 440px card — zero clipping.
- `(pending-sha)`

## 2026-07-10 07:30 IST · polish(inbox): chat list drops the score — avatar only

- No score ring/chip in the conversation list at all; the selected row shows the same plain avatar as every other row. The score lives in the right details panel, which is enough.
- `(pending-sha)`

## 2026-07-10 07:10 IST · polish(inbox): selected row — one circle, not two

- The selected conversation row was stacking TWO circles (avatar + score ring) and truncating the name. Now the score ring wraps the avatar itself, with the score as a small chip on the ring — one circle, name gets its space back.
- `(pending-sha)`

## 2026-07-10 06:50 IST · polish(home): Activity Sources — ring moves to the LEFT of the card

- The source-mix ring now sits on the left; ranked channel rows fill the right. Nothing else changed.
- `(pending-sha)`

## 2026-07-10 06:30 IST · polish(brain): docked orb clipped to a circle; "Type instead…" quick action

- Docked voice orb is now clipped to a CIRCLE — the canvas glow no longer shows a faint square edge. Full-screen unclipped; same element across the toggle so the voice keeps playing.
- New dock quick action "Type instead…" opens the typed Ask PROXe panel (also where Call-button dial consent lives).
- `(pending-sha)`

## 2026-07-10 06:10 IST · polish(home): Activity Sources — ring back, Top-source tile out

- The source-mix ring (donut with the 30d total in the middle) returns to the right side of Activity Sources; the big "★ Top source" tile is removed. Stat strip + ranked bars unchanged.
- `(pending-sha)`

## 2026-07-10 05:40 IST · feat(core): Activity Sources on every brand + movable home cards; orb polish; brain quick-actions

- Activity Sources card on EVERY brand's overview (was POP-only): touchpoints by channel · last 30 days, in the reference layout — stat strip (total / vs prior 7d / daily avg), ranked channel rows with bars + counts + trend arrows, and a "★ Top source" highlight panel. Fed by a new brand-generic channel aggregation in founder-metrics (zero extra queries). Conversations Trend remains only as a zero-data fallback.
- Movable home cards: Engine Overview / Upcoming Events / Priority Queue / Activity Sources can be drag-swapped via a hover grip; layout persists per browser; a Reset button appears in the top bar when customized.
- Voice orb: aura is now a LIGHT full-page gradient wash (screen-blended, slowly drifting) instead of the hard edge rim; docked orb doubled to 144px (viewport-clamped); FIXED fullscreen rendering as a giant blur (canvas resolution now updates on docked⇄full toggle).
- Brain quick-actions: the brain can now attach actions (call / open page / open lead) to its replies — buttons render under Ask PROXe answers and the voice briefing (new lib/brain/actions + wiring in the brain routes).
- User-facing: same dashboard shape on every brand; drag cards to taste; the brain looks right at both sizes and lights the page while talking.
- `(pending-sha)`

## 2026-07-10 03:10 IST · feat(core): v0.2 — mini voice orb + Lens aura; bell = what's-new only; top bar decluttered

- Docked brain shrunk to a ~72px floating light (compact orb: no caption/close/lang; tiny × and ⤢ appear on hover). Full screen unchanged.
- NEW: Google-Lens-style viewport aura — while the docked orb is interacting, the whole dashboard edge glows with a blurred drifting multi-color rim (pure decoration, pointer-events-none).
- Top bar decluttered: Snapshot and Ask PROXe buttons removed from the overview — the Brain dock covers asking; the bell is the only icon left.
- NotificationCenter repurposed: bell now shows ONLY product updates ("What's new") with version chips + dates; lead-activity feed/toasts/sounds removed. Footer shows the running app version.
- Version bumped 0.1 → 0.2 (root + core package.json) — sidebar badge reflects on every brand; "The Brain talks now" update entry added for all brands.
- User-facing: cleaner top bar; corner orb is subtle until you talk to it, then the whole dashboard lights up.
- `(pending-sha)`

## 2026-07-10 02:10 IST · polish(brain): drop the "What's the update?" caption, soften the hover ring

- Removed the "What's the update?" label above the dock quick-action fan — the pills (Catch me up / Anything urgent? / Ask something…) say it already.
- Hover ring toned right down: a single thin accent ring around the circle, no wide glow halo, minimal shadow, gentler scale.
- `(pending-sha)`

## 2026-07-10 01:30 IST · feat(brain): floating docked orb, "Catch me up" quick action, hover neon ring, no double-greet

- Docked view is now just the small orb floating in the corner (~240×300, transparent — no box/border/shadow), instead of a large panel. Full-screen unchanged.
- Dock hover lights up a neon accent ring around the circle (border + layered outer glow) and nudges the bubble up slightly.
- First quick action renamed "Update me" → "Catch me up" and scoped to the most recent activity only (not the full daily briefing); a single click runs it.
- Voice: the spoken briefing no longer greets/says the name a second time — a short greeting ("Hi <name>, let me pull together today…") always plays first, so the briefing now opens straight into the update.
- `(pending-sha)`

## 2026-07-10 00:30 IST · feat(brain): dock click → brain in place (docked corner), double-click → full screen

- User-facing: single-clicking the Brain dock now makes the widget BECOME the brain right there — a compact corner panel pops in, animates, and talks — instead of taking over the whole screen. Double-click (or the ⤢ button inside) goes full screen; ⤡ collapses back to the corner. One orb instance across the resize, so it keeps talking without restarting. The dock bubble hides while open and returns on close.
- `(pending-sha)`

## 2026-07-09 23:30 IST · feat(brain): dock → talking voice brain + two-way mic; single orb; inbox WhatsApp look; layout dedupe

- User-facing: the Brain dock now wakes on hover (Update me / Anything urgent? / Ask something…) and CLICK expands into the full-screen talking orb that speaks today's briefing; after it speaks it opens the mic (Web Speech API) and listens for a spoken reply — a two-way voice loop. ("Ask something…" goes straight to listening.)
- Brain: reverted to a single pulse-orb visualization (removed cortex/mandala + the variant dot picker); removed the "?" quick-ask button; orb is bigger (R 0.24→0.30) and sits a little above center (cy 0.5→0.43h).
- Dock: singleton guard (kills the duplicate icon), icon enlarged 24→40px, snaps to the right edge on drag-release.
- Token usage: split "Ask PROXe" into (text) vs (voice); ElevenLabs TTS now metered as char-billed voice charges (new brain_voice bucket + estimateVoiceCost).
- Inbox: WhatsApp look — contact avatars (initials + channel badge), green/neutral bubbles with tails, per-bubble header stripped, time bottom-right.
- Layout: removed redundant self-wrapping `<DashboardLayout>` from 9 dashboard pages (the segment layout already wraps them) → single sidebar/header/dock (fixes the nested/duplicated layout).
- `(pending-sha)`

## 2026-07-09 16:20 IST · feat: Brain + Configure ported to ALL brands — functionality shared, content per-brand

- User-facing: every brand now has the Brain (voice orb + Learning) and the Configure card grid. Non-POP brands get neutral business behavior: generic persona built from the brand name, generic quick questions, English-only (no language switcher), accent-colored orb — POP's campaign prompts/vocabulary/tricolor/3 languages did NOT leak anywhere.
- New: BrandConfig gains an optional `brain{}` block (persona, vocabularyRule, quickQuestions, thinkingSteps, languages, voiceId, orbPalette, summaryPrompt, reflectionPersona, evalJourneys, voiceAgent) + `core/src/lib/brain/brainConfig.ts` resolves it over generic fallbacks. POP's campaign content and BCON's sales prompts moved byte-identical from core hardcodes into their brand configs.
- Converted hardcodes: briefing route (isPop → features.warRoom gates; persona/vocab/languages/voice from config), VoiceOrb (questions/langs/steps/palette from config), summarizer (brand ternary → config), VoiceAgentTab (bcon prefill/number + engine/lang pickers + prompts editor all config-gated), Brain page tabs (Map only for warRoom brands; Eval per evalJourneys — hidden where content doesn't exist), Configure/notifications wording via brandLabel.
- Bug fixes found on the way: brain/decisions read BCON's rows for every brand (`['bcon','default']` → `[BRAND_ID,'default']`); learning-summary reflected as a "sales agent" for every brand; brands/proxe/config.ts re-declared a stale inline BrandConfig (now imports the canonical type).
- Build fix: `@brand/prompts/voice-langs` only existed in the pop pack, so ANY non-pop production build of this branch failed (webpack module-not-found). Every brand pack now ships a generic English voice-prompt module with the same exported surface.
- Voice: default TTS voice everywhere = Monika Sogam (env ELEVENLABS_VOICE_ID > brain.voiceId > default); brands without an ElevenLabs key degrade to "voice is not configured for this brand yet".
- features.brain flipped ON for lokazen, windchasers, proxe.
- `(pending-sha)`

## 2026-07-09 15:10 IST · fix: responsive pass — dashboard stops breaking on small screens

- Audited every POP surface for small-screen breakage. Two real breakers fixed:
  - People table (LeadsTable): table-layout:fixed + w-full squished 9 columns to fit a phone (clipping content). Gave it minWidth 900 so the existing overflow-x wrapper scrolls at readable widths instead. Calls table got the same treatment (minWidth 720).
  - Person detail modal: width was 54vw → a ~200px sliver on a 375px phone; now min(720px, 94vw) so it fills small screens and still caps at 720px on desktop. The two-half header (contact card | journey+stats) now stacks on mobile (flex-col md:flex-row); the 6-tab row scrolls horizontally (flex-nowrap overflow-x-auto) instead of clipping/wrapping.
- Verified already-responsive (no change): home (grids collapse grid-cols-2→md-3→xl-6, vertical scroll on mobile), War Room (useIsMobile, 2-col KPI on mobile), Configure (auto-fill grid), Listen + D2D (auto-fit minmax grids; D2D booth table already scrolls), Ask PROXe / Snapshot / Notifications (min(_,94vw)).
- (pending-sha) — needs a manual 375px eyeball on prod (auth-gated pages can't be driven from here).

## 2026-07-09 14:55 IST · fix(pop): War Room demo polish — living trend curves, headline slimmed

- User-facing: every War Room trend line (KPI sparklines + District Comparison) reads as a gentle rising wobble instead of flat-then-cliff. The re-dated seed put nearly all volume in the last few days; display curves are now reshaped to the real total with organic variation (deterministic, 30% real daily signal retained).
- User-facing: headline strip slimmed — sentiment clause and the "118/117 seats" count removed. Now: voices reached (+wk%) · % undecided · swing seats · #1 issue · loop.
- (Battlegrounds card itself was already removed in 99e95aab — a cached bundle can still show it; hard-refresh.)
- `(pending-sha)`

## 2026-07-09 14:45 IST · feat(pop): leader app local-first feed + notifications + big frontline (demo)

- User-facing (leader app): every team action (Observe/Monitor/Coordinate/Response/Escalate) now lands in the Feed INSTANTLY via a local store + fires a local/browser notification — no dependency on the backend round-trip (the backend push is still attempted best-effort so it also reaches the War Room). Feed merges local + server items.
- User-facing: the header bell shows an unread badge (saffron + count) that clears when the Feed is opened.
- User-facing: frontline reads BIG on the bundled pulse — voters 7k-20k, supporters 2-5.2k, volunteers 1.1-2.8k, cadre 380-1000 per seat (was ~95 volunteers, 0 supporters/cadre). Fixes the leader seeing tiny/zero numbers.
- Root cause noted: the app was falling back to bundled mock (getPulseAll), and the live /api/leader/pulse under-samples (10k-row cap over 84k rows across 118 seats) + date-filters the standing ladder — a proper server-side aggregation fix is queued for the backend; the demo path is now local-first and reliable.
- Shipped to pulse-punjab (44945c5) + mirrored here.

## 2026-07-09 14:20 IST · feat(pop): pre-presentation batch — War Room 5-pillar strip + instant cache, campaign wording, theme visibility fixes

- User-facing: War Room KPI strip is now 5 cards — Reach · Standing · TOP ISSUE (biggest issue, its size, % of voices, 7d trend, own sparkline) · Response Loop · GROUND FORCE (ready to volunteer / to vote / rally). Battlegrounds card removed (no constituency numbers up top).
- User-facing: War Room paints instantly on revisit — the last payload is kept in sessionStorage (stale-while-revalidate); fresh numbers replace it in the background.
- User-facing: person Summary speaks campaign language for POP (2-3 plain sentences, never "NO SUMMARY TO PROVIDE", no sales words); web-channel nudges now go out on WhatsApp when the person has a phone; channel "Pulse App" renamed "My Voice"; Avg Response Time no longer shows seeded-data noise (clamped to real sub-5s range).
- User-facing: D2D visit drawer drops the EPIC / No EPIC badge; "Start Test Call" button and artifact-switcher icons now visible in the black/white themes (they were white-on-white); Brain voice orb wears the campaign tricolor (blue-led + green + saffron flecks — deliberately not saffron-led).
- `(pending-sha)`

## 2026-07-09 14:10 IST · feat(pop): leader team-action modal + frontline boost

- User-facing (leader app): tapping ACT on a grievance, a workforce card, or "Push to team" now opens a modal to pick what the team should do — Observe / Monitor / Coordinate / Response / Escalate — each with a plain "what happens next" line. Every choice becomes a directive in the Feed (and War Room Directives) with live status; the Feed badges each item by its action. Shipped to pulse-punjab (1e7ccbc) + mirrored here.
- Data: boosted the POP frontline ~5-8× — Volunteers 3.6k→30.6k, Cadre 3k→11.5k, Supporters 9.4k→31.1k (insert-only, phone prefix +9198766). Every seat now shows a big, non-zero Supporters/Volunteers/Cadre base (~617 / ~356 / ~97 per seat). Fixes the "0 supporters/0 cadre" the leader saw (that was a stale cached bundle over pre-ramp data).
- Verified: leader Bearer path returns directives on prod; boost tier counts confirmed in DB; pulse-punjab deploy READY.
- Next phase: Coordinate/Response actually emailing the team + Monitor push-notifications (today they create the feed directive with the "what happens next" copy).

## 2026-07-09 13:40 IST · fix(pop): person-modal attribution drops the sales "changed stage to Qualified"

- The Summary attribution line ("Last updated by PROXe AI 14h ago - changed stage to Qualified") still leaked a sales stage for POP. Added a stageActionText() helper: for POP it reads "updated their status"; other brands keep "changed stage to X". Applied to all six attribution builders in the summary route.
- (pending-sha)

## 2026-07-09 13:30 IST · fix(pop): person-modal summary reads campaign, not sales ("Qualified stage")

- The person detail Summary said "X is currently in the Qualified stage" — sales language on a voter. Two causes: (1) the AI summary path hardcoded a RETIRED model (claude-sonnet-4-20250514) so it 404'd and always fell back to the crude sales-stage line; (2) the summary prompt had no POP domain. Fixed both: the model now resolves via resolveModel(CLAUDE_MODEL) — so the AI summary actually runs (helps every brand, they were all 404ing) — and POP gets a campaign domain (voter/supporter/volunteer/cadre + grievance, no sales words). The non-AI fallbacks now describe a person by their frontline tier + grievance instead of a sales stage. Other brands' wording unchanged.
- (pending-sha)

## 2026-07-09 13:15 IST · feat(pop): lock the map to Punjab (mask + bounds) — War Room + leader app

- Both slippy maps (War Room PunjabLeafletMap + the Pulse leader app MapCanvas) showed the whole region — Haryana, HP, Rajasthan, Chandigarh — because the CartoDB tiles fill the bounding box and you could pan/zoom out into them. Now focused on Punjab only, like the old map:
  - Focus mask: a world-covering polygon with all 117 constituencies punched out as holes (evenodd), filled with the page background — every neighbouring state is hidden, only Punjab shows.
  - maxBounds clamped to Punjab (viscosity 1.0) so you cannot pan into other states; minZoom raised to the Punjab-fit zoom so you cannot zoom out to the subcontinent.
  - Drill-down and all bubbles/interactions unchanged.
- (pending-sha)

## 2026-07-09 13:00 IST · feat(pop): War Room windowed REACH/LOOP + Listen density pass

- User-facing: War Room REACH card drops the "118 seats" figure and gains a shared Today / 7D / 14D / 28D window switcher that also drives the Response Loop card (windowed reach + resolved-per-window counts).
- User-facing: Leader "Directives" now render brand-scoped (were leaking across brands) and are visually elevated over AI suggestions (fatter accent rail + saffron tint). Live-feed panel widened 270→340px. Header shows a Syncing/Refreshing state so the slow aggregate reads as working, not frozen.
- User-facing: PROXe Listen — Top Trending Keyword tiles compacted to ~half height with a bigger signal count; Sentiment-Over-Time chart shortened; Evidence Board media cards now show 3 lines (was 2).
- API: /api/war-room/data returns reachWindows + loopWindows (cumulative reach and resolved-per-window) from the momentum block; the recommendations query is now brand-filtered.
- Data: re-dated POP constituents into an upward ramp toward today (2,456 today / 27k total) so the War Room series reads as steady growth.
- Verified: leader push→War Room Directives roundtrip confirmed on BOTH local and pop-proxe prod (POST 200 → GET returns it).
- `(ecdc97c2)`

## 2026-07-09 12:30 IST · feat(pop): Brain voice orb — speaks today's briefing (Groq + ElevenLabs Monika Sogam)

- User-facing: The Brain tab is now a living voice orb. Tap it and it gathers today's context (brain overview, war room, leader pushes, news buzz from listen_signals) and SPEAKS the daily briefing in Monika Sogam's voice (eleven_v3, multilingual_v2 fallback, one deterministic voice). Greets the signed-in human by first name; campaign vocabulary only (voices/constituencies/grievances — never "leads"); system refers to itself as PROXe, never "AI".
- User-facing: ? button fans out quick questions (constituencies / leader actions / news buzzing / needs attention); language switcher bottom-right (EN / ਪੰਜਾਬੀ / हिंदी); one-line rolling subtitles synced to the audio; loading ring fills while connecting and closes when the voice starts.
- Speed: words come from Groq llama-3.3-70b (~3-4s incl. data gather, Claude fallback); first sentence TTS'd in parallel with the rest so speech starts in ~6s; gathered context cached 90s so quick-question taps answer in ~1-3s; context slimmed to ~2k tokens to stay under Groq's TPM cap.
- Eval: every run logs llmMs/engine/ttsFirstMs/ttfaMs/chars/language/question to a rolling Redis list (brain:voice:runs) — GET /api/dashboard/brain/briefing returns them, ready for the Eval → Calls "brain voice" surface.
- Orb rendering: brand-accent colors, calm motion, light-theme-aware inks (no white smudge on light), ripples only on the blob itself, malleable blob while speaking, radar sweep chrome. Brain page keeps all four tabs (Brain / Map / Eval / Learning), header is just the heading.
- Also: launch.json gains pop-core-f (port 4016, own dist dir) for this session's isolated dev server.
- `(pending-sha)`

## 2026-07-09 09:45 IST · fix: commit the Configure sub-route pages (appearance / notifications / widget)

- The Configure card launcher links to /dashboard/settings/{appearance,notifications,widget}, but those three route pages were untracked - so those cards 404'd on prod. Committed the three page.tsx files (each self-contained, importing only already-committed shared modules) so the links resolve. No other threads' in-flight work touched.
- (pending-sha)

## 2026-07-09 09:30 IST · fix(pop): dedupe People TYPE column, full-width Configure, drop sales "buying signal" in person modal

- People table: the TYPE column carried an engagement_type sub-label (INFO / VOLUNTEER) that duplicated the INTENT column - the same intent shown in two places. Removed the sub-label; TYPE is just the intensity tier now, INTENT is the single home for intent.
- Configure page: was capped at 1120px, so on a wide screen the 9 cards crammed into the top-left with a sea of empty space. Removed the cap - the auto-fill grid now fills the full width (4-5 columns).
- Person detail modal: "Buying Signals" is sales language that does not belong on a voter. For POP the Score Breakdown radar axis reads "Commitment" and the Summary insights group reads "Key Signals" instead. Structure unchanged.
- (Battlegrounds KPI card: the redundant "swing" badge is removed - it is already in the headline line; that edit ships with the in-progress War Room window work.)
- (pending-sha)

## 2026-07-09 09:00 IST · feat(pop): seed campaign-playbook knowledge base (20 entries)

- Loaded a starter POP knowledge base (brand='pop') so Ask PROXe / the agent draw on real campaign context: issue positions (water, drugs, jobs, farm debt, power, roads, education, health), grievance-handling scripts (doorstep water/jobs/drugs, how to log a knock), event FAQs (RSVP, booth meetings, booth assignment), and playbook entries (one-line message, the intensity ladder, channels, what POP is, what PROXe does). Q&A + FTS chunks, no embeddings needed. Migration 032 committed; the 20 rows are already inserted in the POP DB. Placeholder content - refine with the campaign's own positions.
- (pending-sha)

## 2026-07-09 08:45 IST · feat(pop): Ask PROXe /commands + @mentions, On Ground → D2D

- Ask PROXe now takes shortcuts. Type a /command to pull an artifact's live summary into the chat: /warroom (active seats, top constituencies, lean split, loop), /d2d (knocks, met, top workers, top booths), /listener (7d signals, crisis/opposition/positive, trending), /directives (what the leader/AI pushed). Tap-chips in the empty state make them discoverable.
- @mention anyone to see what they've done: @Name looks the person/worker up in the campaign's own data - a worker's visits/met/constituencies/last-active, or a person's tier/grievance/lean/channel. Says "couldn't find" when there's no match. All fetched from brand tables and injected into the model's DATA, so it stays guardrailed - it can't invent activity.
- Artifact/nav renamed On Ground → D2D.
- (pending-sha)

## 2026-07-09 08:15 IST · fix(pop): Ask PROXe in campaign context, sidebar split into two groups, drop Brain map caption

- Ask PROXe (the dashboard chat) was answering POP in aviation/sales terms - a table of New / Qualified / High Intent / Booking Made / In Sequence stages - because the data it received was built from lead_stage. It now gets a campaign-shaped snapshot: intensity_ladder (Contact→Voter→Supporter→Volunteer→Cadre), top_grievances by issue, by_channel, engagement_heat, upcoming_events. The model can only speak from what's in the data, so the shape IS the guardrail - it can no longer show random sales stages. System prompt hardened to campaign-only vocabulary.
- Sidebar split back into two groups for POP: the day-to-day (People · Chats · Calls · Events) and the system (Humans · Agents · Knowledge · Configure), one divider before Humans. (Other brands unchanged.)
- Brain engine-map: removed the explanatory floating caption ("How the whole engine is wired…") - the map speaks for itself.
- (pending-sha)

## 2026-07-09 07:45 IST · feat(pop): Recent Activity shows campaign signals, not lead-stage churn

- The notification bell / Recent Activity drawer used to stream every lead stage move ("X entered Qualified stage") - noise at thousands of leads/day. For POP it now surfaces the relevant stuff coming in: new directives (AI suggests / Leader directive), external Listen signals (Crisis / Opposition / Positive coverage), and upcoming campaign events - each with its own icon + label. Other brands keep their lead-activity feed unchanged (scoped by BRAND_ID in the notifications API).
- POP clicks route to the War Room (these signals have no lead behind them); footer reads "Open War Room".
- (pending-sha)

## 2026-07-09 07:20 IST · feat(pop): War Room reframed to the 4 things that matter + real 7d/14d momentum

- The KPI strip is now the 4 pillars a war room actually answers: Reach (are we growing contact?), Standing (are people with us, which way moving?), Battlegrounds (which seats decided now?), Response Loop (are we acting?). Was 5 cards with a redundant "Touchpoints Today".
- Deltas are REAL now, not hardcoded strings. The old +14% / +12% / +5 / +3pp were literal fake values. Each card shows the actual 7-day AND 14-day change: reach momentum via exact indexed counts (last-7d vs prior-7d, last-14d vs prior-14d), sentiment shift in pp for both windows.
- Added a synthesized one-line "main idea" headline above the strip: "Sentiment {label} {net} · {reach} reached across {active}/117 seats (+X% wk) · {undecided}% undecided · {N} swing seats · {issue} #1 · loop {pct}%" - the single glance a director takes.
- Killed the misleading "8000 voices" donut: that number was the scan CAP (R.length), not real. Support/Lean/Opposed now scales the sample's proportions to the true electorate total so the donut reads at campaign scale. Loop Health denominator is the exact full-dataset total, not "/8000". Numbers formatted with grouping (27,000 not 27000).
- Directives are quickly understandable: a colored source rail + plain-language tag ("AI suggests" / "Leader directive" with icon) say WHO is asking before the title registers; cleaner acked/done state.
- (pending-sha)

## 2026-07-09 06:40 IST · fix: tolerate friendly/malformed CLAUDE_MODEL so AI scoring + snapshots stop 404ing

- Root cause: CLAUDE_MODEL was set to "sonnet_5" (not a real model ID). Every Claude call using it 404'd, so lead re-scoring silently fell back to rule-based scores and the AI narrative surfaces (war-room summary, brain) failed. The retired-model remap did not cover this class of typo.
- Added resolveModel() in claudeClient: retired-remap → trust any explicit claude-* id → normalize friendly aliases (sonnet_5 / "sonnet 5" / sonnet / opus / haiku / fable → canonical ids) → last-resort claude- prefix. getModel() and getReasoningModel() now route through it, and the three raw-fetch call sites that read CLAUDE_MODEL directly (leads/score, calls/[id]/translate, voice vapi-webhook) share the same guard.
- Net: whatever plausible value is in CLAUDE_MODEL resolves to a live model ID instead of failing. Recommended: still set CLAUDE_MODEL=claude-sonnet-5 (canonical) in the deploy env, and keep CLAUDE_API_KEY set in Vercel + brands/pop/.env.local (not core/.env.local, which stage-brand wipes).
- (pending-sha)

## 2026-07-09 06:10 IST · feat(pop): Brain engine-map spread out (no overlap) + platform icons on trending keywords

- Brain > Map: the engine connection flow was cramped (5 lanes ~340px apart, nodes ~232px wide → boxes and edges overlapping). Blasted the layout out — ~560px between lanes, ~140px between rows. Verified 24 nodes, ZERO overlapping pairs; fitView frames the whole flow so you can read exactly what feeds what.
- Top Trending Keywords: each tile now shows the platform icons the phrase is actually being said on (X / YouTube / WhatsApp / News / etc.), dominant first, alongside the issue category - so it is clear where a keyword is trending. Digest API returns top-3 sources per keyword phrase.
- (pending-sha)

## 2026-07-09 05:40 IST · feat(pop): X icon (no more Twitter bird), suppress Google-logo thumbnails, booth numbers to campaign scale

- Signal Inbox / Source Mix / Evidence Board: the Twitter bird is replaced by the X logo everywhere (FaXTwitter), label X. Social signals surfaced so X / YouTube / Reddit / WhatsApp / Facebook / Instagram icons actually show at the top of the inbox.
- Google News redirect pages hand back Googles own logo as og:image - those (and any google/gstatic-hosted image) are now filtered out, so the inbox and evidence board stop showing the blue GN logo as fake article media.
- Booth Campaigns numbers scaled to campaign level: booth universe expanded to 48 (procedural, deterministic), ~240 more visits generated, a 5th active campaign added. Active Campaigns 4, Booths 48, Doors Remaining ~3.4k, Members 338, Photos 193, and a balanced priority mix (High 14 / Medium 17 / Low 17) instead of everything reading critical.
- (pending-sha)

## 2026-07-09 05:00 IST · feat(pop): real outlet identity + article media in Signal Inbox, Priority Constituencies to reference design

- Signal Inbox: rows now name the actual OUTLET (The Express Tribune, DD News, NDTV) parsed from the article - the useless news.google.com chip and aggregator logo are gone; outlet favicons only when the link is the real site. RSS fetch now follows a budgeted set of article links per run and reads the page og:image, so news rows carry real media thumbnails on the right (28 of the latest 60 already have images, grows every fetch).
- Home Priority Constituencies rebuilt to the reference: glowing red OPEN tiles, seat name + colored issue chip, pin + district, loop / mood / supporters pills, an 8 day new-voices sparkline with momentum % and arrow per seat (new small indexed query on top of the pop_home_agg RPC), and View details. 
- (pending-sha)

## 2026-07-09 04:00 IST · feat(pop): Booth Campaigns tab to reference design

- User-facing: the On Ground Booth Campaigns tab is the full command view now: 6 KPI cards with sparklines (Active Campaigns, High Priority Booths, Doors Remaining, Photos Collected, Members Spoken To, Support Trend), Priority Campaigns cards (status badge, location + booths, doors progress, Contact/Support/Flags, priority pill + worker photo stack + Review/Assign/View), Booth Priority Queue table (priority pills, doors left + progress, contact/support bars, 7 day issue trend sparkline, last activity, assigned worker with photo, pagination), and a right rail: Priority Breakdown donut, Top Issues by Booth, Worker Allocation, Booths Needing Revisit.
- All derived from the mock D2D visit data (deterministic, no Math.random); swaps to live d2d_visits aggregates later.
- (pending-sha)

## 2026-07-09 03:25 IST · fix(pop): Listen analytics cards fill their height - no dead space

- Top Trending Keywords is an exact 2 x 4 stretch grid (no empty slot, tiles fill the column). Sentiment Over Time: KPI chips 2 x 2 and a taller centered chart. Mood by Region: bigger mini map, roomier rows, list vertically centered. All three cards measure identical heights with zero void at the bottom.
- (pending-sha)

## 2026-07-09 03:00 IST · fix(pop): Activity Sources overlap gone for real

- The card content was taller than the fixed home row, so the share bar painted over the source table. Sized everything to actually fit: 148px donut, single line insight text, tighter table rows, legend row dropped (bar + table already carry the labels). Verified: zero overflowing elements, clear gap between table and bar at desktop width.
- (pending-sha)

## 2026-07-09 02:30 IST · chore(pop): artifact renames - On Ground + Listener

- Switcher entries now read: Overview, War Room, On Ground (was Door to Door), Listener (was Listen), Pulse of Punjab.
- (pending-sha)

## 2026-07-09 02:10 IST · feat(pop): calendar brand colors + light mode fix + full width, switcher pinning, denser home events

- Campaign Events: full width layout, confirmed pills ride the brand saffron, tinted pills use theme text so LIGHT MODE is readable again (pale hardcoded text was invisible on white). Five more mock events fill the month (Mohalla Meetings, Youth Sports, Canal Water Fix Drive, Booth Committee Formation, Mandi Visit).
- Artifact switcher: pin any artifact (pin icon per row, persisted); pinned items float to the top always in the canonical order Overview → War Room → Door to Door → Listen → Pulse of Punjab.
- Home Upcoming Events: denser cards + list now pulls 8 events so more show at a glance.
- Note: the face banner on the Pulse of Punjab app is the separate pulse-punjab repo, untouched here.
- (pending-sha)

## 2026-07-09 01:30 IST · feat(pop): War Room bottom rows to reference design + clean artifact switcher

- User-facing: Intensity Ladder is a real funnel now (trapezoid tiers with icons, PEOPLE column, per tier CONVERSION chips, Will vote / Will work / Will rally / Will share stat tiles). Volunteer Pulse: big count + trend, ranked LOCATION table with bars, Most Active / Trend / Last Updated footer strip. D2D Coverage: four icon stat tiles, area chart with axis labels, Top Workers (Today) list. Channel Mix: ranked horizontal bars with channel icons, % and counts, Total Volume footer. Issue Trend: range chip, centered legend, Peak + Total Mentions footer. Constituency Snapshot: mini bars for Support / Lean / Opposition + four insight tiles (Highest Support, Most Volume, Rising Opposition, Data Quality). Panel headers get icon tiles + info dots. No overlaps, rows rebalanced.
- Artifact switcher stripped to five clean rows: Overview, War Room, Door to Door, Listen, Pulse of Punjab (click out). No descriptions, no status badges, no footer link. MyVoice removed from the list.
- (pending-sha)

## 2026-07-09 00:40 IST · feat(pop): Campaign Events to reference design + home 50-50 with scroll free Activity Sources

- User-facing: Campaign Events page rebuilt to the reference: KPI strip (Confirmed / Leadership Proposed / AI Suggested / Awaiting Sign-off with deltas), clickable legend filters, month grid with 4 typed pills (solid saffron / blue outline / dashed purple / dashed orange), day count badges, day selection, and the Event Intelligence rail: selected day breakdown per type, AI Rationale with confidence, Quick Actions (Approve actually confirms, Reject removes), overlap detection, Upcoming Approvals with priority chips.
- Home bottom row exactly 50-50; Activity Sources is one card with NO internal scroll: donut + insights left, per source rows right, share bar below.
- (pending-sha)

## 2026-07-08 23:59 IST · feat(pop): home redefined (ladder engine, wide events, wide activity) + War Room decluttered + slim scrollbars

- User-facing: home Outreach Engine is now the intensity ladder for POP: Voters → Supporters → Volunteers → Cadre → Grievances Logged (real counts from all_leads.intensity), in a narrower card; Upcoming Events takes the wide slot so the rich reference cards breathe. Bottom row flipped: Priority Constituencies narrower (it is a compact list), Activity Sources wider.
- War Room decluttered: Daily Targets, Event Monitor and the Listen panel removed (Listen has its own artifact page; events live on the Events calendar). Rows rebalanced to 3 panels each, no overlap, even spacing. Top Issues by Salience drops the meaningless "Other" bucket.
- Slim scrollbars everywhere: 6px rounded translucent thumb, no track, no arrow buttons (Windows Chromium was drawing the classic chunky bar).
- Campaign event titles de-hyphened in DB (Nukkad Sabha · Water & Farm Debt).
- `(92aa0664)`

## 2026-07-08 22:50 IST · feat(pop): Listen analytics row to reference + dashboard card fix + map click polish + variety

- FIX: dashboard home broke (Engine/Events squeezed to nothing) because Activity Sources rendered full width inside the fixed height home grid. It is now a compact card back in the Conversations Trend slot; Priority Constituencies back to its normal width. All rows visible again.
- User-facing: Listen analytics row rebuilt pixel to pixel to the new reference: Top Trending Keywords as tile cards (rank color, category icon + label, big signal count, up/down % vs last 7d, tracked total + updated footer), Sentiment Over Time as stacked smooth areas with KPI chips (Positive/Neutral/Negative/Total with deltas), its own day range select and tap to hide legend, Mood by Region with a mini Punjab map (numbered mood score badges), score sorted list and the Mood Score formula footer.
- Source variety: reddit + blog added to the Listen source enum (migration 031, applied); demo cross platform signals seeded (Twitter, Reddit, Facebook, Instagram, YouTube, blog, WhatsApp) with images so the inbox and evidence board show the full mix.
- No hyphens anywhere: page copy, AI narrative strings, action texts, news titles (trailing outlet suffix stripped), source/author names in DB, Door to Door labels.
- War Room map: cluster bubbles smaller (30-54px, tighter halo); constituency polygons no longer steal clicks aimed at bubbles - polygon click only activates when zoomed right in (>= 10.75).
- D2D: worker rows now show real portrait photos (8 Unsplash portraits bundled at brands/pop/public/unsplash/workers, credited in _credits.json), initials fallback kept.
- `(5c390678)`

## 2026-07-08 06:10 IST · feat(pop): Language column on Calls + drop dead rows + fix transcript writes

- Language column added to the Calls list (after Direction): English/Hindi/Punjabi. Dialed language now stored at call time in voice_sessions.channel_data (jsonb; no schema change).
- Dead rows removed: calls still queued at 0s with no turns (unanswered dials) are filtered out of the list.
- Fixed two silent bugs: (1) v3-telemetry wrote main_language to voice_sessions, but that column doesn't exist — the whole status update failed, leaving V3 stuck "queued" (removed it). (2) transcript inserts (V2 + V3) were missing message_type and used wrong sender values, so they silently failed — now message_type:'text' + agent/customer to match V1.
- `(pending-sha)`
## 2026-07-08 21:40 IST · feat(pop): Activity Sources panel + reference event cards + clustered War Room map

- User-facing: home "Activity Heatmap" card replaced by the full-width **Activity Sources** panel (reference design): header stats strip (total touchpoints / vs prior 7d / daily avg), source-mix donut with % labels, per-source table (share, touchpoints, momentum vs prior 7d), purple Insights panel (most active channel, strong offline source, voice-led share), and the share-of-total stacked bar with legend. Priority Constituencies now spans full width above it.
- User-facing: **Upcoming Events** cards rebuilt to the reference: orange timeline rail + dots, date tiles (SAT/11/JUL), event-type badges (Sabha/March/Cultural/Rally), pin + clock lines, Going/Interested/Volunteers/Supporters chips, countdown pill, chevron, "All times shown in local time" footer.
- User-facing: **War Room map clustering** - zoomed out shows one aggregated bubble per district (total voices + seat count, halo ring); clicking a cluster zooms into that district where per-seat bubbles take over (click seat = drawer, as before). No more 115 overlapping bubbles.
- API: founder-metrics campaignHome.sources gains total30d + mix[] (per-magnet 30d count/share + last-7d-vs-prior-7d delta).
- `(26042f86)`

## 2026-07-08 20:45 IST · feat(pop): Listen realness pass — real media, real logos, real trending phrases

- User-facing: Signal Inbox shows the actual outlet's favicon as the source logo (news) and the article image / YouTube thumbnail on the row's right; Evidence Board is media-first (real photos, video play overlay, outlet header, click-through) instead of text boxes.
- Trending Keywords now surface actual phrases being said across pulled signals ("canal water", "MSP payment", "Opposition holding rally") via 2-3 word n-gram mining with the issue category shown under each — publisher names stripped so outlets don't rank.
- Sentiment Over Time: smooth bezier lines (mockup style). Mood by Region: seats under 5 signals filtered out (no more 100%-negative single-signal noise), softer segmented bars.
- Page density tightened toward one-viewport fit (smaller KPI cards/gauge, single-line table rows).
- Pipeline: listen_signals.image_url (migration 030, applied), RSS fetch extracts item images (media:content / enclosure / html-encoded img — TOI style) and merges on re-fetch to backfill.
- `(fad2cb3a)`

## 2026-07-08 19:45 IST · feat(pop): PROXe Listen full mockup redesign

- User-facing: Listen page rebuilt to the polished mockup — 5 KPI cards with sparklines + Heat Score gauge, rich Signal Inbox (source icon, sentiment + severity badges, chips, load-more), "What PROXe Thinks" AI panel with Recommended Actions (Escalate / Prepare Response / Monitor) and Source Mix grid, Trending Keywords table (trend arrows + sentiment dashes), Sentiment Over Time line chart, Mood by Region table with heat badges, Evidence Board carousel. Sources manager + Filters now behind header buttons.
- Listen digest API: daily series now carries crisis/opposition/positive per day (sparklines), prev-window totals for delta chips, and per-keyword sentiment + trend.
- Dev-only: next.config supports NEXT_DIST_DIR so parallel dev servers stop corrupting each other's .next chunks (root cause of "design changes not showing / breaking" — multiple chats' servers shared one build dir). Default unchanged; prod untouched.
- `(f803072a + fa6e6adb)`

## 2026-07-08 05:30 IST · feat(pop): transcript + recording for V2 (ElevenLabs) and V3

- V2 was "completely blind": no transcript, no recording. Now the Calls list lazily pulls the ElevenLabs conversation → writes the transcript to conversations (list count + detail view work like V1) and sets a recording URL.
- Recording proxy: /api/dashboard/calls/[id]/audio streams ElevenLabs audio (behind the API key) so the dashboard can play it; V1's public Vapi URL redirects through.
- V3 transcript: the pipeline now ships the conversation text in its telemetry; the ingest writes it to conversations. (V3 recording still pending — needs audio capture.)
- `(pending-sha)` + VPS pipeline redeploy
## 2026-07-08 04:55 IST · fix(pop): known-name calls no longer ask for the name at all

- Greeting by name worked, but the agent still asked "what's your name?" because the numbered NAME step was still in the prompt body and a soft appended note didn't override it. Now, when the name is known: the NAME step line is physically replaced with an "already known" instruction, and a hard ‼️ directive is prepended at the top. Verified pa/hi/en: greets by name, no name-question phrasing remains.
- Applies to V1, V2, and V3 (the prompt endpoint the pipeline fetches).
- `(pending-sha)`
## 2026-07-08 04:30 IST · feat(pop): V3 native Sarvam voice, name-aware greeting, V1 anti-cutoff

- V3 voice: switched the pipeline's TTS from ElevenLabs (which anglicized Hindi/Punjabi — "English person speaking Hindi") to native Sarvam Bulbul (anushka). Proven: Hindi + Punjabi audio render natively. Env-switchable back to 11labs.
- Name-aware greeting: if we already know the caller, the agent greets them by name and SKIPS the "what's your name?" step — across V1, V2, and V3 (the prompt endpoint personalizes; the pipeline passes the name through).
- V1 cutting/noise: enabled Vapi background denoising + a stopSpeakingPlan (3 words / 0.35s before it counts as an interruption) so the agent isn't cut off mid-sentence by noise.
- `(pending-sha)` + VPS pipeline redeploy
## 2026-07-08 03:40 IST · fix(pop): V3 pipeline TTS on eleven_v3 (Monika renders correctly)

- V3's ElevenLabs TTS was on eleven_flash_v2_5, which mangles the Monika voice. eleven_v3 is the correct model (same as V1/RelevanceLab) but it's REJECTED (403) on ElevenLabs' realtime websocket — only the HTTP TTS service accepts it.
- Switched the pipeline to ElevenLabsHttpTTSService for eleven_v3 (websocket service still used for flash/turbo/multilingual via env). Set ELEVENLABS_TTS_MODEL=eleven_v3 on the VPS.
- Proven in-pipeline: eleven_v3 + Monika + Hindi → 25.6KB pcm_8000 audio, no error.
- Trade-off: eleven_v3 has higher TTFB than flash; quality over latency per requirement.
- VPS pipeline redeploy (not in repo) — this is a record entry.
## 2026-07-08 03:10 IST · fix(pop): restore V1 voice + put the prompt editor IN the Voice tab

- V1 voice reverted to its native Monika + eleven_v3 (I'd swapped it to flash_v2_5, which changed how it sounded). A different TTS model is now opt-in via env only, never silently applied.
- The per-language prompt editor (English/Hindi/Punjabi) is now embedded directly in the Voice agent tab as a collapsible "Voice Prompts" panel — plus the standalone page. Same one source, read by V1/V2/V3. Makes crystal clear it's NOT hardcoded and NOT Vapi.
- `(pending-sha)`
## 2026-07-08 18:20 IST · fix(pop): eval aggregates only count real conversations (>20s, >1 turn)

- Short calls dropped in the first few seconds with no turns were flattering the latency/cost averages, making the system look faster than it is. Engine + language aggregates now count only calls >20s AND >1 turn.
- The call list still shows every call; a note surfaces how many were counted vs excluded so nothing is hidden.
- `(pending-sha)`
## 2026-07-08 18:00 IST · fix(pop): V2/V3 calls stop showing "queued · 0s"

- V2 and V3 calls connected fine but the dashboard never moved them off "queued" (only V1 had the Vapi webhook). Now:
  - V3: the telemetry ingest flips voice_sessions to completed + real duration.
  - V2 (ElevenLabs, no webhook): the Calls list lazily syncs pending rows from the conversation API (capped, parallel) and persists completed + duration.
- Note: V2's prompt now comes from our Voice Prompts editor (override) — editing ElevenLabs' own dashboard no longer applies, same as Vapi.
- `(pending-sha)`
## 2026-07-08 17:35 IST · feat(pop): per-language latency comparison in the eval

- The eval now records the DIALED language (V1 via Vapi call metadata, V3 via pipeline telemetry) instead of relying on flaky post-call extraction.
- New "By language" comparison block on the voice bench: Hindi vs English vs Punjabi latency (STT/LLM/Voice/Endpoint/Vobiz/Turn avg + calls + cost) side by side, over the current engine filter. Always shows all three regardless of the language filter.
- `(pending-sha)` + VPS pipeline redeploy
## 2026-07-08 17:05 IST · fix(pop): Indian-accent voice everywhere + V2 speaks the selected language

- V2 Hindi didn't work because the ElevenLabs agent was hardcoded to Punjabi and blocked per-call overrides. Enabled language/first_message/prompt overrides on the agent and wired V2 to the same one-core-place prompt in the selected language.
- English came out US-accented on V1/V2 (eleven_v3 models neutralize accent). V1 now forces the Monika voice on eleven_flash_v2_5 (keeps the Indian accent across pa/hi/en) — matching V3.
- Voice is now Monika (1qEiC6qsybMkmnNdVMbK) + flash_v2_5 across V1 and V3; V2 uses Monika via its agent.
- `(pending-sha)` + V2 agent config PATCH (live)
## 2026-07-08 16:30 IST · feat(pop): one core place for voice prompts (Configure → Voice Prompts)

- New dashboard editor: per language (pa/hi/en), three fields — Opening (start line), Prompt (body), Closing (end lines). Saved to dashboard_settings; read by BOTH V1 (Vapi) and V3 (Sarvam pipeline). No deploy, no Vapi — edits apply on the next call.
- V1 test-call and V3 pipeline both resolve the prompt from this one place (DB override → brand file default). Editing Vapi's dashboard no longer matters.
- Prompts restructured into opening/body/closing with a compose() that rebuilds the system prompt. Diction default fixed: "sunange" (was "sunenge").
- "Edit prompts" link added on the Voice agent tab.
- `(pending-sha)` + VPS pipeline redeploy
## 2026-07-08 15:55 IST · feat(pop): V1/V2/V3 engine badge on every Calls row

- Each call in the Calls list now shows a V1/V2/V3 badge next to the contact — derived from the engine:<name> marker on the session (Vapi / ElevenLabs / Sarvam). See at a glance what placed each call.
- Also stops the raw "engine:sarvam" marker from leaking in as summary text.
- `(pending-sha)`
## 2026-07-08 15:40 IST · fix(pop): V3 voice eval — real TTS, endpoint, + Vobiz leg

- Root bug: pipeline bucketed TTS TTFB as STT because "ElevenLabsTTSService" contains the substring "stt" and the check ran stt-first. Now checks "tts" first — VOICE shows the real number, STT shows Sarvam.
- Endpoint: reports the VAD trailing-silence wait (our turn-taking config) per turn instead of 0.
- Vobiz leg: new transport metric = residual of the real perceived latency minus STT+LLM+TTS+endpoint. Shows as a "Vobiz" chip in the V3 split + per-call detail.
- User-facing: V3 eval now shows STT / LLM / Voice / Endpoint / Vobiz, not two mislabeled numbers.
- `(pending-sha)` + VPS pipeline redeploy
## 2026-07-08 15:15 IST · fix(pop): kill hardcoded windchasers.in in web-agent preview

- Web Agent settings widget-preview address bar showed "windchasers.in" for every brand (hardcoded fallback). Now uses the brand's own website (pop=goproxe.com) via getBrandConfig().website, neutral placeholder if none.
- Reset Chat cleared a hardcoded `windchasers.chat.sessionId` key → did nothing for pop/lokazen/bcon. Now clears `${brand}.chat.sessionId`.
- User-facing: POP web-agent preview no longer shows a Windchasers scene.
- `(pending-sha)`

## 2026-07-08 14:55 IST · fix(pop): harden model override + Brain quick-link on Calls

- Harden the Vapi model override: build a minimal { provider, model, messages } from the assistant's real config instead of spreading the whole object (a null `temperature` could itself be rejected). Fallback openai/gpt-4o-mini keeps provider present.
- Calls page: new "Brain" button (brain-gated) jumps straight to the Eval bench — /dashboard/settings/brain?tab=eval, which the Brain page now deep-links via ?tab=.
- User-facing: all 3 languages dial on V1; one-click Calls → Eval.
- `(pending-sha)`

## 2026-07-08 14:40 IST · fix(pop): Vapi model override needs provider

- Hindi/English (and Punjabi) test calls failed: "assistantOverrides.model.provider must be one of…". A Vapi `model` override is validated standalone and requires `provider`; we sent only `messages`.
- Fix: fetch the assistant's real model (openai/gpt-4o), keep provider/model/tools, replace only the system message per language. Falls back to openai/gpt-4o-mini if the fetch fails.
- User-facing: all 3 languages dial again on V1.
- `(pending-sha)`

# Changelog — company-wide

> Company-wide log across all brands. Entries are tagged by repo/brand — **bcon**, **windchasers**, **proxe**, or **master** (the canonical template).
>
> **Per-brand changelogs** (what changed inside one brand, even for single-brand work):
> - [`brands/bcon/agent/CHANGELOG.md`](brands/bcon/agent/CHANGELOG.md)
> - [`brands/windchasers/agent/CHANGELOG.md`](brands/windchasers/agent/CHANGELOG.md)
> - [`master/agent/CHANGELOG.md`](master/agent/CHANGELOG.md)
> - [`brands/lokazen/agent/CHANGELOG.md`](brands/lokazen/agent/CHANGELOG.md) — currently stale (inherited from `master` at scaffold time); Lokazen entries logged here until it's cleaned up.
>
> **Versioning** (two levels, both auto-bumped per commit by `scripts/git-hooks/pre-commit`; install with `sh scripts/install-git-hooks.sh`):
> - **Company-wide** — root `package.json` (`proxe-platform`) bumps on *every* commit, any brand.
> - **Per-brand** — each `<brand>/agent` bumps its own version when a commit touches it.
>
> **Propagation principle:** a change that belongs to every brand — even a small one made in a single brand like BCON — should flow **brand → `master` → all branches**, so the canonical core stays the source of truth and nothing diverges. Log it in the relevant per-brand changelog **and** here.

## 2026-07-08 · feat(lokazen): capture + show owner property details in the lead modal

- An owner who typed full property details in chat (Praveen — 950 sqft, ground floor, ₹1.5L rent, 6mo advance, 3yr lock-in, BH Road Nelamangala, Maps link) had NONE of it captured as structured data — the agent replied conversationally and the modal showed nothing. Only form-submitted owners got the structured `unified_context.lokazen.*` fields.
- **Capture:** extended the engine's `update_lead_profile` tool with the commercial-property fields (property_type, size sqft, rent, floor, deposit/terms, availability, area/locality, Maps link) and stored them in the brand namespace using the SAME field names the inbound-form path writes — so a typed detail lands in the same structured slot a form submission does.
- **Display:** added a "Property details" block to `LeadDetailsModal` (reads `unified_context.lokazen`, so it's null/hidden for every other brand) showing property/size/floor/rent/deposit/area/availability + a "View on Google Maps" link. Works immediately for form-submitted owners; populates for chat owners as the tool captures.
- Known gap (scoped next): `update_lead_profile` is only wired when the engine is in a tool/booking flow, so a pure free-text detail-dump with no booking intent (exactly Praveen's case) isn't captured yet — that needs an always-on property extractor on the WhatsApp/web message path (extend `extractProfileFromConversation`). Modal + capture-when-in-flow shipped now.

## 2026-07-08 · fix(web): persist the pre-chat name the widget passes, so web leads stop showing "Hi there"

- Web-chat route accepted a pre-chat name (`session.user.name`) and used it for the AI greeting, but the ONLY thing ever promoted to `customer_name` was the AI-extracted chat name (`profile.full_name`). So a website lead that entered their name still saved a nameless card and got "Hi there" on the welcome template.
- The AI-intent promotion now falls back to the pre-chat `session.user.name` (guarded by `isLikelyRealPersonName`) when no chat name was extracted — so a provided pre-chat name is persisted.
- Investigation note (via live DB): of 372 recent lokazen leads, 250 are nameless and 247 of those are `web` leads with NO name anywhere in their record — so for most of them the website isn't sending a name at all. This fix covers the case where it IS sent; the broader gap is upstream (the lokazen website widget/form must capture + pass the visitor's name). Flagged for confirmation.
- Known limitation: the promotion runs inside the AI-intent block, which early-returns if the conversation yields no extractable profile — so a pre-chat name is persisted only once some profile is extracted (typical for any real chat).

## 2026-07-08 · fix(lokazen): lead summary was empty because the summarizer was hardcoded for Windchasers aviation

- A lead with 20 messages of real content (Praveen Kumar — owner who shared full property details: 950 sqft, ground floor, ₹1.5L rent, 6mo advance, 3yr lock-in, BH Road Nelamangala) showed only "…is currently in the In Sequence stage." Root cause: `api/dashboard/leads/[id]/summary` built its Claude prompt with "Summarize this lead for an aviation training academy (Windchasers)… which course/program (CPL/PPL/helicopter)… this is a pilot-training lead, not a business." For a lokazen commercial-real-estate lead there was no matching domain, so Claude found no aviation info and the route fell back to the trivial stage line.
- Made the summary framing brand-aware (`summaryDomain(BRAND_ID)` + `buildLeadSummaryPrompt`), used at both Claude call sites. Lokazen now summarizes as owner/brand/scout with the right headline facts (area, size, floor, rent, terms / requirement / onboarding stage); Windchasers keeps its aviation framing; other brands get a neutral business framing. The full conversation is still passed, so the model draws the details from what the lead actually typed.

## 2026-07-08 · fix(lokazen): scout chat invented a Play Store app + looped the user back to the same number

- Live scout chat: asked for an app link, the AI fabricated `https://play.google.com/store/apps/details?id=com.lokazen.scout` (no such listing — nowhere in the prompt/config, pure hallucination), claimed "iOS and Android", and when the scout said "not available" it sent the fake link again. Root cause: the prompt tells the model "scouts submit through the Scout app" but gives no link and only forbids inventing "numbers/policy" — nothing about URLs.
- Also handed the scout the company WhatsApp number (+91 63668 26978, hardcoded in the prompt) as "message our support team on WhatsApp" — the exact line they were already texting. Circular by construction.
- Added two hard scout rules to `lokazen-prompt.ts`: (1) NEVER invent/send a Play Store / App Store / download URL — if asked for the app, share only the real onboarding link `lokazen.in/scout#scout-form` and say the team will help; don't claim store availability. (2) NEVER hand a phone/WhatsApp number (esp. the company number) to someone already on WhatsApp — you ARE the channel; raise the support request and say the team replies here. Also added a guard note under COMPANY DETAILS so no audience gets looped back to the same number.
- (Runtime confirmed: no `agent_prompt` DB override for lokazen, so the file prompt is live.)

## 2026-07-08 · fix(lokazen): stop showing synthetic ids as a lead's name/email (list + modal)

- A lead was showing its NAME and email as `owner_9341333999_1783481293327@noemail.lokazen.in` — an internal id the owner app stamps before a real name/email exists. The modal already hid it as the *email*, but the leads LIST used it as the *name* (falls back to email when no name), and the modal header showed it as the name.
- Ingestion (`cleanName` in api/agent/leads/inbound): now also strips `@noemail.`/noreply/placeholder addresses and `<type>_<digits>…` internal ids, so the synthetic id is never stored as the name going forward.
- Leads list (`LeadsTable`): added `realName`/`realEmail`/`isSyntheticContact` sanitizers — `displayName` now falls back real name → REAL email → phone → "—" (never the synthetic id), and the email cell hides synthetic addresses.
- Lead modal (`LeadDetailsModal`): added a `displayName()` companion to the existing `displayEmail()`; the header shows "Unknown Lead" instead of the id, and the edit-name field pre-fills blank rather than with the id.
- Root note: the id/"Property Owner" default originates in the off-repo lokazen owner app (`api/owner/auth/verify-otp`) — this is the defensive fix on PROXe's side; existing rows are corrected at display time immediately.

## 2026-07-08 · fix(lokazen): WhatsApp scout leads now classified as scout (land in Gigs, not Leads)

- A WhatsApp lead saying "interested in becoming a Lokazen Scout" was sitting in the Leads tab. Two gaps: (1) `detectLokazenAudience` required `scout` + a narrow set of context words that "becoming / interested / application / help" weren't in, so it returned null; (2) the WhatsApp/meta route never ran audience detection or stamped `user_type` at all (only the web route did) — it only recovered a stored type and otherwise persisted the generic AI-intent userType.
- Broadened scout detection to any self-referential scout mention (become/becoming/be a/want/interested/apply/application/help/… + "scout", plus "location scout", "scout application"). Still requires the word "scout" so a brand/owner mentioning "your scouts" in passing is safe.
- The meta route now classifies the incoming message (`detectLokazenAudience`) and persists `user_type`/`lead_type`. SCOUT wins even over a stale stored owner/brand ("the moment scout is mentioned, they're a scout lead"); owner/brand stay sticky. The resolved audience is also passed to the engine so the reply is locked to the right flow. The Leads/Gigs split (`unified_context.lokazen.user_type ∈ [scout,connector]`) then routes them to Gigs automatically.
- Forward-looking: existing mis-filed leads reclassify on their next inbound message; a bulk backfill of already-stored leads needs DB access (flagged).

## 2026-07-08 · fix(worker): bounce guard — stop messaging a lead whose last WhatsApp message failed to deliver

- Reference worker only (`brands/windchasers/worker/task-worker.js`); the lokazen worker is a fork-parity copy running off-repo on a host and must be redeployed to pick this up.
- Root of the "Team Lokazen — verify your listing / oops wrong chat" incident: the lead's `lokazen_lead_confirm` template had already FAILED to deliver, yet the autonomous worker still fired two free-form AI follow-ups at the same number. The worker had no check for prior delivery failure.
- Added `lastOutboundWhatsAppFailed(leadId)` + a bounce guard in `processPendingTasks`: before executing any non-voice task, if the lead's most recent outbound WhatsApp message has a CONFIRMED failure (`metadata.delivery_status==='failed'` from the Meta status webhook, or `send_succeeded===false`), the task is cancelled and the lead's other pending WhatsApp tasks are cancelled too. Only confirmed failures block — an unconfirmed "sent" never does, so normal delivery is unaffected. In the reported case the failed lead-confirm template would have blocked both follow-ups outright.
- Still outstanding (needs host access to deploy): the worker's missing audience lock (it never reads stored user_type, so it can flip owner↔brand) and its missing brand filter on the task query.

## 2026-07-08 · fix(lokazen): payment/transaction problems now go to support, not a call booking

- Live: a property OWNER messaged "my money got debited but the website shows payment failed". The chat correctly raised a support request once, then pivoted straight into a call-booking flow (date → time → email → "quick Lokazen call") and finally hallucinated "Hi Aman, your transaction was successful." The earlier scout-only fix didn't cover owners/brands.
- Generalized the support path to ALL Lokazen audiences: a new complaint-shaped `isPaymentComplaint` detector (money debited / payment failed / amount deducted / double charged / refund not received, etc. — deliberately NOT pricing questions like "what's the fee?") now, on both engine paths:
  - suppresses booking entirely (`supportEscalation` gates `needsBookingTools`/`hasBookingIntent`), so a payment problem can never become a call;
  - appends a `paymentSupportDirective` audience-agnostic system-prompt lock that forces the "I've raised a support request with the team" reply and explicitly bans claiming the payment succeeded/was reversed/fixed (kills the "transaction was successful" hallucination);
  - raises a Slack support handoff with the number + exact complaint (WhatsApp path via the existing flag block; web path now flags too, so its "I've raised a request" line is never a false claim).
- Note (not in this repo): the separate autonomous follow-up **worker** (`brands/windchasers/worker/task-worker.js`, fork-parity copy runs the lokazen worker on a host) is the source of the unprompted "verify your listing / oops wrong chat" messages — it has NO audience lock and no brand filter. Flagged for a worker-side fix + deploy; not fixed here.

## 2026-07-08 · fix(lokazen): scout chat offered calls then apologized; money complaints got brand answers

- **Scout offered a call, then "Sorry, I cannot book a call".** Booking tools were being wired for scout conversations in both engine paths (`process` and `processStream`); the tool handler then hard-refused via `scoutBookingBlock()` — but only AFTER the model had already walked the scout down the booking path, surfacing the refusal as a dumb apology. Fixed by never wiring the booking tools for scouts at all (`needsBookingTools`/`hasBookingIntent` and `lokazenBookingAction` now gate on `!isScout`), and guarding `advanceLokazenBookingAfterEmail` against scouts so a scout's "team will reach out" support line can't be rewritten into "what day/time works for a call".
- **"My money has been debited, kindly check" got a generic brand/CRE reply, no support raised.** Two gaps: (1) the `scoutSupportIssue` detector had no money/payment branch, so no Slack "Scout support request" ping fired; broadened it to catch debited/deducted/charged/refund/not-credited/amount-cut/"kindly check" (still scoped to scout audience, so brand/owner fee questions and normal payout questions like "when will I get paid" never false-trigger). (2) The system prompt carried scout GUIDANCE but never told the model which audience THIS conversation was — so it drifted into the brand flow. Added a hard per-turn `lokazenAudienceDirective` audience LOCK appended to the system prompt (scout/brand/owner), forbidding calls + brand/CRE answers for scouts and mandating the SCOUT SUPPORT reply for any problem report.
- No behavior change for Brand/Owner audiences or other brands.

## 2026-07-07 · fix(lokazen): Gigs tab "High Intent Leads" KPI always read 0

- Same class of mismatch as the "Booked Calls / Events" card above: `lead_score` is a business-lead concept and scouts never get one, so this card was permanently stuck at 0 on the Gigs tab.
- On Gigs it now shows "Engaged Scouts" — distinct scouts with a WhatsApp/social conversation in the last 7 days, reusing the already-scoped `totalConversations.count7D`/`trend7D` (no new backend metric needed). Leads tab unchanged.

## 2026-07-07 · fix(lokazen): Gigs tab "Booked Calls / Events" KPI still showed lead-booking data

- The KPI card next to Follow-up Health kept showing "Booked Calls / Events" (a business-lead metric) on the Gigs tab, since it was never converted when the rest of the tab was — same class of mismatch already flagged and fixed for the Engine Overview funnel's "Booked" node.
- Added a `kycStarted` daily trend (mirrors the existing `bookingTrend`/`leadTrend` pattern in `founder-metrics/route.ts`) bucketing scouts whose current lifecycle stage is `kycStarted` by their `last_interaction_at`/`created_at` day, plus a `kycStarted7D` total and % change vs the prior 7 days.
- On the Gigs tab this card now reads "KYC Started" with a real 7-day count, delta, and sparkline; the Leads tab is untouched.

## 2026-07-06 · fix: scout lifecycle templates still duplicating — 5-minute window wasn't enough

- Confirmed live: the same `scout_kyc_received` fired 4 times to one scout — 6:42 PM, 6:42 PM, 6:50 PM, then 7:00 AM the next day. The earlier 5-minute dedup window only blocks back-to-back retries; it does nothing when the website re-sends the same `kyc_submitted` event hours (or overnight) apart, which is what's actually happening.
- Root issue: `signup`/`kyc_received`/`kyc_approved`/`upi_saved` are **one-time lifecycle stages** — a scout reaches "KYC received" exactly once, ever. A time window is the wrong tool for a fact that never changes back. Those 4 templates now use an unbounded dedup check (any prior send to this lead, no matter how old, blocks another) instead of the 5-minute window. `submission`/`payout` stay on the 5-minute window since they're genuinely repeatable (a 2nd/3rd property submission, a later payout) — no code change needed there, `wasTemplateRecentlySent`'s existing `windowMs` parameter already supported this via `Infinity`.

## 2026-07-06 · fix: Active Conversations, its trend, and Avg Response Time were never actually scoped — real leads/gigs mixing

- Re-audited after the tab-switch UX fix and found the actual data-level bug the earlier "no cross-contamination" claim had missed: the `conversations` table query backing `messages` has **no brand or scope filter at all** — just a 45-day time cutoff. Multiple visible metrics read straight off this raw, unfiltered array: `totalConversationsCount` (the main Active Conversations KPI — its "primary" path takes precedence over the properly-scoped session-count fallback, which is essentially never used), the Avg Response Time KPI + its trend, and the Conversations Trend chart. All of them could mix leads and gigs (and in principle any other brand, since there's no brand filter on the query).
- Added one `scopedMessages` array (filtered through the same `leadIdSet` every other correctly-scoped metric already uses) and routed every metric computation through it — Active Conversations, Avg Response Time, Conversations Trend, busiest hour, channel health, response rate, hourly activity, and the recovered-leads calc all now genuinely scope-separated between Leads and Gigs.
- Also fixed two `recentActivity`/`keyEvents` sources (web/whatsapp booking events) that pushed events unconditionally instead of gating on `safeLeads`, matching every other event source in the file.

## 2026-07-06 · fix: Leads/Gigs tab switch could show the previous tab's data, mislabeled

- Traced the whole computation to confirm Leads and Gigs already use fully separate data (`safeLeads` filtered per scope, session/conversation counts gated through the same scope-filtered `leadIdSet`, cache keyed by `scope+threshold`) — no actual cross-contamination. But switching tabs didn't clear the old numbers first, so for however long the new-scope fetch takes, the PREVIOUS tab's data stayed on screen — now mislabeled under the new tab (e.g. Leads' Active Conversations count briefly showing under the Gigs label).
- Clicking a tab now shows the existing full-page loader immediately, hiding the stale data until the new scope's fetch resolves — no window where numbers from one tab can appear attributed to the other.

## 2026-07-06 · fix: delivery-tick showed a scary red "failed" icon on messages that sent fine

- `DeliveryStatusIcon` inferred a genuine send/delivery failure purely from "no delivery/read confirmation within 10 minutes." Confirmed via runtime logs (real conversation, ~8 sent replies) that Meta's status webhook doesn't reliably call back for every single message — receipts arrive periodically, sometimes batched, sometimes late — which is normal, not evidence anything failed. That false positive painted a scary red warning icon on messages that had actually sent successfully (Graph API accepted them, real message ID returned).
- Both call sites already only reach this component for messages that sent successfully (an actual send failure renders a separate, dedicated error indicator) — so the red icon was pure noise. Replaced the 10-minute timing heuristic with an explicit `failed` flag the caller derives from the real signals: `metadata.send_succeeded === false` (the send itself failed) or `metadata.delivery_status === 'failed'` (Meta's own delivery webhook reported a failure). A message with neither now correctly shows a plain "sent" tick instead of a false alarm.

## 2026-07-06 · lokazen: Gigs tab's Engine Overview shows the scout lifecycle, not the lead funnel

- Engaged/Warm/Follow-up Due/Booked don't mean anything for scouts. All 4 middle+last Engine Overview nodes now swap to the scout onboarding lifecycle on the Gigs tab: **KYC Started → KYC Done → Live (UPI added) → Active (submitting)**. "Total Leads" (slot 1) is unchanged either way.
- Server (`founder-metrics`): `gigStageCounts` mirrors the Gigs table's `SCOUT_STAGE_BY_EVENT`/`scoutStageLabel` derivation from `scout_event`/`kyc_status` EXACTLY, so the funnel and the table's STATUS column can never disagree on where a scout stands. Replaces the earlier one-off `activeGigsCount`.
- Leads tab is completely unaffected — same nodes, same data, as before.

## 2026-07-06 · fix: scout support requests could claim to Slack the team, silently do nothing

- A scout (e.g. "Monish") reported a payout problem in live chat; the AI correctly replied "I've raised a support request with the Lokazen team" — and `flagForHumanFollowup` genuinely was called (confirmed in logs) and did set the DB flag. But the actual Slack ping (`notifySlackLead`) soft-fails **completely silently** when `SLACK_WEBHOOK_URL` isn't set — no log, no warning, nothing — so it was never possible to tell from the logs whether the team was actually notified or the AI's claim was hollow.
- `flagForHumanFollowup` now checks the Slack call's result and logs the real outcome explicitly: sent, **SKIPPED (webhook not configured)**, or failed with the error — so a missing/broken Slack integration is visible immediately instead of silently assumed working.
- Still to confirm: whether `SLACK_WEBHOOK_URL` is actually set on lokazen-proxe's Vercel project — the new logging will show this the next time a scout support issue (or any "needs human" case) fires.

## 2026-07-06 · fix: extend the duplicate-send gate to EVERY outbound template

- The 5-minute dedup gate built for the scout-message duplicate bug only covered scout templates. Audited every outbound WhatsApp send in this webhook and found the same unguarded pattern on two more: **`sendPATResult`** (windchasers PAT result) and **`sendDemoConfirmation`** (windchasers demo booking) — both fire on every matching webhook call with zero protection against the site calling this endpoint twice for the same event (retry/reload/double-submit), the exact class of bug already confirmed live for scouts.
- Extracted the dedup check into a shared `wasTemplateRecentlySent()` helper and applied it to all three send paths (scout, PAT, demo) — one gate, checked the same way everywhere, instead of one-off protection per template. (The 4th send site, `lokazen_lead_confirm` for brand/owner, was checked too — it's already race-safe via the `all_leads` unique-constraint fallback, so it wasn't touched.)

## 2026-07-06 · fix: scout templates were sending duplicate WhatsApp messages

- Confirmed live: the same `scout_kyc_received` template fired **4 times to the same scout within 6 minutes** (twice at the identical minute) — the website calling the inbound webhook more than once for the same `scout_event` (reload/retry/double form-submit) had no dedup gate at all.
- Added a 5-minute dedup window: before sending, check the lead's `conversations` for the same `template_name` sent recently — skip (log only, context still persists) if found. Time-based rather than "only ever once" so genuinely repeatable events — a scout's 2nd/3rd/4th property submission, or a later payout — still send correctly; only true back-to-back duplicates get squashed.

## 2026-07-06 · lokazen: Gigs tab's Engine Overview shows "Active", not "Booked"

- The Engine Overview funnel's last node ("Booked", calendar icon) is meaningless on the Gigs tab — scouts/connectors don't book calls. Swapped it to "Active" (checkmark icon, "Submitting properties") on the Gigs tab only — count of scouts who've actually submitted a property or been paid (`scout_event` = submission/payout), the same definition the Gigs table's STATUS column already uses. Leads tab is untouched.
- `founder-metrics` gained `activeGigsCount` (0 unless `scope=gigs`), computed alongside `leadFlow` from the same `safeLeads` slice — no duplicated logic.
- Note: the top "Booked Calls / Events" KPI card has the same booking-based mismatch for gigs, but wasn't in scope for this pass — flagged for a follow-up if wanted.

## 2026-07-06 · fix: WhatsApp delivery-tick icon had no working tooltip

- The inbox's per-message delivery tick (sent/delivered/read/failed) relied on a native HTML `title` attribute for its tooltip — inconsistent across browsers, easy to miss, no visible styling. A proven custom tooltip mechanism (`template-status-tag` class + `data-tooltip` attribute, backed by real CSS with a visible dark popover) already exists in this same file for the send-failure pill, but was never applied to the tick icon itself. Both render sites (template messages + regular WhatsApp messages) now use that mechanism instead, so hovering the tick always shows a real, visible "Status: Sent / Delivered / Read by customer / Failed — &lt;reason&gt;" popover.

## 2026-07-06 · fix: "Hi Lead" greeting — the no-name fallback itself read badly

- Fixed "Hi Property" earlier by generalizing `cleanName()`, but its own fallback value — the literal string `'Lead'`, used when no real name is ever captured — reads just as badly as a greeting ("Hi Lead"). `'Lead'` is a fine placeholder for DB storage/dashboard display; it just shouldn't be spoken back to the person. All 3 firstName-for-greeting call sites (lokazen welcome, windchasers PAT result, windchasers demo confirmation) now treat that exact sentinel as no-name too and greet with "there" instead — the DB/dashboard fallback is untouched.

## 2026-07-06 · lokazen: Leads/Gigs tab on the Overview dashboard

- lokazen's Overview page now has a Leads/Gigs tab switch (next to the greeting, only visible when `features.scouts` is on). Leads = current business-lead view, unchanged. Gigs = the exact same dashboard — same cards, same layout, same components — wired to scout/connector leads instead.
- `founder-metrics` API gained a `scope=leads|gigs` param that flips the existing gig-exclusion filter to a gig-only filter. Every downstream metric (hot/engaged/warm counts, funnel, conversations via the lead-id-scoped session join, leads-needing-attention, stale leads, score distribution) derives from that one filtered list, so the Gigs tab required zero duplicated computation logic — just a different slice of the same data. Booked Calls/Events naturally reads ~0 for Gigs since scouts don't book.
- In-memory metrics cache changed from a single slot to a `scope+threshold` keyed map so the Leads tab and Gigs tab never serve each other's cached numbers.
- Non-lokazen brands are unaffected: the tab never renders, and the fetch URL / server-side filter logic is byte-identical to before when scope is omitted.

## 2026-07-06 · fix: scout template sends didn't update Last Touch; inbox missing the template's button

- Scout WhatsApp template sends never updated `last_touchpoint`/`last_interaction_at` on success — unlike the brand/owner welcome path, which already does. So a scout who'd just been messaged on WhatsApp by PROXe still showed "Web" as their last touch on the Leads table. Now mirrors the brand/owner path.
- The inbox's WhatsApp-bubble mockup never rendered the template's button — `metadata.template_buttons` (an existing, working mechanism already used for windchasers templates) was simply never populated for scout messages. Added `TEMPLATE_BUTTONS` entries for all 6 scout templates ("Open Scout Portal") and wired them into the scout message insert.
- All 6 scout templates carry a STATIC URL button (opens a link), not a quick-reply (taps send a message back) — the inbox was hardcoded to render every button as a quick-reply (reply-arrow icon, "Quick Reply: X" tooltip), which would have mislabeled it. Added a `TEMPLATE_BUTTON_TYPES` map and a URL-button variant (external-link icon, "Opens a link: X" tooltip) — shown as a label only, no href, since the actual destination is configured on Meta's side at template-approval time and isn't something we send or know for certain.
- Verified via runtime logs that Meta's delivery/read receipts ARE being processed correctly (SENT/DELIVERED/READ all logged around the exact timestamps in question) — if the inbox still shows a single tick, it's a stale/non-realtime view, not a broken pipeline.
- Note: WhatsApp does not send click webhooks for URL-type buttons (only quick-reply taps generate a message back) — button-tap analytics for "Open Scout Portal" isn't retrievable via the WhatsApp API; it would need to be tracked on the destination page itself.

## 2026-07-06 · fix: known scouts got the generic brand/owner welcome on WhatsApp

- A registered, active scout texting "Hi" on WhatsApp got the generic brand/owner welcome ("Which one can I help you with? Find a space / List my property / Talk to Lokazen team") instead of scout-appropriate handling — despite `unified_context.lokazen.user_type` already being `'scout'` on their lead record.
- Root cause: `detectLokazenAudience()` only reads the live conversation (message text, prior assistant question, buttons tapped) — it has nothing to detect on a fresh "Hi" with no history in that turn. It's only ever called from the website chat route; the WhatsApp meta webhook handler never called it and never set `AgentInput.lokazenAudience` at all, so every WhatsApp message — including from known scouts — arrived with zero audience context and fell through to the default flow.
- Fixed at the source: `handleIncomingMessage` (meta webhook) now looks up the lead's own stored `unified_context.lokazen.user_type` right after resolving the lead and passes it as `lokazenAudience` on `AgentInput`. This engages the SCOUT SUPPORT prompt logic that already existed (open, flexible handling — never a call, never the owner/brand flow, draws from the scout KB) but had never been reachable from WhatsApp.

## 2026-07-06 · fix: scout WhatsApp sends hard-failing on Meta (wrong param count)

- First real test (submitting a property as a scout) revealed every one of the 6 scout templates was built on a wrong assumption: I'd guessed each needed personalized params (name/URL/area/amount/UPI), but the real approved copy in WhatsApp Manager is **fully static** — zero `{{n}}` placeholders, just a static "Open Scout Portal" button. Meta hard-rejected the send: `scout_submission_received` got 2 params, expected 0 (`132000` error) — so scouts got nothing.
- Rebuilt all 6 template bodies verbatim from the approved previews (signup, kyc_received, kyc_approved, upi_saved, submission_received, payout_sent) with `params: []`, and changed the send call to omit the BODY component entirely when there are no params (rather than trust an empty `parameters: []` array behaves identically) — the safer, unambiguous shape for a fully static template.

## 2026-07-06 · lokazen: scout WhatsApp templates active by default (no Vercel env step)

- The 6 scout lifecycle templates (signup, kyc_received, kyc_approved, upi_saved, submission_received, payout_sent) were gated behind `LOKAZEN_ACTIVE_SCOUT_TEMPLATES` defaulting EMPTY — a leftover safety gate from when it was unconfirmed whether the website was still sending its own scout WhatsApp (double-texting risk). That's now confirmed false: the site's own scout notifications (`notifyPayoutSent` etc.) are Slack + email admin alerts only, never scout-facing WhatsApp. Hardcoded all 6 as active by default in code — PROXe now sends every scout event without any Vercel configuration. `LOKAZEN_ACTIVE_SCOUT_TEMPLATES` remains as an optional override/kill-switch, never required.

## 2026-07-06 · fix: "Property Owner" placeholder name/email leaking onto the dashboard

- **lokazen** — a lead card showed the name **"Property Owner"** and a synthetic **`owner_<phone>_<ts>@noemail.lokazen.in`** email. Root cause: the Lokazen owner app stamps `name: 'Property Owner'` on a brand-new account before the person enters their real name (`api/owner/auth/verify-otp`, `onboarding/owner`); if never updated, that literal flows straight through `sendLeadToProxe` into PROXe.
- `cleanName()` (added earlier for the "Hi Property" bug) only blocked single-word placeholders — generalized it to block a name when **every word** in it is a known placeholder token, so "Property Owner" / "Brand Owner" are caught while a real name like "Owner Smith" is untouched (verified against both cases).
- Ported a fix that existed only in the pre-migration lokazen fork and was never carried into `core`: `LeadDetailsModal`'s `displayEmail()` filter, which hides synthetic `@noemail.` / noreply / placeholder addresses instead of showing them as the lead's contact email. Also fixed the "No contact info" empty-state check to agree with it (previously a lead with only a synthetic email showed neither the email row nor the empty-state message).

## 2026-07-05 · fix: dashboard loading screen cropped into a corner (min-h-screen → fixed inset-0)

- **all brands** — `FounderDashboard`'s `if (loading)` overlay and the dev-only auth loader in `DashboardLayout` used `min-h-screen`, which sizes relative to their PARENT (the sidebar-offset main-content container, itself nested inside padded wrapper divs) — not the actual viewport. Any ancestor padding/margin could push the "centered" box down/sideways, cropping it into a corner with a visible seam against the sidebar. `PageTransitionLoader` already used the correct pattern (`fixed inset-0`, viewport-anchored, immune to parent layout) — applied the same fix to the other two so all three full-screen loaders now render identically and always cover the true viewport.

## 2026-07-05 · fix: light-theme FOUC flash on load + wrong-name greeting ("Hi Property")

- **all brands** — `globals.css` `:root` held the LIGHT theme's colours (`--bg-primary: #f6f6f6`), even though the app's actual default theme is dark (`bw-dark`, set by the `theme-init` script). CSS custom properties resolve as soon as the stylesheet parses — before any JS runs — so anything painting off `--bg-primary` (e.g. a full-screen loader) could flash the light background for a moment before the `.dark` class landed, producing a visible white/cream patch behind the dark loading box. Swapped the defaults: `:root` now holds the dark values (matching the real default), and light mode moved to an explicit new `.light` class with the old light values unchanged. Verified: `--bg-primary` now resolves dark even with zero classes on `<html>`.
- **lokazen** — inbound leads/scouts arriving with a placeholder/category value in the name field (seen: `"Property"`) were greeted by name in outbound WhatsApp templates ("Hi Property, ...") and could get that value persisted as the lead's `customer_name`. Added a `cleanName()` guard (blocklist: property/owner/brand/scout/connector/lead/customer/test/n-a/none/unknown/undefined/null, case-insensitive) applied everywhere a name is read from the inbound payload — falls through to the existing 'Lead' default instead of echoing the placeholder.

## 2026-07-05 · lokazen: point scout drip at the real approved template names + WABA pull override

- **lokazen** — the scout lifecycle sender (`agent/leads/inbound`) had placeholder template names (`scout_welcome`, `scout_kyc_submitted`, `scout_kyc_verified`, `scout_upi_added`, `scout_payout`). Repointed to the **actually-approved** names on Lokazen's WABA: `scout_signup`, `scout_kyc_received`, `scout_kyc_approved`, `scout_upi_saved`, `scout_submission_received`, `scout_payout_sent`. Added `SCOUT_EVENT_ALIASES` so the website's `scout_event` vocabulary normalises onto the canonical keys regardless of drift. **Not yet enabled** — `LOKAZEN_ACTIVE_SCOUT_TEMPLATES` still default-empty; params must be verified against each live template body first (a param-count mismatch hard-fails at Meta).
- **infra** — `GET /api/whatsapp/templates?waba=<WABA_ID>` now accepts a manual WABA override (auto-discovery returns empty for lokazen's system-user token), so template definitions can be pulled on demand.

## 2026-07-05 · lokazen: transparent loading logo (drop the square .jpg box) + brand-colour loader glow

- **lokazen** — the dashboard loading screen + page-transition loader showed the square `lokazen-icon.jpg` (JPGs have no transparency → a visible box). Added a `markPath` brand-config field (transparent logo for loaders, defaults to `iconPath`) and set lokazen's to `/lokazen-mark.svg` (transparent 3-orb). `iconPath` is unchanged so the favicon stays correct. Both `FounderDashboard` and `PageTransitionLoader` now use `markPath || iconPath`.
- **all brands** — the three full-screen loaders (auth "Checking authentication…", dashboard "Loading…", page transition) had a hardcoded purple glow (`--accent-primary` = `#8B5CF6`, the pre-hydration default). The auth loader also still used the square avatar. Now all three pulse the **brand's own primary** (`colors.primary`, falling back to the CSS var) and the auth loader uses the transparent `markPath`. lokazen's loaders read orange instead of purple.
- **all brands** — fixed the auth loader's off-centre "sideways" pulse: its ping was `absolute inset-0` inside a full-width container with a stray `left:50% / translateX`, so it anchored to the whole row. Now the container is an 80px centred box (matching the other two loaders), so the pulse is concentric with the logo.

## 2026-07-05 · lokazen: Connector as a second Gig type (dashboard support)

- **lokazen** — the Gigs segment now spans two worker types: **Scout + Connector**. Dashboard support added: `GIG_TYPES = ['scout','connector']`; the Gigs page (`/dashboard/scouts`) now filters to the **'gig' umbrella** (scout OR connector) instead of scout-only; new **Connector** type chip (emerald tint) + a **Connectors** filter option; and connectors are excluded from sales-Lead counts everywhere scouts are (Overview/founder-metrics, Today snapshot, Pipeline kanban, PipelineFunnel, and the general Leads view).
- NOTE: intake/classification does not yet tag anyone as `connector` (audience detection is brand/owner/scout only), so no Connector rows appear until the capture side is wired. This commit is the dashboard scaffolding.

## 2026-07-05 · lokazen: "Gigs" segment (nav/label/chip) + scouts excluded from lead counts; scrub passwords from docs

- **lokazen** — Scout segment surfaces as **"Gigs"** (umbrella): nav item renamed via a shared `navLabel` helper (pop's Leads→People preserved), Gigs page title, and the nav entry moved directly under **Pipeline** (above Events). Nav icon changed bike → handshake (`MdHandshake`). Per-lead **type chip stays "Scout"** (Scout is a type under Gigs; Connector reserved for later) and was restyled from a big solid pill to a small tinted chip.
- **lokazen** — Scouts (Gigs) are no longer counted as sales **Leads**: excluded `user_type === 'scout'` from Overview totals + stage buckets (`founder-metrics`), Today snapshot, the Pipeline kanban, and `PipelineFunnel` counts. Gated by `features.scouts`, so other brands are unaffected. (The Leads table already excluded them.)
- **security** — removed plaintext admin passwords from committed docs (`proxe/docs/SETUP_GUIDE.md` + `Dashboard.md`: `proxepass`; `windchasers/docs/CREATE_LOGIN_USER.md` + `TROUBLESHOOTING_LOGIN.md`: `Wind#826991`) → placeholders. NOTE: same secrets still live in ~16 seed scripts and in git history; rotate `Wind#826991` (a real Google login) regardless.

## 2026-07-05 · deploy: Supabase env name bridge (unblock Vercel go-live)

- `next.config` now inlines the generic `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` from the active brand's OWN value — generic first, else this brand's fork-era prefixed name (`NEXT_PUBLIC_<BRAND>_SUPABASE_*`). Lets each per-brand Vercel project build `/core` against ITS OWN database with the env vars already present (no rename, no secret re-entry). Each brand → its own Supabase; nothing shared. Verified: core-as-bcon boots + Supabase client initializes; fallback resolves to bcon's DB when the generic is absent (Vercel case).
- Still required per project to actually deploy: remove the fork-era Ignored Build Step (it cancels every one-core build), set Root Directory → `core`, add `BRAND_ID`. `SUPABASE_SERVICE_ROLE_KEY` is read generically and must be valid (bcon-proxe's shows "Needs Attention").

## 2026-07-05 · one-core → main + pop ElevenLabs telephony A/B

- **one-core is now `main`** — the single `/core` app (brand = data, selected by `BRAND_ID`) is the source of truth for all 5 brands. Old `brands/*/agent` forks kept in-tree until each brand's Vercel project is cut over (Root Directory → `core` + `BRAND_ID` + secrets per `DEPLOY.md`).
- **Vapi ↔ ElevenLabs engine toggle** (`pop`): the POP call form can dial the same Vobiz number (`+918046733388`) via the existing Vapi pipeline OR a fully-native ElevenLabs agent ("Grievance PUNJAB"), which originates over the same Vobiz trunk via a dedicated `elevenlabs-pop` SIP credential (isolated from Vapi). `test-call` route dispatches by engine.
- **Calls list cleanup** (`vapi-sync`): skips `webCall` type (Vapi dashboard browser tests) — only real inbound/outbound phone calls sync. Stale web-test rows purged.
- **Voice call panel redesign** (`VoiceAgentTab`): removed "Call myself" → single Call button; rebuilt live-call status (pulsing dot + label + mm:ss timer + ended state); cleaned the engine toggle.
- User-facing: POP operators get a cleaner call panel with a live ringing→connected→ended readout and a Vapi/ElevenLabs switch.

## 2026-07-03 · lokazen — scout lifecycle stages (no follow-up sequences)

- **Scout STAGE column** (`LeadsTable`): scouts no longer show a generic lead stage ("In Sequence"). The Scouts view now derives each scout's real lifecycle stage from the latest `scout_event` PROXe received: Logged in → KYC started → KYC done → UPI added → Submitting photos → Active (purple badge). Brand/owner rows unchanged.
- **No follow-up sequence for scouts** (`inbound/route.ts`): scout leads no longer queue a `first_outreach` / sequence task — they run their own lifecycle drip (signup/KYC/submission/payout via scout_event templates), not the brand/owner follow-up sequence.
- Next: a scout funnel counts strip ("how many at each stage / how many KYC-done") on the Scouts page — offered, not yet built.

## 2026-07-03 · lokazen — scouts never book calls; scout problems become support requests

- **Hard no-booking for scouts** (`engine.ts`): both booking tools (`check_availability`, `book_consultation`) hard-refuse when the audience is scout — the model cannot book a call for a scout even if it tries. Deterministic backstop to the prompt rule.
- **Scout problems → support request + Slack ping** (`engine.ts`): a deterministic detector fires when a SCOUT reports an app/upload/KYC/payout/location/photo problem, calling `flagForHumanFollowup` → the team gets a Slack alert titled "Scout support request" with the number + the issue. Scoped to scout audience so a brand/owner saying "photo"/"location" is never caught.
- **Prompt** (`lokazen-prompt.ts`): new SCOUT SUPPORT section — never a call; never read a scout's photo/location as owner property data; if unsure ask exactly one question ("looking for space, or a Scout facing an issue?"); raise a support request and confirm it's logged with their number.

## 2026-07-03 · lokazen — fix "Meta Form" mislabel + last-touch after WA send

- **Inbox form card** (`app/dashboard/inbox/page.tsx`, shared file): the form-submission card hardcoded "Meta Form Submission" / "Meta Form" — wrong for a web-form lead. Now the label DERIVES from the actual channel/first_touchpoint: Meta/Facebook leads still read "Meta Form", everything else reads "Form Submission" / "Form". (Universally correct; Meta leads unaffected.)
- **Last touch after outbound WA** (`inbound/route.ts`): sending the `lokazen_lead_confirm` / owner-brand welcome template now updates `last_touchpoint='whatsapp'` + `last_interaction_at`, so the lead card/list stops showing "web" as the last touch after we've messaged them on WhatsApp. `first_touchpoint` stays the origin.
- **Note**: the lead type-override row removal (`f017e79`) was the "breaking modal" — confirmed removed; deploy pending when the screenshots were taken.

## 2026-07-03 · lokazen — declutter the lead detail card

- **Lead modal** (`LeadDetailsModal`): removed the Brand / Property Owner / Scout type-override row (not needed right now; the `set-type` API stays for later). Hid the synthetic `owner_<phone>_<ts>@noemail.lokazen.in` placeholder email — it's an internal id, not a contact, so it no longer shows as the lead's email (new `displayEmail()` filter).
- **Property photos** (`LokazenPropertyGallery`): replaced the inline thumbnail strip with a single compact cover thumbnail (with a +N badge for extras) that opens the full-screen lightbox on click — keeps the card uncluttered. "View listing" link + the collapsible "Property listing" brief unchanged (both confirmed working).

## 2026-07-03 · lokazen — branded Slack alerts (PROXe logo, header, colour stripe)

- **slackNotifier** — Slack App webhooks ignore per-message avatar/name overrides, so the branding now lives in the message body: a header block, a top context row with the PROXe logo (public PNG `proxe.lokazen.in/logo.png`) + "PROXe · Lokazen", and a brand-colour left stripe via a wrapping attachment. Colour + logo URL are env-overridable (`SLACK_BRAND_COLOR` default `#E4002B` to match the red logo, `SLACK_LOGO_URL`). Wording tightened: the lead's requirement fields show first, dropped the internal Score field and the redundant "Lokazen · PROXe" footer. Applies to New lead / Needs-human / Booking alerts. (Sender avatar itself is set on the Slack app's Display Information.)
- **Still open**: scouts currently post as a bare "New lead" (no name/type at signup) — recommend suppressing scouts from #lokazen-proxe (separate change, not in this push).

## 2026-07-03 · lokazen — PROXe owns the FULL scout drip (all 6 touchpoints)

- **Decision**: after mapping the live website, found it already runs its own Meta-approved scout WhatsApp drip (welcome / kyc_submitted / kyc_verified / upi_added). User chose PROXe should take over ALL scout sending (not just the gaps), plus add the 2 touchpoints nobody messages today (submission-received, payout).
- **inbound** — reworked the scout sender to handle every `scout_event`: `signup / kyc_submitted / kyc_verified / upi_added / submission / payout`. Templates 1-4 REUSE the exact names + param order the site already had approved (`scout_welcome`, `scout_kyc_submitted`, `scout_kyc_verified`, `scout_upi_added`) with the site's exact body copy mirrored in the conversation log; 5-6 (`scout_submission_received`, `scout_payout`) are new. Scouts no longer flow through the brand/owner `lokazen_lead_confirm` welcome. Captures `scout_url` (deep-link the site forwards) + `scout_upi_id` so message links land on the right page.
- **Opt-in / cutover-safe**: every scout template stays gated behind `LOKAZEN_ACTIVE_SCOUT_TEMPLATES` (DEFAULT EMPTY). During the site→PROXe cutover an event persists context WITHOUT sending until its template is confirmed live on PROXe's WABA and added to the env — no double-texting, no failed-send spam.
- **BLOCKED on**: (1) confirm PROXe-lokazen's WhatsApp number/WABA is the same as the site's (+91 6366826978) — decides reuse vs recreate of the 4 templates; (2) create the 2 new templates; (3) frontend edits (remove the 5 site `sendScout*` calls + forward each event via `sendLeadToProxe`).

## 2026-07-03 · lokazen — PROXe takes ownership of the scout lifecycle

- **Root-cause the "scouts messing up" bug** — the scout-page origin already flows end-to-end (embed.js sees `/scout` → `page_context=lokazen_scout` → the chat route resolves `pageAudience='scout'`), but `buildLokazenContextPatch` re-guessed the lead type from message content and ignored it. A scout typing "empty shop / rent / space" got persisted as brand/owner and leaked into the Leads view. Fixed: scout page-origin is now authoritative — threaded `pageAudience` through `updateLokazenLeadContext` → `buildLokazenContextPatch`; when origin is scout, force `user_type/lead_type=scout`, skip brand/owner flow-field capture, never let the text-chain flip it. (`a853c26`)
- **Manual lead-type override** — new `POST /api/dashboard/leads/[id]/set-type` (auth-gated; writes only `unified_context.lokazen` + an admin note, so it works before the activities/agent_tasks migration) + a 3-button Type selector (Brand / Property Owner / Scout) in the lead modal, shown for any lokazen lead. Moving a lead to Scout drops it out of the Leads view. (`62b1ca9`)
- **Widget** — plan overview now renders the cards ONLY; the flat "01 Choose Plan / 02 Get Matched…" roadmap no longer prints above them (it duplicated the cards and read like an unclickable button). (`3c4ca6c`)
- **Inbound webhook now owns scout messaging** — `app/api/agent/leads/inbound/route.ts`: classify scout deterministically (`user_type='scout'` / source contains "scout") and capture a `scout_event` + scout fields (area, kyc_status, submission area, payout amount). New scout-lifecycle sender fires the matching WhatsApp template per event (kyc_reminder / kyc_approved / submission / payout); the new-lead welcome no longer fires on a lifecycle step. Templates are gated by an ACTIVE allowlist (`LOKAZEN_ACTIVE_SCOUT_TEMPLATES`, default `scout_welcome`) so events whose Meta template isn't approved yet persist context without spamming failed sends — add the name once approved, no redeploy. User-facing: scouts get a real per-touchpoint message journey once the website forwards events and Meta approves the 4 new templates.

## 2026-07-02 · lokazen — catch scout intent that doesn't tap the Scout button

- **Audit**: pulled the last 20 leads + their messages. ~half are correctly-tagged scouts (already filtered out of the Leads view). The pollution is untagged `(none)` leads — some are scouts who asked scout-type things ("how long to get verified", "how much do I earn per property") without tapping the Scout button, so they stayed untyped and showed in the brand Leads view. Also spotted: WhatsApp business auto-replies ("We're unavailable right now") logged as customer messages, and one brand mis-tagged as owner (Gaurav).
- **agent-core** — `lib/agent-core/lokazenAudience.ts`: added a `scoutPhrase` signal that recognises gig-worker scout intent WITHOUT the word "scout" — To-Let boards, empty/vacant shops, verification-to-get-paid, per-listing earnings, UPI/payout, spotting/photographing a shop. Brand + owner intent is still matched FIRST, so a space-seeker or landlord using one of these words isn't misread. Verified with 11 cases (5 scout-intent → scout; brand/owner/free-text → unchanged). Since WhatsApp now persists the detected audience, these leads will tag as scout and drop out of the brand Leads view into Scouts.

## 2026-07-02 · lokazen — chat conversation on Sonnet 5 (helpers stay Haiku, thinking off)

- **lokazen** — `lib/agent-core/claudeClient.ts` + `engine.ts`: the actual conversation now runs on **Sonnet 5** (the part that needs reasoning), while the cheap helpers stay on Haiku to keep token spend down. Added `getReasoningModel()` (default `claude-sonnet-5`, override `CLAUDE_MODEL_REASONING`); wired it into `streamResponse` (web SSE), `generateResponseWithTools` (booking), and the non-booking `generateResponse` chat calls. Left on Haiku: summaries (`summarizer`), quick-reply buttons (`generateShort`), profile extraction (`conversationIntelligence`), and screenshot vision. Disabled adaptive thinking (`thinking:{type:'disabled'}`) on every conversation call — Sonnet 5 otherwise turns it on and burns 3-10x output tokens. System prompt stays prompt-cached, so input cost is low after the first turn. Keep `CLAUDE_MODEL` unset (helpers → Haiku); `CLAUDE_MODEL_REASONING` controls the chat model.

## 2026-07-02 · lokazen — fix chat detail extraction (misfiled answers) + fire Slack on chat leads

- **lokazen** — `app/api/agent/web/chat/route.ts` buildLokazenContextPatch: chat answers were mis-filed — the capture matched the previous QUESTION text, but the wording drifted ("What size are you looking for?" vs the code's `'what size range'`), and history lag put the timeline answer in budget, the plan answer in timeline, and dropped size entirely (seen on the "Dico Jalli" lead). Added deterministic capture off the exact quick-reply LABEL the user tapped (size/budget/timeline/zone/type/floor → the right brand OR owner field), which is unambiguous. The old question-text chain now only runs for free-text answers (guarded by `!capturedFlowField`) so it can't clobber the correct captures; also fixed `'what size range'`→`'what size'` for typed sizes. Verified against the exact screenshot flow — every answer lands in its field.
- **lokazen** — SAME file: chat leads never fired a Slack notification (web chat creates leads via updateLeadProfile, not ensureOrUpdateLead where the hook lives). Added a one-time "New lead" Slack notify in the lokazen-context update — fires as soon as the lead has an identity (name/phone/email), with the captured Brand/Property detailFields, and sets `_slack_notified` so it never repeats. No-op unless SLACK_WEBHOOK_URL is set (still needs to be added to the lokazen-proxe Vercel env for prod).

## 2026-07-02 · lokazen — full form audit: map all action-form details + property photo gallery

- **Audit**: tested all 11 lead forms end-to-end into the PROXe inbound webhook (brand onboard, owner onboard, public-submit, hyderabad, natura, palace, site-visit, expert-connect, contact-team, requirements, meta-ad). All insert OK + user_type resolves. The two main onboarding forms + mall enquiries were already fully mapped; the ACTION forms only resolved type and dropped their specifics into raw_form_fields.
- **lokazen** — `app/api/agent/leads/inbound/route.ts`: added a "common CRE extras" block (all changes PROXe-side; frontend already forwards these). Now maps: `property_id` (links lead → listing), site-visit `property_title`/`preferred_visit_at` + `requested_action=site_visit`, expert `schedule_datetime` + `requested_action=expert_call`, `requirement_notes` (contact-team/search free-text), `best_time`, owner `possession_date→availability_date`/`property_status`/`cafe_format`/`venue`. Verified: every action form now surfaces its real details.
- **lokazen** — images: owner photos live on lokazen.in (Loka Supabase, stored as base64 data-URIs — NOT forwarded to PROXe, and NOT changing the frontend). New same-origin media proxy `app/api/dashboard/leads/property-media/route.ts` lazy-fetches a listing's photos by property_id from Loka's PUBLIC `/api/properties/[id]` (no creds, base64+http, size-capped). New `components/dashboard/LokazenPropertyGallery.tsx` renders a thumbnail strip + full-screen lightbox (prev/next) + "View listing" link in the lead detail, shown whenever the lead has a property_id. Verified end-to-end against a real listing (prop-181, 3 photos).

## 2026-07-02 · lokazen — plan cards click out to the landing page; no repeat details, no stray chips, no step-narration

- **lokazen** — `LokazenPlanCards.tsx`: "Choose <plan>" now opens the plan's landing page in a new tab (per-plan `url` on the plan data; PLACEHOLDERS currently `lokazen.in/for-brands?plan=<x>#plans` — user to supply the final checkout links) and no longer sends a chat message, so the plan detail step never repeats after the cards.
- **lokazen** — `ChatWidget.tsx`: the stray "Starter/Professional/Premium" chips under the cards came from TWO leaks: (1) a pre-existing hack that force-injects plan chips when the "how we work" message still shows a stale timeline rail — now gated off when the cards are anchored; (2) the followUps "safety net" effect re-applied the RAW unfiltered followUps after the main handler had stripped them — it now applies the same plan filtering.
- **agent-core** — `engine.ts` cleanResponse: internal-narration leak guard — strips lines like 'User selected "Immediately". moving to Step 8.' and bare `--` separators (seen verbatim in prod). Prompt also gains a NEVER NARRATE FLOW MECHANICS rule. Sanitizer verified against the exact leaked transcript; served widget chunk HTTP-verified to carry the click-out code (preview-tab cache was masking it; prod chunks are content-hashed).

## 2026-07-02 · agent-core — booking flow no longer dies on an empty tool-loop reply

- **agent-core (web)** — `engine.ts` processStream booking path: clicking "Start this plan" produced NOTHING — prod logs show the model spent its turn on tool calls (update_lead_profile, selected_plan captured) and returned no visible text (or [BTN:]-only text), so the widget rendered an empty bubble and the flow died. Added an EMPTY-RESPONSE GUARD after the tool loop: if the reply has no visible text once [BTN:] markers are stripped, substitute the deterministic next booking question (ask name+contact → ask contact → ask day/time, based on what's already known). The flow now always moves forward.

## 2026-07-02 · lokazen — plan cards now trigger off the BUTTONS, not the text

- **lokazen** — `components/widget/ChatWidget.tsx`: live test showed the plan message paraphrased by the LLM ("Perfect. Here's how we work: shortlist properties, guided visits...") — no "Tap a plan to see what's included", so the text-based card trigger missed and the plans fell through as flat text buttons. The cards now anchor off the plan BUTTONS the agent deterministically emits (≥2 of Starter/Professional/Premium in message.followUps → set that message as the plan-cards anchor + suppress the redundant text buttons). Text patterns kept as fallback. Single-plan detail unchanged (its "Starter - Rs" header is prompt-mandated); if it's ever paraphrased, text buttons remain as a graceful fallback.

## 2026-07-02 · lokazen — chat size/budget calibrated to real inventory + market guardrail

- **Data first**: profiled the live Lokazen CRE database (Supabase `pasuywntzuyomkwfagep`, `properties` table, 164 rows / 155 usable): median listing 1,000 sqft at Rs 1.8L/mo, median Rs 186/sqft (p25 Rs 103 / p75 Rs 289); under Rs 50k = ~1% of stock; Rs 1L-5L = 61%. Restaurant median 850 sqft @ 1.5L; retail 1,650 sqft @ 2.6L. Top areas: Koramangala, Indiranagar, HSR, Jayanagar, Whitefield, Sarjapur Rd.
- **lokazen** — `configs/prompts/lokazen-prompt.ts`: budget buttons were anchored at "Under 50k / 50k-1.5L / Above 1.5L" (off-market). Now "Under 1L / 1L-2.5L / Above 2.5L" in both brand-budget and owner-rent steps; size buttons retuned to "Under 600 / 600-1500 / 1500+". Added a MARKET CONTEXT section (rates + typical listing + top areas from the live data) with an EXPECTATION RULE: on a clear size/budget mismatch (e.g. 1,500 sqft under 50k → really ~2.5L+), reply with one warm reality-check line and ask which side to adjust — never silently accept, never reject.
- **lokazen** — `lib/agent-core/followUpGenerator.ts`: the deterministic fallback buttons had the same stale buckets; synced to the new ones.
- **frontend (C:/Users/user/Lokazen, separate deploy)** — BrandOnboardingForm rent placeholders re-anchored: "Min e.g. 1,00,000 / Max e.g. 2,50,000" (was 50,000/1,50,000). Size placeholders (800/2,000) already match the data.

## 2026-07-02 · lokazen — plans shown as rich cards in the widget (not flat text)

- **lokazen** — new `components/widget/LokazenPlanCards.tsx` + wiring in `ChatWidget.tsx`: the "how we work / choose a plan" message and each single-plan detail were flat walls of text with no emotion. Now the web widget renders them as brand-orange plan cards mirroring lokazen.in/for-brands#plans — overview shows all three (Starter ₹4,999 / Professional ₹9,999 "Most Popular" / Premium ₹19,999) with features + Choose buttons; picking one renders a focused card with Start-this-plan / Talk-to-the-team CTAs. Detection is off the existing scripted text ("tap a plan to see what's included" and the "Starter - Rs" detail header) so nothing leaks to WhatsApp, which keeps its [BTN:] buttons. Redundant plan text-buttons are suppressed on web (cards provide the actions). Verified in the preview widget (both modes, orange highlight, correct button hierarchy). Plan data is a plain array, ready to lift to brand config for reuse across brands.

## 2026-07-02 · lokazen — activity-focused summary + drop generic Buying Signals (CRE fit)

- **lokazen** — `app/api/dashboard/leads/[id]/summary/route.ts`: the lead summary restated the requirement ("Captured CRE details: Size 1000-2000; Budget 300000...") even for a pure form-fill with no conversation. Rewrote it to describe what's HAPPENING, not what the lead is: form-fills (no customer messages) get "New brand enquiry captured via the website form. No conversation yet. Next step is first outreach."; leads with an actual back-and-forth get the conversation status. No size/budget technicals (those live in the CRE requirement card).
- **lokazen** — `components/dashboard/LeadDetailsModal.tsx`: hid the generic "Buying Signals" block (Budget / Interest / Pain point) for ALL Lokazen leads. It mis-framed CRE data — Interest showed the user_type ("brand") and Pain point showed the target location. Commercial real estate isn't a generic sales funnel; the real requirement already shows in the dedicated CRE card. (Previously only hidden for scouts.) Regenerated the existing form leads' summaries to the new format.

## 2026-07-02 · lokazen — send first-outreach WhatsApp template on new form leads

- **lokazen** — `app/api/agent/leads/inbound/route.ts`: NO WhatsApp was going out on new form/website leads — the generic send was disabled (Windchasers leftover) and the only sends were WC-specific PAT/demo. But Meta DOES have approved Lokazen templates on this WABA (`lokazen_lead_confirm`, `lokazen_brand_welcome`, `lokazen_owner_confirm`, `scout_welcome`, scout KYC lifecycle). Wired the send: on a new lokazen lead, send `lokazen_lead_confirm` (POSITIONAL {{1}}=first name) for brand/owner, `scout_welcome` ({{1}}=name, {{2}}=portal URL) for scouts. Awaited + soft-fail + logged to conversations (inbox reflects it), needs_human on failure. Used only clean POSITIONAL templates — brand/owner welcome templates are NAMED-param with no example, so lead_confirm is the safe universal confirm. Verified live: a real `lokazen_lead_confirm` send to the test number was accepted by Meta (messageId returned).

## 2026-07-02 · lokazen — WhatsApp scout leads now tagged (out of Leads, into Scouts)

- **agent-core** — `app/api/agent/whatsapp/meta/route.ts`: WhatsApp detected the Lokazen audience only for KB scoping and NEVER persisted it, so a clearly-scout WhatsApp lead had `unified_context.lokazen = {}` and kept showing in the general Leads view. Now reads the stored type as a sticky fallback and PERSISTS a newly-detected audience (user_type/lead_type) to the lead — so the LeadsTable filter routes scouts into the Scouts page.
- **agent-core** — `lib/agent-core/lokazenAudience.ts`: broadened scout detection so plain user phrasing classifies correctly ("help with my Lokazen Scout account", "the scout app", "as a scout") — requires the word "scout" + an intent token (account/app/kyc/payout/join/spot/verify/earn) so a brand/owner passing mention is safe. Scout flow is also sticky via the agent's own replies ("scout app"/"scouts spot"). Verified against the live shambu-das transcript. Also tagged that existing lead scout in the DB so it moves now.

## 2026-07-02 · lokazen — full CRE detail passthrough (owner deposit/amenities/maps, brand target audience)

- **lokazen** — `app/api/agent/leads/inbound/route.ts`: extended the onboarding mapping after inspecting the live lokazen.in sender (`src/lib/proxe-lead.ts` + onboarding/owner routes). Owner now also maps `deposit`, `google_maps_url` (from google_maps_link); brand maps `target_audience`. Confirmed the sender's `x-api-key` = `lk_inbound_...` and set the same `INBOUND_API_KEY` locally so inbound auth is verifiable. Tested BOTH exact frontend payloads (seeker + owner) end-to-end with the real key — every CRE field maps into unified_context.lokazen and a Slack "New lead" alert fires. NOTE: matching frontend enrichment (forwarding deposit/amenities/maps for owner, additionalRequirements for brand) was made in the separate lokazen.in app (C:/Users/user/Lokazen, not this repo) — user deploys that.

## 2026-07-02 · slack — cleaner professional formatting (bold/italics, no emoji)

- **services + callers** — replaced the emoji-per-field Block Kit with a clean, professional style per user feedback ("don't make it childish"): a bold title line (`*New lead* · _Lokazen_`), the lead/booking subject in *bold* with the type in _italics_, bold-label 2-column fields (no emoji), and an italic context footer. `notifySlackLead`/`notifySlackBooking` API: `headline` → plain `title`; detail field labels de-emojied (Brand/Category/Areas/Format/Size/Budget/Outlets · Property type/Size/Area/Rent/Floor). Verified live (HTTP 200).

## 2026-07-02 · slack — every message richly formatted (Block Kit, no walls of text)

- **services** — `lib/services/slackNotifier.ts` rewritten so every notification is structured Block Kit: header → divider → 2-column contact fields (emoji labels) → divider → structured detail fields → context footer. Added `fieldsSection`/`mrkdwnField` helpers, whitespace-collapsing `clean()`, summary truncation (quote block, capped), and a `detailFields`/`footer` API on `notifySlackLead`. No more joined "·" lines or raw text dumps.
- **callers** — inbound webhook now passes the Brand/Property details as structured `detailFields` (🏢 Brand / 🍽️ Category / 📍 Areas / 🏬 Format / 📐 Size / 💰 Budget / 🔢 Outlets, or 🏠 Type / 📐 Size / 📍 Area / 💰 Rent / 🪜 Floor for owners) instead of a joined string; leadManager + engine needs-human calls get consistent headers + footers. Verified live: a rich Brand new-lead posted to #lokazen-proxe (HTTP 200).

## 2026-07-02 · lokazen — onboarding mapping uses the REAL website field keys

- **lokazen** — `app/api/agent/leads/inbound/route.ts`: the first mapping pass guessed the onboarding-form component key names, but a real form lead (Blue Tokai) revealed the actual webhook payload uses different keys: `user_type: "seeker"|"provider"`, `space_type`, `area_sqft`, `budget_rent`, `business_type`, `location_preference`, `current_outlets`. Updated the mapping to read these as PRIMARY aliases (kept the old ones as fallbacks). Now brand leads populate brand_category (from business_type), target_zones (location_preference), preferred_format (space_type), required_size_sqft (area_sqft), budget_monthly_rent (budget_rent); owners mirror with property_type/property_size_sqft/property_zone/asking_rent_monthly. `asType` maps seeker→brand, provider→owner. Verified end-to-end against the exact Blue Tokai payload — all 6 detail fields now map (were blank before).

## 2026-07-02 · slack — wire new-lead + needs-human alerts (all triggers live)

- **lokazen** — `app/api/agent/leads/inbound/route.ts`: fires `notifySlackLead` ("🆕 New Lead") for every genuinely new inbound/form lead, with a detail line surfacing the captured Brand/Property fields (brand+category+areas+size+budget, or property type+size+area+rent). Verified end-to-end against a local capture server.
- **agent-core** — `lib/services/leadManager.ts`: fires the same "🆕 New Lead" alert on chat/channel-originated new leads (single creator chokepoint), so both chat and form leads notify.
- **agent-core** — `engine.ts` `flagForHumanFollowup`: fires `notifySlackLead` ("🚨 Needs human follow-up") whenever a lead is flagged for a human (AI generation failed, hallucinated booking, customer asked for a human, template send failed). All soft-fail + gated on `SLACK_WEBHOOK_URL`.

## 2026-07-02 · services — Slack notifier + booking notification (Incoming Webhook)

- **services (all brands)** — new `lib/services/slackNotifier.ts`: one-way Slack notifications via an Incoming Webhook (`SLACK_WEBHOOK_URL`). No bot/token/scopes. `sendSlackMessage`, `notifySlackBooking` (rich Block Kit: name/phone/email/type/when/channel + topic + summary), `notifySlackLead` (hot-lead alert). Soft-fails everywhere: no `SLACK_WEBHOOK_URL` = no-op, and a Slack outage never blocks a booking/lead. Gated on per-deployment env, so only the brand whose Vercel project has the URL posts (no cross-brand leakage despite the shared module).
- **agent-core** — `engine.ts` `book_consultation`: fires `notifySlackBooking` right after the booking is stored (awaited inside the handler so Vercel doesn't drop it; soft-fails). Lead type from the resolved Lokazen audience (Brand / Property Owner). Wire format verified end-to-end against a local echo server. Lead-crisis alert (`notifySlackLead`) is built but not yet wired pending trigger definition.

## 2026-07-02 · lokazen — onboarding leads: map Brand/Property details + stop the constraint drop

- **lokazen** — `app/api/agent/leads/inbound/route.ts`: added Brand Onboarding + Property Owner Onboarding field mapping. The webhook had NO lokazen mapping (only windchasers/PAT), so onboarding details landed in `raw_form_fields` and the dashboard PROPERTY TYPE / SIZE / zone columns (which read `unified_context.lokazen.*`) stayed blank. Now maps the form's own keys + aliases: owner → property_type/property_size_sqft/property_zone/asking_rent_monthly/floor/frontage_ft/amenities/availability_date; brand → brand_name/brand_category/current_outlets/target_zones/required_size_sqft (min-max)/budget_monthly_rent (min-max). Audience (brand vs owner) resolved from an explicit type field, then form_type/source, then field presence. Verified end-to-end via simulated POSTs.
- **lokazen** — SAME file: the `all_leads.first_touchpoint` CHECK constraint on the lokazen DB only permits `web/whatsapp/voice/social`, so any `form`/`meta_forms`/`ads`/`manual` source (i.e. every onboarding + ad lead) FAILED the insert and the lead was lost — a real "leads not coming in" cause. Now coerce the stored touchpoint to `web` for lokazen when the mapped source isn't in the allowed set; the true source is preserved in `unified_context.lead_sources` + attribution. Verified: a `property_onboarding` POST that previously 500'd now inserts and maps correctly. (Clean long-term fix = widen the DB constraint; this unblocks without a migration.)

## 2026-07-02 · widget — chat bubble suppressed on internal/admin pages (front-end visitors only)

- **widget embed (all brands)** — `app/api/widget/embed.js/route.ts`: the injected PROXe chat bubble was appearing on internal/logged-in pages of host sites (admin, dashboards, auth, the scout portal/KYC/submit app, etc.). Added a path guard that self-suppresses the widget on internal route prefixes (`/admin`, `/dashboard`, `/auth`, `/login`, `/signin`, `/signup`, `/onboarding`, `/profile`, `/account`, `/settings`, `/payment`, `/shortlist`, `/scout/portal`, `/scout/submit`, `/scout/kyc`) — it never injects there regardless of where the host site placed the `<script>`. Public marketing pages (incl. the public `/scout` join landing) still show it. Verified via a mock-DOM harness across 15 routes.

## 2026-07-02 · agent-core — chat never shows raw API errors, falls back gracefully

- **agent-core (all brands)** — `lib/agent-core/claudeClient.ts` `getErrorMessage()`: the final fallback returned the raw provider message, so an Anthropic 400 ("Your credit balance is too low…") was rendered verbatim in the chat widget as "Error: 400 {…}". Now every unrecognised error (auth, billing/credit, 500/503, unknown) returns one graceful visitor-safe line; the real error is logged server-side (`engine.ts` catch now `console.error`s the raw error before yielding the safe message). Kept the friendly overloaded/rate-limit/network branches.
- **lokazen (widget, defense-in-depth)** — `hooks/useChatStream.ts`: both error render paths (SSE `type:'error'` and the network catch) no longer print `Error: <raw>`; they show the same graceful fallback bubble. A partially-streamed answer is preserved if present.

## 2026-07-02 · agent-core — web bookings no longer stall when only an email is given (phone optional)

- **agent-core (all brands)** — `lib/agent-core/engine.ts`: the `book_consultation` tool schema listed `phone` in `required`, but the handler only needs phone OR email (`if (!bookingPhone && !bookingEmail)`). A web lead that gave only an email (e.g. Lokazen "g@lokazen.in") could never satisfy the schema, so the model collected date/time/name/email and then silently stopped — booking never fired, no calendar invite. Removed `phone` from `required` (now `['date','time','name','title']`) and documented on the field that phone is optional when an email is provided. WhatsApp brands are unaffected (phone is always present there). This unblocks Lokazen/BCON web email-only bookings.

## 2026-07-01 16:05 IST · lokazen — exclude Scouts from founder overview + hide Buying Signals for Scouts

- **lokazen** — `app/api/dashboard/founder-metrics/route.ts`: added `isScoutLead()` (checks `unified_context[BRAND_ID].user_type === 'scout'`) and filtered it out of BOTH `leadsNeedingAttention` (Priority Lead Queue) and `upcomingBookings` (Upcoming Events). Scouts have their own dashboard page; they were wrongly appearing in the founder overview with buyer-style "Push to book a call" next steps.
- **lokazen** — `components/dashboard/LeadDetailsModal.tsx`: the "Buying Signals" intelligence block (Budget / Interest / Pain Point) is hidden for scout leads — it was surfacing a meaningless "Interest: scout" chip. Scouts aren't buyers.

## 2026-07-01 15:52 IST · lokazen — Scouts table "Area Covered" chip wraps to 2 lines

- **lokazen** — `components/dashboard/LeadsTable.tsx`: the Scouts table "Area Covered" chip had `whitespace-nowrap`, so long free-text values (e.g. "Darbhanga, Bihar (Outside Current Bangalore Zone)") overflowed the cell on one line. Changed to `whitespace-normal break-words leading-snug max-w-[180px]` (and `rounded-full` → `rounded-2xl` so a wrapped multi-line chip still looks right) so it wraps to a second line inside the cell instead of breaking out. Property-type/size chips keep nowrap (short fixed values).

## 2026-07-01 15:40 IST · lokazen — chat bubble docked above footer, Scout call/link/copy fixes

- **lokazen** — `components/widget/ChatWidget.module.css`: the floating chat bubble (`.bubbleButton[data-brand="lokazen"]`) sat at `bottom: 128px`, floating well above the site's mobile footer nav. Lowered to `bottom: 96px` so it docks just above the footer with a little padding (data-open state 84px → 96px to match). This is the bubble injected onto www.lokazen.in via the `proxe.lokazen.in/api/widget/embed.js` iframe. User-facing: bubble no longer floats high above the bottom nav.
- **lokazen** — `configs/prompts/lokazen-prompt.ts`: BOOKING CALL FLOW is now scoped BRAND/OWNER-only with an explicit guardrail — Loka must never offer or book a call for a Scout (Scouts convert via Join + KYC, not a call). This fixes the live case where an out-of-area Scout (Darbhanga) was pushed to "what day works best for a quick call".
- **lokazen** — Scout onboarding link corrected everywhere to `https://www.lokazen.in/scout#scout-form` (was `lokazen.in/scout#join`): prompt SCOUT FLOW + the `LOKAZEN_SCOUT_ONBOARDING_URL` fallback constant in `app/api/agent/web/chat/route.ts`. Also tightened the "Not yet" closeout line breaks (submit + paid on adjacent lines, link separate) and fixed the Step-1 phrasing drift ("Which area in Bangalore can you cover?" → "Which area can you cover?").

## 2026-07-01 15:10 IST · lokazen — Scout misclassification fix + sync accumulated dev-tree work

- **lokazen** — Fixed Scouts being misclassified as Brand leads: the widget button label (`"Join as a Scout"`) and the live prompt wording (`"Which area can you cover?"`) had drifted from the hardcoded detection strings (`"become a scout"`, `"which area in bangalore can you cover"`) in three places — `lib/agent-core/lokazenAudience.ts` (shared detector for web + WhatsApp), `app/api/agent/web/chat/route.ts` (duplicate check), `lib/agent-core/followUpGenerator.ts` (quick-reply suppression). All three now match the actual copy.
- **lokazen** — `components/dashboard/LeadsTable.tsx`: Scouts have their own dedicated `/dashboard/scouts` page, so the default Leads view (and channel-filtered web/whatsapp views) now excludes `user_type: 'scout'` leads — Leads is brand + property-owner only.
- **lokazen** — Data fix: reclassified an existing misclassified lead (Aniket Kumar Singh) from brand→scout directly in Supabase (`all_leads.unified_context.lokazen`), removed the stray brand-only `expansion_intent` field, filled in scout_name/scout_phone/scout_area_covered.
- **lokazen** — Synced the accumulated uncommitted dev-tree work from the `C:\Users\user\Builds\PROXe` working copy into this tracked repo (this was the first commit of that backlog): new Scouts dashboard page (`app/dashboard/scouts/page.tsx`), the new `lokazenAudience.ts` module, CRE-aware Add Lead form updates, demo-data/seed script updates, widget/prompt/engine tweaks, and refreshed brand SVG assets (logo/mark/favicon/icon). User-facing: Scouts dashboard, cleaner Leads list, corrected lead classification.

## 2026-07-01 12:16 IST · lokazen — activate Scout Priority Zone Bonus (confirmed by user)

- **lokazen** — Scout KB: the Priority Zone Bonus (extra ₹100 → ₹350 total for a verified listing in a priority zone) was ingested earlier as `category=scout_internal` (proposed/hidden, never retrievable) pending confirmation. User confirmed it as real, so it's been rewritten as a customer-facing entry and moved to `category=scout` — Loka can now cite it. Zero `scout_internal` rows remain; 18 `category=scout` rows total. (Supabase change, not in repo.)
- **lokazen** — `configs/prompts/lokazen-prompt.ts`: added the Priority Zone Bonus to SCOUT APPROVED FACTS, and flipped the two guardrails that previously said "never mention a priority-zone bonus unless the KB confirms it's active" — now they state the bonus IS confirmed and safe to quote (₹350 total in a priority zone), while still holding the line on any *other* unlisted bonus.
- User-facing: scouts asking about earnings/zones will now hear about the ₹350 priority-zone rate; stacks with brand-match bonus; eligibility auto-determined from the photo's captured location.

## 2026-07-01 11:26 IST · lokazen — WhatsApp Scout-flow reset bug, dashboard columns, rider icon

- **lokazen** — `app/api/agent/whatsapp/meta/route.ts`: fixed a real race condition — `fetchRecentHistory` ran inside the same `Promise.all` as the writes persisting the *current* message, with no ordering guarantee against them. A fast SELECT could read history missing the just-sent message, undercounting `userMessageCount` and making a mid-flow answer (e.g. "Koramangala" mid-Scout-flow) look like message #0/#1 — resetting the conversation to the first-time welcome menu instead of advancing to the next step. This is what broke the live WhatsApp Scout test (`HI I want to be a scout` → area answered → bot reset to "Hi, Welcome to Lokazen..."). History fetch now runs strictly after the writes commit.
- **lokazen** — `components/dashboard/LeadsTable.tsx`: the Scouts tab was showing "Property Type" / "Size" columns (brand/owner-only fields, always blank for scouts) per the user's "details in this scout are completely off" report. Now swaps to "Area Covered" / "Knows Properties" (from `scout_area_covered` / `scout_knows_properties`) whenever `userTypeFilter === 'scout'`; brand/owner views unchanged.
- **lokazen** — `components/dashboard/DashboardLayout.tsx`: Scouts nav icon changed from a camera to `MdTwoWheeler` (rider/vehicle), matching the gig-worker identity.
- User-facing: WhatsApp Scout flow no longer resets mid-conversation; Scouts dashboard tab shows relevant fields; nav icon updated.

## 2026-06-29 15:00 IST · bcon — Stage Test Bench on the Brain page (engaged journey)

- **bcon** — new `app/api/dashboard/brain/test-stage/route.ts`: GET lists the engaged-journey stages + rendered previews (single source of the copy); POST { stage } fires that stage's real message to the test phone (919731660933) as a free-form interactive message (body + quick-reply buttons, 24h window, no Meta-template approval needed), threaded into the test number's own chat and stamped test_mode. Auth-gated. Never touches a real lead.
- **bcon** — `app/dashboard/settings/brain/page.tsx`: added a "Test the engaged journey" strip below the Brain flow — each stage shows its rendered message + buttons + a "Send to my WhatsApp" button (WhatsApp-green, not accent-on-white which is invisible in BCON). Lets us read + iterate each engaged follow-up live.
- Engaged-journey copy reworked to be context-aware (leans on their words/business/pain) vs the old generic "Let's continue where we left off?": Nudge / Push-to-book / Re-engage. Worker template copy can follow once we like these.

## 2026-06-29 14:25 IST · bcon — first greeting: warmer, one "BCON", explore-first buttons

- **bcon** — `lib/services/quickReplyMap.ts` greeting: body → "Hey, lovely to have you here. I'm PROXe, BCON's AI. What brings you here today?" (drops the duplicate "BCON", opens with curiosity not "how can I help"). Buttons → "What you do · How it works · Book a call" (explore-first; the booking CTA is soft and last, no "Book AI Brand Audit" on message one). First touch should feel welcoming, not pushy.

## 2026-06-29 14:05 IST · bcon — warmer first-message greeting (welcome, not a pitch)

- **bcon** — `lib/services/quickReplyMap.ts`: the greeting short-circuit (fires on the first "hi/hello") replied with a pitch — "Hey! I'm BCON's AI. Want to see how AI can grow your business?". Changed to a direct, welcoming open: "Hey, welcome to BCON. I'm PROXe, BCON's AI. How can I help you today?". Option buttons (Book AI Brand Audit / How it works / What I get) kept. Brand-private copy.

## 2026-06-29 13:58 IST · bcon — test sends no longer pollute real leads (route to test thread)

- **bcon** — `brands/bcon/voice/task-worker.js`: in TEST mode the send was redirected to the test phone but the conversation row was still logged against the REAL lead — corrupting that lead's history AND tripping the duplicate-send guard (a test send then blocked a real future send). Now `resolveTestLead()` resolves the test number's own lead once per run and `convLeadId()` routes every send-log row to it; in live mode it's the real lead, unchanged. Both send-log inserts (first_outreach + executeTask) use it; if no test lead resolves, the row is skipped rather than written to the real lead.
- **bcon** — data cleanup: moved 5 historical test sends off real leads (Farhan, Uday, Manav, Sandip, Saravanan) onto the test thread, with `original_lead_id` recorded in metadata. Real leads' threads + dedup guards are clean again.
- Verified end-to-end: Manav follow-up fired → test number, logged to test thread `3d3fd709`, Manav's real lead untouched.
- User-facing: in test mode every message lands in YOUR number's thread, never a real customer's.

## 2026-06-29 13:48 IST · bcon — test sends clearly marked in the inbox (no more "did it go to a real lead?")

- **bcon** — `brands/bcon/voice/task-worker.js`: in TEST mode the worker redirects every send to the test phone but was NOT stamping the conversation row, so a test send looked identical to a real one and read as if the lead received it. Added a `TEST_META` fragment (`test_mode:true`, `test_recipient`) spread into both send-log inserts (first_outreach + executeTask). 
- **bcon** — `app/dashboard/inbox/page.tsx`: non-template outbound messages now also show the amber **TEST → <number>** badge (the template footer already had it). So any test-redirected send is unmistakable.
- **bcon** — data backfill: stamped `test_mode` on 6 historical sends whose wamid decodes to the test number `919731660933` (authoritative recipient proof), so past test sends show the badge too. Real sends untouched.
- User-facing: in test mode, every redirected message is labelled TEST → 919731660933 — it is provably NOT reaching real leads.

## 2026-06-28 13:30 IST · bcon — one delivery receipt per message (no more SENT/SENT, FAILED/FAILED)

- **bcon** — `app/dashboard/inbox/page.tsx`: each outbound WhatsApp message now shows **exactly one** delivery receipt = the latest state only (Sent → Delivered → Read, or Failed). The previous commit added a delivery-status block that **duplicated** a pre-existing one with the identical `!isTemplate && !isCustomer && whatsapp` condition, so every bubble rendered the status twice ("SENT SENT" / "FAILED FAILED"). Removed the duplicate; the surviving block is now the single source — corrected to read `metadata.delivered_at/read_at` (the top-level columns do not exist) and to show one labelled chip (grey Sent · green Delivered · blue Read · red Failed) with the Meta reason on hover. send_succeeded === false (send API itself failed) also surfaces as Failed.
- User-facing: clean single status per message instead of a stacked pair.

## 2026-06-28 ~13:10 IST · bcon — clear delivery labels + duplicate call-log card fix (`9fe25c43`)

- **bcon** — `app/dashboard/inbox/page.tsx`: `DeliveryStatusIcon` was reading top-level `msg.delivered_at/read_at` (columns that don't exist; status lives in `metadata.*`), so every send fell to one bare amber tick. Now driven off `metadata.delivery_status` with an always-visible Sent/Delivered/Read/Failed label.
- **bcon** — `components/dashboard/LeadDetailsModal.tsx`: the Notes tab rendered a logged call twice (the `log_call` admin_note **and** the `manual_call` activity, whose differing text formats dodged the dedup). Excluded `manual_call` from the Notes tab (still in Activity) and added a re-entrancy guard to `handleLogCall` so a double-click can't write two logs.

## 2026-06-26 08:07 IST · bcon — inbox renders WA quick-reply buttons + greeting no longer replays mid-chat

- **bcon** — `app/dashboard/inbox/page.tsx`: the inbox now renders `metadata.quick_reply_buttons` (the interactive quick-reply / LLM-emitted buttons the AI actually sends on WhatsApp) as stacked, WhatsApp-style reply buttons under the AI bubble. Previously only `template_buttons` rendered, so these buttons were invisible to operators — the chat looked like the AI sent a bare line with no options. Indigo accent text (not `--accent-primary`, which is near-white in BCON).
- **bcon** — `app/api/agent/whatsapp/meta/route.ts`: the canned **greeting** quick-reply no longer re-fires for an established conversation. A returning lead who typed "Hello" mid-thread was getting the cold "Hey! I'm BCON's AI…" intro again, wiping context. Now the greeting short-circuit is suppressed when `userMessageCount > 1`, so the message goes to the LLM with full history. Other triggers (pricing/services) still short-circuit on short messages.
- User-facing: operators can finally see the buttons the AI offered; returning customers get context-aware replies instead of a cold re-intro.
- **bcon** — build hotfix: restored `"reactflow": "^11.11.4"` to `brands/bcon/agent/package.json`. A rebase conflict resolution (`--theirs`, which is *my* commit in a rebase) reverted package.json to a pre-reactflow base, dropping the dep the Brain page imports while the lockfile kept it — `npm install` then pruned reactflow and `next build` failed with `Module not found: reactflow`. Deps now match the last green build exactly.

## 2026-06-25 00:08 IST · bcon — web-lead welcome fix + per-source "New lead arrives" trigger UI

- **bcon** — Root-caused why "ready" messages weren't sending: the `bcon-tasks` PM2 worker had been dead since 2026-06-23 11:10 UTC (~36h), dropped from PM2 *and* the saved dump. Revived it (`pm2 startOrRestart ecosystem.config.js && pm2 save`) so the whole `agent_tasks` engine processes again. Approval gate left ON (tasks land in "Awaiting Approval"). VPS-side op, no code.
- **bcon** — `api/integrations/web-agent/route.ts`: added `sendWebWelcome()` — brand-new web (chat-widget) leads now fire the approved `bcon_welcome_web_v1` WhatsApp template. This is the route web leads actually use; previously it created the lead but sent no welcome at all. Sends bare last-10 digits (the format the live worker uses). Awaited so the Vercel lambda can't drop it; soft-fails.
- **bcon** — `api/website/route.ts`: the form-route welcome was a fire-and-forget IIFE → dropped on lambda freeze. Now awaited. Bumped Graph API v18→v21.
- **bcon** — `configs/flows-automation.ts` + `components/dashboard/FlowsAutomation.tsx`: "New lead arrives" trigger now breaks down by source in the detail panel — Website → `bcon_welcome_web_v1`, Meta/AI Lead Machine → `bcon_lead_machine_meta_welcome_v1_`, Campaign → (not set) — each with its live Meta approval dot. Replaces the single non-existent `bcon_proxe_first_outreach` reference.
- User-facing: web leads will now receive a WhatsApp welcome; the Flows → Triggers panel shows the real per-source templates and their approval status.

## 2026-06-22 · fix: bcon production — remove proxe-platform monorepo dep (the REAL cause)

- The `npm install` switch (prior entry) did NOT fix it — the build log showed the actual error: `EMISSINGTARGET — "../.." is referenced by "node_modules/proxe-platform" but does not exist`. bcon's `package.json` + `package-lock.json` declared `"proxe-platform": "file:../../.."` (the monorepo root), which isn't in Vercel's build context (Root Directory = `brands/bcon/agent`), so install failed regardless of npm ci vs install. **This is the exact issue the parallel session already removed from POP** (WC + POP have zero `proxe-platform` refs and build fine); bcon was simply never cleaned.
- Fix: surgically removed `proxe-platform` from bcon's `package.json` (deps) and `package-lock.json` (root deps + the `../../..` package + the `node_modules/proxe-platform` link), preserving all cross-platform deps (no full regen — that drops the Linux optional deps). Reverted `installCommand` back to `npm ci --include=dev` (clean lockfile works with it, matching WC/POP). bcon now matches WC/POP: 0 monorepo refs.

## 2026-06-22 · fix: bcon production deploys failing — switch install to npm install

- **bcon production had been failing every deploy for ~3h** (stuck on `0249cccf`), so nothing new — incl. the leg-1 lockup fix — reached proxe.bconclub.com. Root cause: bcon's `npm ci --include=dev` died at install with `EUSAGE: npm ci can only install with an existing package-lock.json` (the same lockfile/build-env breakage the parallel session already hit on POP). bcon's lockfile is present + valid at HEAD, but `npm ci` couldn't use it in the Vercel build env.
- Fix: bcon `vercel.json` install → `npm install --include=dev --no-audit --no-fund` (mirrors the proven POP fix; `npm install` tolerates the lockfile issue, `--include=dev` keeps build-time devDeps). WC left on `npm ci` (it builds fine). My earlier `ignoreCommand` did not cause this.

## 2026-06-22 · deploy: per-brand Vercel ignoreCommand (stop cross-brand rebuilds)

- Every push to `main` was rebuilding **all four** Vercel projects (bcon/wc/pop/proxe each watch the same repo+branch), so a POP-only commit triggered redundant bcon/wc builds and cluttered the dashboard. The war-room code was never leaking (it lives only in `brands/pop/agent`) — only the build *triggering* was wasteful.
- Added `"ignoreCommand": "git diff --quiet HEAD^ HEAD ."` to each brand's `vercel.json`. Vercel runs it from the project's Root Directory (the brand dir); `git diff --quiet` exits 1 when that brand's dir changed (→ build) and 0 when unchanged (→ skip). So each brand now rebuilds **only when its own directory changes**. This commit touches all 4 (so all rebuild once); scoping applies from the next commit.

## 2026-06-22 · sync: propagate leg-1 fixes master → Windchasers (lockup fix goes live)

- Forward-propagated the 5 leg-1 brand-neutral fixes from master to **Windchasers** (POP already had them from its bcon scaffold, so WC was the only brand behind): `hooks/useRealtimeLeads.ts` (the DB ShareLock lockup fix), `lib/services/leadOwnership.ts`, `lib/agent-core/claudeClient.ts`, `api/dashboard/summarize/route.ts`, `api/agent/whatsapp/respond/route.ts`. All 4 trees now byte-identical on these. Brand-neutral, already running in bcon prod; WC verified via its Vercel build.

## 2026-06-22 · sync: artifact guardrail + leg-1 reverse-sync (bcon → master)

- **Brand-artifact guardrail** (`scripts/brand-shared.json` + `scripts/reverse-sync.js`): new `brandArtifacts` map declares per-brand, one-directional features built on the PROXe base (POP war-room: `lib/war-room/`, `app/dashboard/war-room/`, `components/dashboard/WarRoom`, `data/`). reverse-sync now hard-errors if any artifact path is in `sharedCore` (guard 1) and refuses an explicit `--only` of an artifact (guard 2) — so brand-only features can never leak up to master or across to other brands.
- **Leg-1 reverse-sync bcon → master** (brand-neutral fixes, master only — not a live site): `hooks/useRealtimeLeads.ts` (Realtime→30s polling, fixes the DB ShareLock lockup master+WC still carry), `lib/services/leadOwnership.ts` (AI-vs-human last-actor), `lib/agent-core/claudeClient.ts` (retired-model self-heal), `api/dashboard/summarize/route.ts` (model → live Sonnet 4.5), `api/agent/whatsapp/respond/route.ts` (actor stamp). All verified brand-literal-free; master type-checks clean on these. Tasks board + Flows redesign deliberately NOT pulled (carry bcon copy — need de-branding).

## 2026-06-22 · bcon: Config page (phase 1 — admin-only visibility of all config)

- New **Config** nav entry → `/dashboard/config`: one admin-only place to SEE the whole setup — every integration's connection status (Connected / Partial / Not set), its non-secret identifiers (URLs, phone/account IDs, from-addresses…), whether each **secret is set** (shown as `•••• set` / `not set` — values are never sent to the client), plus the lead **sources**, connected **channels**, and **lead fields** the agent uses.
- New `GET /api/dashboard/config` (admin-gated via the same `requireAdmin` + `dashboard_users.role` check as users): computes status from `process.env`, returns non-secret values + `set` booleans only. Integration map mirrors the env template (Supabase, Claude, WhatsApp, Instagram, Voice, Google Calendar, Resend).
- Phase 2 (write-only token editing with runtime override) is next — phase 1 ships the visibility safely first (a token field that doesn't take effect would be worse than none).

## 2026-06-22 · bcon: Flows Triggers + Sequences rebuilt as master-detail (match Stages)

- Per the founder: the Sequences and Triggers tabs now use the **same master-detail shape as the Stages hero** — a left selectable list (each trigger / each sequence, with a status dot) + a right detail panel (lifted `bg-secondary` card + soft shadow, `bg-tertiary` inner section cards). Triggers detail shows the event, timing badge, and the template fired + its Meta status; Sequences detail shows the who/stop rules, an `N/total templates ready` count, and a numbered vertical step chain with each step's template + status. All three Flows tabs now read as one designed surface.
- `FlowsAutomation.tsx` rewritten (still driven by the `section` prop); `flows/page.tsx` unchanged this step.

## 2026-06-22 · bcon: Flows lands on Stages (hero) + Triggers/Sequences cards lifted to match

- Flows now **opens on Stages** (the hero view), toggle order **Stages · Sequences · Triggers**.
- First pass aligning the Triggers + Sequences tabs to the Stages look: their cards moved from flat `bg-tertiary` (no shadow) to **lifted `bg-secondary` + soft shadow** (`0 6px 18px rgba(0,0,0,0.22)`), and the sequence step chips nest on `bg-tertiary` — so all three tabs read as the same designed surface instead of grey blocks. (More redesign to follow.)

## 2026-06-22 · bcon: Flows = Sequences (default) · Triggers · Stages — 3-way toggle

- Corrects the previous entry: **Stages is back**, and Triggers + Sequences are now **separate toggles** instead of one combined page. Flows opens on **Sequences** (the default landing), with a segmented toggle to **Triggers** and **Stages**.
- `FlowsAutomation` takes a `section?: 'sequences' | 'triggers'` prop and renders just that section; `flows/page.tsx` default view is `sequences`, and `FlowsViewToggle` now lists Sequences / Triggers / Stages. The Stages funnel view (restored) is reachable again via the toggle.

## 2026-06-22 · bcon: Flows = Triggers + Sequences only (drop the Stages tab)

- Removed the **Stages** view toggle from Flows so the page is just **Triggers + Sequences** — per the founder's model: triggers are the event-fired automations, sequences are the multi-step chains, and "stages" were really just sequences shown a second way. Stages live in the **Pipeline** (lead-level view comes later), so Flows no longer duplicates them.
- `flows/page.tsx`: dropped `<FlowsViewToggle>` from the (default) automation view; the old stages/board/overview render paths are now unreachable (dead — left in place for a separate cleanup, not ripped out). No change to `FlowsAutomation` content.

## 2026-06-22 · bcon: Flows → Triggers + Sequences view (shows what fires for every lead)

- New **Triggers & Sequences** view on Flows (now default; toggle to the old **Stages** funnel) — answers "what message goes when", which the funnel never showed.
  - **Triggers** (fire once): new-lead **welcome** (`bcon_proxe_first_outreach`), booking reminders **1 day / 1 hour / 30 min before** (`bcon_proxe_booking_reminder_24h/1h/30m`), voice-no-answer → starts No-response sequence, callback.
  - **Sequences** (multi-step by lead state, auto-stop on reply): No-response/cold (missed-call → Day1/3/5 → re-engage; gated), Engaged-not-booked (nudge → push to book), Long-tail (Day 3/7/30/90).
  - Each step names its WhatsApp template + shows the template's **Meta status** (Approved/Pending/Not created) from `GET /api/whatsapp/templates`, so silently-missing templates are visible. New `components/dashboard/FlowsAutomation.tsx`; `flows/page.tsx` gains the view + toggle.

## 2026-06-22 16:30 IST · bcon: Flows page visual parity with the dashboard

- **Borders thinned** — active funnel + stage cards dropped from `2px` to `1px` (color now conveys selection, not weight); matches the dashboard, which never uses 2px.
- **Containers lightly tinted** — the flat/transparent detail-panel cards (Channels, Coverage, Lead Progress, Template Schedule, Performance, Templates) now sit on `var(--bg-tertiary)`, and inactive stage cards moved off `bg-primary` (invisible on the #000 page) onto `bg-tertiary`. Reads as soft lifted surfaces like the dashboard.
- **Active tint softened** — selectors went from a heavy `${color}12` to `color-mix(in srgb, ${color} 7%, var(--bg-secondary))`, echoing the dashboard's ~4% KPI-card tint.
- **Radius unified** to `12` (funnel cards / stage-list panel / detail aside were `14`).
- **Theme-correctness** — legacy board/overview borders swapped from hardcoded `rgba(255,255,255,.06–.1)` to `var(--border-primary)` so they follow the theme.
- No logic changes; only the rendered stages view + detail panel restyled. User-facing: Flows now matches the dashboard's look. Dead helper components (FunnelSection/FlowStageCard/etc.) left untouched.

## 2026-06-21 · bcon: WhatsApp template builder — Number/Named variables + Copy-code button (Meta parity)

- **Type of variable** selector (matches Meta): **Number** (`{{1}}`) or **Named** (`{{order_id}}`). The +Add-variable action and per-variable sample inputs adapt to the chosen style; switching clears the body so the two never mix. The create API builds the right `example` shape — `body_text`/`header_text` for numbered, `body_text_named_params`/`header_text_named_params` for named.
- **Buttons** match Meta's menu labels and add **Copy offer code** (`COPY_CODE`, with an example code) alongside Custom (quick reply) / Visit website (URL) / Call phone number. Live preview renders it.
- Kept in Settings; carries the visible-button fix.

## 2026-06-21 · bcon: WhatsApp message-template builder (for Meta Tech Provider review)

- **bcon (Vercel):** new **Settings → WhatsApp Templates** (`/dashboard/settings/whatsapp-templates`) — a Meta-style composer to **create** a WhatsApp message template from the dashboard and submit it to Meta for approval, plus a list of existing templates with status (Approved / Pending / Rejected). Composer: name, category (Marketing/Utility/Authentication), language, optional text header (1 var), body with `+ Add variable` and per-variable sample values, optional footer, up to 3 buttons (quick-reply / URL / phone), and a **live WhatsApp-bubble preview**. Linked from the Settings root.
- **bcon:** new `POST /api/whatsapp/templates/create` — submits to the WhatsApp Business Management API (`POST /{waba-id}/message_templates`), building the components array (HEADER/BODY/FOOTER/BUTTONS) with Meta's required `example` samples; validates name/category/variables locally and surfaces Meta's error verbatim. WABA id from `META_WHATSAPP_WABA_ID` (falls back to phone-edge lookup). Existing GET (list) + send-test route untouched.
- Demo-facing: this is the `whatsapp_business_management` proof for Tech Provider — record creating a template here; the Chats/Inbox page covers the live-conversation proof.

## 2026-06-21 · tooling: one-command launcher for the brand-diff flow

- `scripts/brand-diff.js` gained `--serve [--port=N]` — regenerates from the live trees, hosts on `http://127.0.0.1:8777/brand-diff.html`, and pops it open in the default browser (cross-platform). Re-reads the file per request so a regen shows on refresh.
- Root `package.json`: **`npm run flow`** (generate + serve + open) and `npm run brand-diff` (generate only).
- `.claude/commands/proxe-flow.md` — type **`/proxe-flow`** in Claude Code to launch it without leaving the session.

## 2026-06-21 · tooling: brand-diff flow visualizer (React Flow)

- New `scripts/brand-diff.js` — reads the live trees + `brand-shared.json` and generates a self-contained `scripts/brand-diff.html`: a React Flow diagram of master (canonical) → each brand, color-coded by sync % (identical / drift / missing) with per-feature pills (Calls / Toggle / Brain / Funnel / Follow-up) showing present-on (green) / present-off (slate) / absent (red). Edges carry the drift+missing count. Re-run `node scripts/brand-diff.js` to refresh — nothing hand-maintained. Internal dev tool (lives in `scripts/`, no brand build impact). User-facing intent: a simple "are the brands in sync, and what differs" picture, far lighter than the Understand graph.

## 2026-06-21 · all brands: promote runtime feature toggle (Settings → Features) to master, Windchasers, proxe

- **windchasers + master + proxe:** ported the runtime feature-toggle stack from BCON — `useFeatureFlags()` hook, `GET/POST /api/dashboard/settings/features` (overrides in `dashboard_settings.feature_flags`, merged over config defaults), and the `/dashboard/settings/features` on/off panel. The nav (DashboardLayout), Calls page and Brain button gates now read the hook instead of `getBrandConfig().features`. **User-facing: Windchasers now has the Voice/Calls on/off toggle** (and Brain/Funnel/Follow-up) — flip it from Settings → Features, no redeploy.
- **windchasers + master:** Settings root gained a **Features** card linking to the toggle panel. (proxe's settings page is differently structured + dormant — toggle reachable by direct URL there; link deferred.)
- `app/dashboard/calls/page.tsx` aligned byte-identical across all 4 trees (shared-core manifest file).
- Registered 3 now-shared files in `brand-shared.json`: `lib/useFeatureFlags.ts`, `api/dashboard/settings/features/route.ts`, `app/dashboard/settings/features/page.tsx` (sharedCore 171 → 174).
- Type-checked master/WC/proxe: no new errors.

## 2026-06-21 12:12 IST · bcon: runtime feature toggles (Settings → Features) + Voice/Calls + Brain promoted to all brands

- **all brands (master, windchasers, proxe):** **Voice/Calls** code (Calls dashboard page + `CallsTable`, `api/dashboard/calls{,/[id]}`, `api/agent/voice/{call-status,vapi-webhook}`) and **Dashboard Brain** now ship to every tree, gated by a per-brand `features` flag. Switched ON for BCON, OFF for Windchasers/proxe — their sidebars render byte-identical (the Calls nav slot is divider-compensated). `vapi-webhook` was made brand-neutral (`BRAND_ID`, env-only VoBiz number). proxe excluded from Brain (dormant template).
- **bcon (Vercel):** new **Settings → Features** panel (`/dashboard/settings/features`) with on/off toggle switches for Voice/Calls, Dashboard Brain, Pipeline Funnel and Follow-up Sequence. User-facing: founders flip a feature on or off themselves — it applies to everyone on the brand on the next page load, **no redeploy**.
- **bcon (Vercel):** feature flags are now **runtime**, not compile-time. New `GET/POST /api/dashboard/settings/features` stores overrides in `dashboard_settings` (key `feature_flags`), merged over the brand-config defaults (service-role write, global per brand — mirrors `settings/preferences`). New `useFeatureFlags()` hook seeds from the config default (no flash) then overrides from the DB; the nav, Calls page and Brain button gates now read it.
- DashboardLayout / FounderDashboard / Calls page (bcon) switched from `getBrandConfig().features` to the runtime hook. WC/master/proxe keep the compile-time gate for now (to be propagated once the toggle UX is confirmed).
- (34d8576b)

## 2026-06-19 03:58 IST · bcon: Calls dashboard view + overview Calls KPI

- **bcon (Vercel):** new **Calls** section in the dashboard — inbound + outbound voice calls with recordings and transcripts. Nav entry added in the primary group (Chats → Calls → Pipeline). `/dashboard/calls` lists calls (direction, contact, when, duration, status, transcript turns, recording); a row opens a slide-in drawer with an `<audio>` player + full transcript + summary. User-facing: founders can see who called / who was called and play back any recording.
- **bcon (Vercel):** new read-only APIs `GET /api/dashboard/calls` (filters: direction / status / search / date) and `GET /api/dashboard/calls/[id]` (one call + transcript). No schema change — merges `voice_sessions` (call facts) with `conversations` channel=voice rows (recording / summary / transcript), joined by `metadata.call_id === voice_sessions.external_session_id`.
- **bcon (Vercel):** Overview gained a **Calls** KPI card (inbound/outbound counts + 7-day trend sparkline) linking to `/dashboard/calls`; `founder-metrics` now returns a `calls` block (extended the `voice_sessions` select to carry direction/status/duration/created_at).

## 2026-06-19 07:15 IST · bcon: capture all form qualifiers + feed them to the AI opener; inbox card fallback

- **Responses use form context:** inbound API now captures EVERY field Pabbly sends (flat params or nested custom_fields) into `raw_form_fields`, and maps the qualifiers (business_type / customer_type / lead_volume / current_system / marketing_spend) into structured `form_data`. promptBuilder's FORM DATA block now renders those, so the AI's first reply opens with the lead's business/context instead of a generic "what do you guys do?". Previously flat qualifier params were silently dropped (raw_form_fields=null).
- **Inbox card:** the Meta-Form card parses fields from the logged message, which sometimes has an empty Name / bare "+" Phone — now falls back to the resolved lead record for Name/Phone and drops any still-blank field so no empty rows show.

## 2026-06-19 06:45 IST · bcon: SOURCE column parity with Windchasers (Meta Forms badge)

- LeadsTable `sourceConfig` was a stripped subset (web/whatsapp/voice/social only), so a Meta-Forms / Facebook / Google lead with no UTM + `attribution.source=direct` fell through to `unknown` = "-" on the top badge. WC's channelConfig has all channels. Added `meta_forms`/`facebook`/`google`/`ads`/`pabbly`/`referral`/`organic`/`manual`/`form` so the SOURCE column shows the channel badge (e.g. **Meta**) on top + the first-touch sub-label (**Meta Forms**) underneath — matching Windchasers. Data was already present (attribution.first_touch_label); this was render-only.

## 2026-06-19 06:30 IST · bcon: fix brand-casing split (BCON vs bcon duplicate leads)

- Root cause: `NEXT_PUBLIC_BRAND` env = `BCON` (uppercase); lead-writers wrote that verbatim, so the same phone split into `BCON` + `bcon` records (dedup is case-sensitive). Fix env to `bcon` AND harden code so it can't recur:
- `getCurrentBrandId()` now returns lowercase (brand IDENTITY for DB writes); callers needing an env prefix still `.toUpperCase()` themselves, so `BCON_SUPABASE_URL` lookups are unaffected.
- `whatsapp/meta` lead-writer lowercases the brand (was the source of the uppercase WhatsApp leads). `leads/inbound` + `vapi-webhook` already lowercase.

## 2026-06-19 06:14 IST · bcon: inbound Lead Machine welcome + Calls ingestion hardening + anti-flush guard

- **bcon (VPS task-worker):** inbound `first_outreach` now sends the approved-in-review `bcon_lead_machine_meta_welcome_v1` (params `customer_name` + `brand_name`, `your brand` fallback, buttons Yes Book a Demo / Tell me more in chat). Send-time **gate** skips the welcome if the lead already started a WhatsApp chat (don't double-message click-to-WhatsApp leads). **Anti-backlog-flush staleness guard** (`STALE_TASK_HOURS`, default 6h) so a worker restart can't blast an overdue backlog.
- **bcon (inbound API):** `brand` normalized to lowercase — stops `BCON`/`bcon` **duplicate leads**. `first_outreach` scheduled **+2 min** (grace window: if the lead messages on WhatsApp first, the gate suppresses the welcome).
- **bcon (Vapi webhook):** `voice_sessions` row written **first + idempotent** so every call reliably appears on the Calls dashboard (was silently dropping); handles `status-update` for live in-progress calls; lead-scoring moved last so it can't drop the call.
- **bcon (Calls UI):** auto-refresh 60s→15s; removed the subtitle.

## 2026-06-19 03:32 IST · bcon: kill retired-model 404, brand pronunciation on calls, tighter web replies

- **bcon (Vercel):** retired Anthropic model `claude-sonnet-4-20250514` now 404s. Added a runtime guard in `claudeClient.getModel()` that remaps retired IDs → `claude-sonnet-4-5-20250929`, so the web chat widget recovers **even with the stale `CLAUDE_MODEL` env var** (no dashboard change required). User-facing: clears the `Error: 404 not_found_error` shown in the chat bubble.
- **bcon (Vercel):** swapped the same dead ID → Sonnet 4.5 in the hardcoded dashboard routes (`dashboard/summarize`, `dashboard/leads/[id]/summary`) and the env example files.
- **bcon (Vercel):** web chat style — replies now 1-2 sentences and MUST end on a single open question (momentum over monologue). User-facing: shorter, faster back-and-forth in the widget.
- **bcon (VPS voice):** brand mispronunciation on calls. Added `speechSafeBrand()` at the TTS chokepoint (both ElevenLabs + Sarvam, incl. greeting preload) — rewrites every variant of `PROXe`/`BCON` → `Proxy`/`Beacon` before audio. User-facing: the caller always hears the brand pronounced correctly regardless of what the model emits.

## 2026-06-17 · Infra: master→brands propagation (changes land on master, flow everywhere)

- **The "edit core once → it's in every brand" mechanism is live.** `master/agent` is the source of truth for shared core; `scripts/propagate-from-master.js` copies the shared-core files into every brand, **never touching** each brand's own layer (configs, prompts, brand-facts, brand-divergent components/routes), so brand identity (colour/copy/fields/templates) is preserved.
- `scripts/brand-shared.json` = the manifest: 160 shared-core files (the set currently identical across master+bcon+wc). Move a file OUT the moment a brand must diverge it; move one IN once it's brand-neutral.
- Defaults to dry-run (reports only); `--apply` writes; `--apply <brand>` for one. After apply, commit per brand — the pre-commit hook bumps each brand's version + the company version. Verified end-to-end: a master edit to a shared file correctly flags both bcon + windchasers to update.
- The remaining ~53 brand-divergent files (FounderDashboard, LeadDetailsModal, whatsappSender, prompts, etc.) still sync manually until their brand bits are extracted into the config layer — that extraction is what shrinks the skip-set toward zero (the road to a single shared-core package).

## 2026-06-17 · bcon: more WC catch-up (known-contact prompt + web-chat/modal bug fixes)

- **bcon**: ported WC's promptBuilder KNOWN-CONTACT block (don't re-ask captured name/phone/email) + userEmail/userPhone; fixed a real web-chat bug where `postProcess()` referenced out-of-scope `messageCount`/`attributionSignal` (web-lead capture/attribution/summaries were silently failing); fixed duplicate `className` on LeadDetailsModal admin-note buttons. `next build` green, 46/46.

## 2026-06-17 · bcon: catch up to Windchasers (token metering + clean-core sync)

- **bcon** was behind WC beyond the home page. Shipped token metering (`/tokens`, `token-usage.ts`, claudeClient recording, route — WC had it, bcon recorded nothing) and re-synced 47 clean shared-core files from WC (MicroCharts, NotificationCenter, TodaySnapshot, founder-metrics, attribution, claudeClient, dashboard routes, etc.) — brand-agnostic, so they render with bcon's own theme (pixel-parity). Brand-touched files (accent/copy/fields/prompts/templates) left intact, reconciled separately. `next build` green, 46/46.

## 2026-06-17 · Infra: cross-brand versioning + changelog

- **Versioning is now cross-brand, not Windchasers-only.** The pre-commit hook used to bump only `brands/windchasers/agent`; bcon was stuck (build-time `increment-build.js` only ran ephemerally on Vercel, committed version frozen at 0.0.20), and master/proxe had no bumper. The hook now loops every agent (`bcon`, `windchasers`, `proxe`, `master`) and bumps each one this commit touches — so the deploy version climbs for changes in **any** repo, and the bump rides along when changes flow brand → master → branches.
- Canonical hook committed at `scripts/git-hooks/pre-commit` (+ installer `scripts/install-git-hooks.sh`) so it survives clones/worktrees (hooks aren't version-controlled inside `.git`). `bump-version.js` (generic, patch+carry-at-100) added to **bcon** + **master** (was windchasers-only).
- bcon `prebuild` dropped `increment-build.js` → committed version (from the commit hook) is the single source of truth, matching windchasers/master.
- This changelog is now the multi-brand log (entries tagged by brand).

## 2026-06-17 · master: finished as the canonical multi-brand base

- **master brought to full Windchasers core parity** (was 165 files, stale + non-building): 162 clean core files synced verbatim from WC + the brand-touched lib/app layer ported. Preserved master's multi-brand bits — `configs/*` resolver + `services/supabase.ts` `brandPrefix()` (not WC's hard `WINDCHASERS` lock). `next build` green, 48/48 pages.
- **Brand layer made brand-resolved** so master is a true multi-brand base: `promptBuilder` now switches windchasers|bcon by env (default windchasers) instead of hardcoding WC; `leadManager` uses the resolved `BRAND_ID` context key. Adding a brand = drop in `<brand>-prompt` + one switch case + config + brand-facts, no other core surgery.

## 2026-06-17 · bcon home: sync to Windchasers latest (Engine cohort funnel + lighter cards + High Intent green)

- **Engine Overview toggle** now matches the others — **24h / 7D / 14D / All** (added Today).
- **Engine funnel is a real per-window cohort:** `founder-metrics` returns a `funnel` map (of leads acquired in the window, how many reached each stage) so all five nodes — including **Follow-up Due** and **Booked** — scale with the window instead of staying constant. FounderDashboard reads it with a fallback to the old per-metric counts.
- **Lighter KPI card tint** (7%→4% fill, 22%→14% border) across all cards; **High Intent Leads** card is now green (not red); **Upcoming Events** name gets breathing room (baseline row, date · owner grouped).
- Ports WC's `ed1cbc7a` + `8735fa16` + `0cf5c08d` onto bcon (brand theme/accent untouched). master already carried these from its WC sync.

## 2026-06-17 01:05 IST · Windchasers: auto-welcome WhatsApp for inbound callback leads

- `/api/agent/leads/inbound` (Google Ads / website / manual callback leads) now sends a WhatsApp welcome template on NEW lead creation — previously this branch was disabled because the old `windchasers_followup` template was unapproved in Meta (silent fails). Re-enabled with the approved v2 templates.
- Pilot-source leads (campaign / source / form / interest mentions pilot/cpl/ppl/chpl/dgca/flying) → `windchasers_pilot_welcome_v2`; everyone else → `windchasers_generic_welcome_v1` (via `pickWelcomeTemplate`).
- New leads only (skips existing leads), awaited so the Vercel lambda doesn't drop the send, logged to conversations (success + failure), and flags `needs_human_followup` on failure. PAT + demo flows keep their own templates unchanged.
- User-facing: people who fill the Google-Ads callback form now get a pilot welcome on WhatsApp so the conversation can continue.

## 2026-06-17 00:10 IST · Windchasers home: time greeting, card tints, labelled controls, colour-coded events

- **Greeting** now shifts by IST time of day — Good morning / afternoon / evening / night (was always "Welcome back").
- **KPI cards** get a subtle accent tint (~7% of their colour over black) + matching border. **Follow-up Health** now follows its status across the whole card — green (good) / amber (fair) / red (needs work) — icon, tint, ring and label all match (was a green heart even when "Fair").
- **Top controls** — Snapshot and Ask PROXe are now labelled pill buttons (discoverable), with the notification bell as an icon to their right.
- **Upcoming Events** trimmed to two lines max: line 1 = name · date · owner, line 2 = the event title (only when present); removed the third line. The countdown chip is now recency-coloured (<=24h blue, <=3d amber, beyond muted) — the only coloured element.

## 2026-06-16 23:35 IST · Windchasers: token metering — fix the actual write bug (updated_by UUID)

- **Root cause found:** `dashboard_settings.updated_by` is a UUID column, but `recordTokenUsage`/`resetTokenUsage` passed `updated_by: 'system'` → every upsert 400'd (`22P02 invalid input syntax for type uuid`) and the empty catch swallowed it, so the `token_usage` row was NEVER written (even after the await fix). Removed `updated_by` from both upserts (defaults to null). Confirmed via a direct REST upsert test (201 when omitted). The catch now logs failures so this can't hide again.
- User-facing: /tokens counters now populate as the agent runs (chat/scoring/notes/summaries).

## 2026-06-16 20:25 IST · Windchasers: token metering now persists + bento polish

- **Token usage finally records:** `recordTokenUsage` was fire-and-forget (`void`) inside the Claude client, so on Vercel the lambda froze after the response and the DB write never completed — the `dashboard_settings.token_usage` row was never written once. Now awaited at every call site (chat / tools / vision / streaming / scoring / notes / summaries), so the write lands before the function returns. Counters fill going forward. (Historical backfill still needs an Anthropic Admin key.)
- **Bento padding made consistent:** Engine Overview / Upcoming Events / Conversations Trend now all use `p-4` (matching the Priority Queue padding the founder likes) — Engine was `p-6`, others `p-5`.
- **Upcoming Events scroller** no longer flush against the card edge (`pr-1.5` gives the scrollbar breathing room).
- **Subtle bento entrance:** cards fade + rise in with a light stagger on load (reduced-motion respected; plays once, not on each 60s refresh).

## 2026-06-16 19:55 IST · Windchasers home: fix reply-rate, sparkline, blacker theme, compact events

- **Bug fix — Follow-up Health reply rate dropped to 68%:** the reply-rate + response-time calcs scan each conversation forward in time for the agent's reply, which requires ascending order. The conversations pagination fetched newest-first, breaking detection. Now re-sorted ascending after fetch — reply rate computes correctly again.
- **Active Conversations sparkline** now follows the card's 24h/7d/14d toggle (was hardcoded to the 7-day series).
- **Booked Calls / Events** footer now reads "vs last 7 days" (pairs with the change %) instead of "% of total leads".
- **Homepage made blacker:** home card/section surfaces switched from `--bg-secondary` (#111 grayish) to `--bg-primary` (#000); inner chips (#111) now actually show against the black cards instead of blending in.
- **Upcoming Events compacted:** when an event has no title, the name + date + owner sit on a single line (was three) — fits more events.

## 2026-06-16 19:20 IST · Windchasers home: card 2 → High Intent Leads

- Replaced the "Leads Recovered" card (low/redundant signal) with **High Intent Leads** = `hotLeads.count` (leads PROXe scored ≥ the hot threshold). Active Conversations and an engaged-today count were effectively the same set, so this surfaces a distinct, valuable number instead.
- User-facing: top row now reads Active Conversations · High Intent Leads · Follow-up Health · Booked · Avg Response.

## 2026-06-16 19:05 IST · Windchasers home: fix click-through on Upcoming Events + Priority Queue

- **Bug fix — clicking a lead opened nothing:** `openLeadModal` selected a non-existent `all_leads.status` column, so the query 400'd (`42703 column does not exist`) and silently returned. Dropped `status` from the select (added `metadata`, which exists). Clicking an Upcoming Event or Priority Lead Queue row now opens that lead's detail modal.
- User-facing: Upcoming Events and Priority Lead Queue rows are now clickable and take you to the lead.

## 2026-06-16 18:40 IST · Windchasers home: fix Active Conversations (conversations fetch cap), redefine Leads Recovered, per-card toggles

- **Bug fix — Active Conversations always 0:** the founder-metrics conversations query fetched ascending with no date filter, so PostgREST's 1000-row cap returned the 1000 *oldest* rows and no recent activity. Now paginates the most-recent ~45 days newest-first, so 24h / 7d / 14d / 30d counts are accurate (live data: 153 conversations in last 24h, 1854 in last 7d).
- **Leads Recovered redefined:** there is no "cold/lost" stage in the data, so the old cold→active stage heuristic matched nothing. Now detected from the conversation timeline — a customer (inbound) message after ≥7 days of silence for that lead, comeback within the last 30 days; counts distinct leads.
- **Per-card date toggles (founder request "put it inside the cards"):** removed the global top-bar Today/7D/14D/30D segmented toggle. Active Conversations card now has its own 24h / 7d / 14d toggle; Conversations Trend has its own 7d / 14d / 30d toggle.
- **Token metering:** `streamResponse` (streaming chat) is now metered too (was the one un-metered path); `recordTokenUsage` logs when it skips on a null service client, to surface why the /tokens aggregate was empty.
- User-facing: the two PROXe-value cards (Active Conversations, Leads Recovered) now show real numbers and each card carries its own time-window toggle.

## 2026-06-15 23:32 IST · Windchasers home: founder KPI row tweaks

- Home KPI card 1 changed from "Active Conversations" to "New Leads", with an inline period toggle (7D / 14D / 30D / All) that swaps the count from real `totalLeads` data, plus sparkline; clicking the number opens the leads list.
- "Booked Calls / Events" card footer now shows "X% of total leads" (booked ÷ total leads) instead of "vs last 7 days" — a founder-facing conversion read.
- Response Rate, Follow-up Health and Avg Response Time cards unchanged.
- User-facing: founders can see lead volume by period at a glance and what share of leads are converting to booked calls.
- (3de7328a)

## 2026-06-15 22:26 IST · Windchasers: custom POP sounds + notification toast redesign + auto-version

- `sound-prefs.ts`: new-lead + lead-update cues now play `/sounds/pop.wav`; page-load ("ready") cue now plays `/sounds/long-pop.wav` (both supplied by the team). Old `new-lead.mp3` / `update.mp3` / `page-load.mp3` left on disk, no longer referenced.
- `NotificationCenter.tsx`: corner toast stack capped to the latest TWO cards (was 3–4) so notifications surface one/two at a time, not a blast.
- `NotificationCenter.tsx`: toast cards restyled — icon circle, bold title, coloured tag chip + humanised channel chip, time-ago, "View lead →" link, dismiss X. Width pinned to a clean 340px (reference panel was too wide).
- `NotificationCenter.tsx`: new frosted-glass "View all notifications (N) →" button beneath the cards, opens the Recent Activity drawer.
- Deploy version now auto-increments and PERSISTS. Root cause: `set-build-time.js` bumped the patch at build time but never committed it, so every deploy reset to the same `0.0.23`. Fix: version is bumped at commit time via new `scripts/bump-version.js` (carry at 100: `0.0.99 → 0.1.0`, `0.99.99 → 1.0.0`), wired through a `.git/hooks/pre-commit` hook that fires on any commit touching `brands/windchasers/agent/`. `set-build-time.js` now just stamps the build time and surfaces the committed version (no more double-bump).
- User-facing: distinct pop sound on new leads/updates, longer pop on home-page load, tidier/narrower notification popups with a one-tap "view all", and a deploy version that visibly climbs every release.
- (feature code `556e15ee`, version automation `8a4e0231`)

- The page-load "ready" cue fired on dashboard mount before any user interaction, so the browser autoplay policy rejected `Audio.play()` and the `.catch()` swallowed it silently — sound never played on a cold load.
- `sound-prefs.ts`: on a blocked play, arm a one-shot `pointerdown`/`keydown`/`touchstart` listener that retries the cue on the first user gesture. New-lead/update already worked (they fire after interaction); now page-load plays the instant you touch the page.
- User-facing: the dashboard page-load sound now works on a fresh load.

## 2026-06-15 17:50 IST · Windchasers: custom mp3 notification sounds + per-event volume

- New-lead and update cues now play a custom `mario.mp3` (`new-lead.mp3`, `update.mp3`); retired the synthesized `update.wav`.
- Page-ready cue now uses custom `agrege.mp3` (`page-load.mp3`), played at 0.35 volume — the raw file was too loud.
- Added per-event playback gain `SOUND_VOLUME` in `sound-prefs.ts` (new/update 1.0, ready 0.35).
- `gen_notification_sounds.py` updated: all three live cues are custom mp3s now; synthesis helpers kept as fallback only.
- User-facing: new-lead + lead-update play the Mario cue; page-load plays a quieter chime.

## 2026-06-15 11:12 IST · Windchasers: Humans is now a top-level nav item (full team management)

- Promoted Humans from a tab inside Agents to its own sidebar item, directly below Agents (/dashboard/humans).
- It opens the full team-management screen — invite, role, deactivate, and last-active/last-login per person (the existing UserManagement, reused). "Manage team" now lives under Humans.
- Removed the read-only Humans tab from the Agents page (and HumansTab.tsx).

## 2026-06-15 10:50 IST · Windchasers: "Humans" tab under Agents (the managing team)

- Added a Humans tab on the Agents page — the real people managing leads alongside the AI agents. Lists active team members (name + email) from /api/dashboard/team-members, with a "Manage team" link to Configure → Users. Read-only roster; add/remove/roles stay in Configure.

## 2026-06-15 10:44 IST · Windchasers: fix booking date parse ("25th june" was landing on tomorrow)

- "Demo booked 25th june 3pm" was recorded as the Key Event on Jun 16 (today+1). resolveBookingDate couldn't parse "25th june" (native new Date() returns Invalid) and silently fell back to tomorrow — same bug for "19-06-2026".
- Rewrote the parser to handle "25 june" / "25th june" / "june 25", DD-MM-YYYY (Indian), YYYY-MM-DD, and DD-MM, with day/ordinal stripping and next-year roll when no year is given and the date already passed. Now "25th june" books Jun 25.

## 2026-06-15 10:33 IST · Windchasers: dark theme default for everyone + current-theme indicator

- Dark is now the default for all users. One-time migration flips any existing light/brand preference to dark (so everyone goes black now); afterwards each user's choice is respected. New users already default to dark. (Theme is per-device — stored in localStorage.)
- Configure → Appearance now shows "Currently running: Dark/Light/Brand" so you can see which theme is active; the Dark/Light switch is right there to change it.

## 2026-06-15 10:26 IST · Windchasers: note bookings record session type + persist (HQ visit = offline)

- A logged note like "wants to visit our HQ on 19-06-2026 around 2:30 pm" was classified Booking Made but the booking was never stored on the lead (only stage + reminders), and the in-person/offline nature was dropped.
- Classifier now extracts session_type (offline for HQ/office/campus/in-person visits, online for video sessions). The BOOKING_MADE action now persists the booking into unified_context.voice (booking_date/time + session_type + status) so it shows as a real booking in Upcoming + the lead pane — an HQ visit lands as OFFLINE.

## 2026-06-15 07:11 IST · Windchasers: note orchestrator Phase 1 — affordability, thin-input, already-done

Reduces PROXe over-acting on shallow free-text notes:
- #8 Affordability is no longer death. New AFFORDABILITY category: "can't afford / too expensive / needs a loan" → stage Nurture (kept alive, score NOT zeroed) + a loan_assistance follow-up task for the team. Removed cost/budget from NOT_POTENTIAL.
- #1 Thin-input guard: very short/vague notes → INFO_ONLY; destructive categories (NOT_POTENTIAL/NOT_INTERESTED) only on a clear statement; a two-word note can't trigger Closed Lost.
- #4 Don't duplicate the human: when a note says the team already reached out ("chaser sent", "message already sent over WhatsApp", "contact shared with team"), PROXe skips its own WhatsApp send + nudge (MEETING_REQUEST) and its missed-call follow-up + 4-step sequence (RNR) — it still logs the call/note.
- Call-back classifier examples extended.

Phase 2 (structured note + propose/confirm step) and Phase 3 (timing/language routing, retire MEETING_REQUEST catch-all) still to come.

## 2026-06-15 06:41 IST · Windchasers: fix "Error logging call" (activities.created_by UUID crash)

- Logging a call (and adding/creating notes) 500'd intermittently with "Error logging call". Root cause: activities.created_by is a UUID column, but the routes passed 'system'/email when the session user was null → Postgres 22P02 "invalid input syntax for type uuid" → the whole log failed.
- Fix: activities.created_by now gets the user id (uuid) or null, never email/'system' — in log-call, admin-notes, and the Add-Lead create route. The readable author is still kept on the unified_context.admin_notes entry (created_by: email).

## 2026-06-15 06:29 IST · Windchasers: lead ownership (dropdown + auto-assign, pane + table column)

- Owner stored in unified_context.owner { id, name, email, assigned_at, assigned_by }.
- Inbox lead pane: "Owner" dropdown (team members + Unassigned) to assign/reassign.
- Leads table: "Owner" column (far right) showing the assigned owner.
- Auto-assign: the first founder to reply to an unowned lead (text or template send) claims it — never overwrites an existing owner.
- New endpoints: /api/dashboard/team-members (any logged-in user; active dashboard_users for the dropdown), /api/dashboard/leads/[id]/owner (set/clear owner).

Booking-trigger reference (what flips a lead to "Booking Made"):
- WhatsApp agent book_consultation — only on explicit consent (yes / tapped slot).
- Inbound demo form (demo_booked) — creates calendar event + demo confirmation.
- Logged note classified BOOKING_MADE — ONLY an actual demo/session booked at a slot.
- NOT a booking: "call back tomorrow" → POST_CALL follow-up; "maybe later/follow up later" → WARM_LATER (90-day check-in).

## 2026-06-15 06:15 IST · Windchasers: call-back no longer misclassified as a booking

- A logged note "He is interested, call back tomorrow" was classified BOOKING_MADE (created a booking reminder, moved the lead to Booking Made, score 80). A call-back is a FOLLOW-UP, not a booking. Tightened the note classifier: BOOKING_MADE only for an actual demo/session/meeting booked at a slot; any plan to call back / follow up is POST_CALL (creates a follow-up, not a booking). Added examples.

## 2026-06-15 06:04 IST · Windchasers: cancel/remove a booked session (dashboard + agent)

- New cancelBooking service: deletes the Google Calendar event (new deleteCalendarEvent), clears the booking from the lead's unified_context + web_sessions (status → cancelled, date/time nulled so it drops from Upcoming/pipeline), and cancels pending booking_reminder_24h / _30m tasks so no reminder fires.
- Dashboard: "Cancel booking" button in the inbox lead pane (with confirm) → POST /api/dashboard/leads/[id]/cancel-booking.
- Agent: new cancel_booking tool + prompt rule — if a customer asks to cancel / can't make it / backs out of a booked session, the agent cancels it (calendar + reminders) and confirms, never leaving a session they backed out of.

## 2026-06-15 05:41 IST · Windchasers: WA booking consent gate (stop force-booking)

- Customer said "don't book online" and only stated a constraint ("available after 6pm") — no confirmation — yet the agent booked Friday 6PM offline anyway. Added a CONSENT TO BOOK gate (overrides the flow): book only on an explicit yes / tapped time; a constraint or preference is NOT consent (offer + ask, don't lock); any refusal ("don't book", "not now", reluctance) = stop, never re-push or re-offer what they refused. Step 4 now requires explicit confirmation before book_consultation.

## 2026-06-14 18:59 IST · Windchasers: WA agent — job-seeker intent + don't force English

- A clear job seeker ("Is this a job? How much does it pay?", in Bengali too) got pilot-training/salary talk ("pay scales are competitive") — misleading. Added a JOB-SEEKER rule: detect employment-framed questions; on first ambiguous one, clarify with buttons ([Pilot training][Looking for a job]); on a confirmed/second job question, be honest ("we're a training academy, not a hiring line") and hand to the team; never quote salaries / imply employment.
- LANGUAGE rule: if the user writes in another language (Hindi/Bengali/etc.), understand and reply in that language — never tell them to rephrase in English (the agent had done exactly that).

## 2026-06-14 18:55 IST · Windchasers: WA agent recognizes aviation acronyms (CHPL etc.)

- A customer asked about "CHPL" (Commercial Helicopter Pilot License) and the agent asked them to define it ("is there a program called CHPL?") — reads as clueless. Added an aviation-acronym glossary to the prompt: CPL/PPL (airplane), CHPL/PHPL (helicopter), DGCA, RTR. Rule: never ask the customer to define a standard acronym; CHPL → treat as the helicopter commercial path and answer with helicopter-training detail.

## 2026-06-14 14:12 IST · Windchasers: fix Ask PROXe upcoming-booking times (UTC shown as IST)

- Ask PROXe listed booking times in UTC but labelled them IST — Allen's 4:00 PM IST booking showed as "10:30 AM IST" (16:00 IST = 10:30 UTC). The brain passed dt.toISOString() (UTC) and the model read the UTC hour as IST.
- Fix: upcoming_bookings now passes a pre-formatted IST string ("Mon, 15 Jun, 4:00 pm IST"); prompt instructs the model to show DATA times exactly, never convert.

## 2026-06-14 14:07 IST · Windchasers: Ask PROXe renders clean HTML tables for breakdowns

- Numeric breakdowns (counts by stage / source / score bucket, all-time splits) were hard to read as text+bullets. The panel renderer now groups consecutive markdown pipe-rows into a real styled <table> (header + bordered rows). Brain prompt updated to emit compact 2-3 column tables for any numeric breakdown, with minimal prose around them.
- Lone/loose pipe lines and separator rows still handled gracefully (no raw pipes leak).

## 2026-06-14 13:17 IST · Windchasers: WhatsApp reply length cap + Ask PROXe table-pipe stripping

- **WA reply length/format**: messages were inconsistent — some clean bulleted, some 3-paragraph walls. Consolidated into one HARD rule: every reply under ~55 words, max shape = 1 lead line + ≤4 short bullets + 1 closing line/CTA. No essays; if there's more, give the key point + offer a call/buttons. Reconciled the conflicting per-section guidance.
- **Ask PROXe renderer**: now strips ALL markdown-table pipes — the model sometimes drops the leading pipe ("New | 130 |"), which leaked before; any pipe line becomes " · "-joined, separator rows dropped. (Pairs with the rename to "Ask PROXe", already live — hard-refresh if you still see "Dashboard Brain".)

## 2026-06-14 13:09 IST · Windchasers: floating buttons use brand token (drop clashing hardcoded colors)

- Eye / bell / Ask-PROXe buttons were three clashing hardcoded colors (gold/blue/purple). All now use the brand token var(--button-bg) with var(--text-button) icons and var(--border-primary) — cohesive + semantic, distinguished by icon only. Unread badge stays red (semantic alert).

## 2026-06-14 13:06 IST · Windchasers: Ask PROXe polish + WhatsApp cost-intent clarifier

- **WA agent — cost intent**: a bare "how much does it cost?" no longer defaults to the ₹80 lakh full-journey answer. If the chat was about DGCA, it answers the DGCA fee; if unclear, it asks once with quick-reply buttons ([DGCA classes][Full pilot training]), leading with DGCA (our product).
- **Ask PROXe (renamed from "Dashboard Brain")**: button tooltip + panel title now "Ask PROXe".
- **Brain output format**: instructed plain text (no markdown tables / ### headings / --- rules); renderer also strips/handles headings, horizontal rules, and table pipes so output stays clean on the phone-sized panel.
- **Loading state**: replaced static "Thinking…" with rotating status ("Pulling lead numbers…", "Reading your pipeline…", …).

## 2026-06-14 12:58 IST · Windchasers: Brain click-through follow-ups

- Brain now returns 2-3 contextual follow-up questions with each answer; the panel renders them as tappable chips. The founder drills down by clicking (e.g. "48 leads today" → "Breakdown by source" → "Lead quality today") instead of typing.
- API appends a parsed "FOLLOWUPS:" line; UI shows the chips under the latest answer and clears them on the next question.
- User-facing: click-click-click exploration of top-level stats.

## 2026-06-14 12:54 IST · Windchasers: Brain formatting + visible floating buttons + At-a-Glance thresholds + narrower Meta Form bubble

- **Brain formatting**: answers rendered literal markdown (** , -). Added a minimal renderer — bold, bullets, paragraph spacing — in the assistant bubble.
- **Floating buttons**: eye / bell / brain were hard to see + tell apart. Now distinct filled colors (gold eye, blue bell, purple brain), 36px, white icons, light border + tooltips.
- **At a Glance thresholds**: colors were alarmist (94% response amber, 11% key-event red). Reset to realistic benchmarks — Avg Score green ≥50, Response Rate green ≥80%, Key Event Rate green ≥8%, Avg Response green ≤5s.
- **Meta Form bubble**: inbox form card was over-wide (78–90%); narrowed to 440px to match normal message bubbles.
- User-facing: dashboard reads accurately at a glance, the Brain is readable, controls are findable.

## 2026-06-14 12:49 IST · Windchasers: WhatsApp booking — wrong date + double "recorded" confirmation

- **Double confirmation fix**: after a booking, a follow-up like "okay" made the agent re-send "Your booking is recorded…" a second time (the false-booking guard skips when a prior booking exists). Added a duplicate-confirmation guard — if no new booking happened this turn and one already exists, the repeat is replaced with a short ack. Confirmed once, never twice.
- **Wrong date hardening**: agent offered Monday but booked Saturday (date recalled from memory, not the offered day). book_consultation now returns a canonical IST `date_label` and instructs the model to confirm with that exact label and to book the ISO date matching the day it offered. Prompt Step 4 gained explicit date discipline (book the day you offered; don't carry over a passed slot) + confirm-once.
- User-facing: bookings confirm the right day, once.
- Note: the date the model passes is ultimately model-chosen; these are guardrails (canonical label + prompt discipline), not a hard server lock on the weekday.

## 2026-06-14 12:34 IST · Windchasers: Dashboard Brain (Sonnet 4.6 Q&A) + Upcoming Events past-leak fix + better cards

- **Dashboard Brain**: ask-anything panel over live dashboard data. Floating ✨ button on the home page (stacked under the eye + bell) opens a right slide-out chat. `/api/dashboard/brain` gathers compact aggregates (lead counts all-time/today/7d, score buckets, pipeline by stage, leads by source, today's new leads, today's status changes, upcoming bookings, conversations today) and answers with **claude-sonnet-4-6**. Read-only, answers strictly from the snapshot. Suggested prompts: "What happened today?", "How many leads today?", "What's my pipeline?".
- **Fix — past events in Upcoming**: the Upcoming Events filter parsed booking times without a timezone and fell back to 23:59:59 for missing times, so same-day-past bookings (and 12h "4:00 PM" strings that parse to Invalid Date) leaked in and rendered as "Past". Now a single IST parser drives filter/sort/datetime — strict future-only.
- **Better Upcoming cards**: show date + time (IST, e.g. "Mon, 15 Jun · 4:00 PM") alongside a relative countdown pill.
- Plumbing: `generateResponse` accepts an optional model override (used by the brain).
- User-facing: founders can ask the dashboard questions in plain English; Upcoming Events no longer shows past sessions.

## 2026-06-13 22:10 IST · BCON: Instagram agent tab in dashboard (branch ig-dashboard-ui)

- Adds `dashboard/agents/InstagramAgentTab.tsx` — Instagram Business connect panel (target @bconclub, PROXe-IG app 734209706078170, basic/messages/comments scopes, redirect to /dashboard/agents) + App-review screencast steps + workflow cards.
- Wires it into `dashboard/agents/page.tsx`: new "Instagram" tab between WhatsApp and Voice.
- Inbox already renders the Social channel, so incoming IG DMs/comments surface there with no change.
- Built on branch `ig-dashboard-ui` (isolated from concurrent BCON work); merge to main for production after review.

## 2026-06-13 21:40 IST · BCON: document META_IG_* env + redeploy to activate Instagram env

- Documents the `META_IG_*` env vars in `brands/bcon/agent/env.production.example` (access token required; app secret, business account id, verify token).
- Push also serves to trigger a fresh Vercel deploy so the newly-set `META_IG_ACCESS_TOKEN` (and `META_IG_BUSINESS_ACCOUNT_ID=17841416558085381`, @bconclub) take effect — Vercel only injects env vars into deployments created after they're set. (`1e9e9cfb`)

## 2026-06-13 21:10 IST · BCON: move Instagram webhook to /api/agent/meta/instagram

- **Restructure**: moved the Instagram webhook route from `agent/instagram/meta` → `agent/meta/instagram`, adopting a provider-first namespace (`agent/meta/<platform>`) so Meta channels group cleanly: `meta/whatsapp`, `meta/instagram`, `meta/facebook`. No logic change — file moved + doc comment updated.
- Meta webhook callback URL becomes `https://proxe.bconclub.com/api/agent/meta/instagram`.
- Note: the live WhatsApp webhook stays at `agent/whatsapp/meta` for now — migrating it to `agent/meta/whatsapp` is a separate coordinated change (must update its Meta callback URL simultaneously).

## 2026-06-13 20:55 IST · BCON: Instagram webhook + sender (Meta App Review env-token path)

- **New**: Instagram (Meta) integration on the BCON PROXe agent, mirroring the proven Windchasers route, adapted to BCON conventions (`getCurrentBrandId()`, BCON-neutral default copy).
  - `/api/agent/instagram/meta` — webhook verify (GET hub.challenge) + POST handler for DMs and comments → unified agent engine → reply. IG users are resolved as leads by their IGSID in `unified_context.social.igsid`, channel `social`. Comment→DM private reply for lead capture, plus a public "sent you a DM" reply.
  - `services/instagramSender.ts` — Graph API send helpers (DM, comment reply, comment→DM private reply, username lookup) via `graph.instagram.com`, token from `META_IG_ACCESS_TOKEN`.
- **Config**: webhook verify-token default set to `proxe-instagram-verify-token` to match the value configured in the Meta dashboard (so verification passes without an env var). Override via `META_IG_VERIFY_TOKEN`.
- Single-tenant env-token path for App Review validation on BCON's own Instagram. Multi-account OAuth connect is a later phase.
- Scope: CORE capability, ported to the BCON brand. (`1d7101ab`)

## 2026-06-13 14:03 IST · Windchasers: fix WhatsApp booking silently lost (stale unified_context clobber)

- **Bug**: the WA agent confirmed "Your booking is recorded…" but the booking vanished — `unified_context.whatsapp` came back empty, lead showed "No upcoming events". Root cause: `book_consultation`/`storeBooking` saves the booking into `unified_context.whatsapp.booking_date` mid-turn, but the engine's post-turn writers (`updateLeadTemperature`, `updateResponsePatterns`) and `businessCrawler.saveIntel` then wrote back a `unified_context` snapshot captured BEFORE the booking, wiping it. (all_leads/whatsapp_sessions have no scalar booking_date column, so unified_context is the only store.)
- **Fix**: all three writers now re-read the latest `unified_context` from the DB immediately before their read-modify-write, instead of spreading a stale in-memory snapshot. Bookings (and any other mid-turn context write) survive.
- **Data**: restored the one affected lead's (Allen Vedaraj) booking — Mon 15 Jun, 4:00 PM, online — into unified_context so it shows again.
- User-facing: WhatsApp bookings now actually stick and appear in the lead's Upcoming + Events.

## 2026-06-13 12:43 IST · Windchasers: fix Add Lead failure + education capture + 2-step modal + send welcome message

- **Bug fix**: "Failed to create lead" — the create endpoint was inserting a `status` column that doesn't exist on `all_leads` (PGRST204). Removed it (matches the known-good inbound-lead insert). Verified against the live DB. Insert error message is now surfaced in the API response for easier diagnosis.
- **Education capture**: the screenshot extractor now also reads education/qualification (e.g. "12th with PCM"); added an Education field to the form; stored in `unified_context[brand].education` so it shows on the lead like form-sourced leads.
- **2-step modal**: Add Lead was too tall — split into "Details" (screenshot + phone/name/email) and "More" (city/course/type/education/note) with Back/Next. Phone still required.
- **Send welcome message**: optional checkbox on step 2 — fires the Meta-approved welcome template to the lead on save (templates are allowed cold, so it works even before they message us). Soft-fails: the lead always saves; a send failure is reported, not fatal.
- User-facing: adding a lead works again; founders can capture education, move through a shorter two-step form, and optionally send a welcome WhatsApp on the spot.

## 2026-06-13 12:29 IST · Windchasers: snapshot button → eye icon, notification bell stacked below it, home-page only

- Today's Snapshot button now uses an eye icon (MdVisibility) instead of the calendar/today icon — both the floating button and the popup header.
- Notification bell moved from beside the snapshot to directly **below** it (stacked, top-right), sized to match (32px).
- Notifications are now **home-page only**: NotificationCenter moved out of DashboardLayout (no longer hovering over Leads/Inbox/other pages) into FounderDashboard. Toasts + sound still pop while on the home page.
- User-facing: cleaner top-right — eye to peek today's snapshot, bell right under it for status changes; nothing floats over the other pages anymore.

## 2026-06-13 12:20 IST · Windchasers: Add Lead (manual + screenshot) + site-wide status-change notifications + home full-screen

- **Add Lead**: prominent "+ Add Lead" button at the far right of the Leads header opens a modal. Enter a lead by hand, OR drop/paste a WhatsApp screenshot — Claude vision reads name/phone/email/city + a summary and prefills the form for review. Dedupes by phone (per brand): re-adding a known number updates that lead instead of duplicating.
  - New: `AddLeadModal.tsx`, `api/dashboard/leads/create`, `api/dashboard/leads/extract-screenshot`; `generateFromImage()` added to `claudeClient.ts`.
- **Status-change notifications**: the dashboard's old "Recent Activity" card is gone; status changes now surface site-wide via a bell (top-right, unread count) that opens a right-side slide-out drawer listing recent changes, plus toasts that pop bottom-right with a sound. Distinct treatment for NEW LEADS (green tag + bright chime) vs UPDATES (stage/score/booking + soft tone). Mute toggle persists.
  - New: `NotificationCenter.tsx`, `api/dashboard/notifications` (lead_stage_changes-backed), sounds in `public/sounds/`. Mounted in `DashboardLayout`.
- **Home page**: removed the "Leads Needing Attention" and "Recent Activity" boxes; remaining sections (At a Glance, metric cards, Upcoming Events) now fill the viewport — Upcoming Events grows to fill leftover space and shows up to 8.
- User-facing: founders can add leads from a WhatsApp screenshot in seconds, and get live notified (with sound) on every lead status change without watching the dashboard.

## 2026-06-10 18:40 IST · Windchasers: AI orchestrator overlay waits for a Done click (stops auto-vanishing)

- The "PROXe AI" overlay that shows what happened after logging a call / saving a note (Classified as…, Sent WhatsApp, Created nudge task, Summary refresh, Done) auto-dismissed after a few seconds, so the operator couldn't read what the AI did or catch anything to fix.
- `LeadDetailsModal.tsx` — removed the auto-hide timers in both the note-save and log-call flows; the overlay now stays until the operator clicks a new **Done** button (shown once the run reaches its Done/Error step). Simple single-step toasts (e.g. "Lead details copied") still auto-dismiss.

## 2026-06-10 18:25 IST · Windchasers: DGCA subjects (4 vs 6) reply now formatted too

- The "4 vs 6 subjects" answer was a flat two-line sentence. Now a formatted breakdown: each track lists its subjects on separate lines with its price and duration.
- `quickReplyMap.ts` — new `dgca_subjects` trigger, ordered AFTER the fee trigger so "6 subjects fees" still returns the fee (with registration) while a bare "4 vs 6 subjects" returns the subject list. Routing verified.
- `windchasers-prompt.ts` — subjects-list format template for the LLM path. (80aa5c7a)

## 2026-06-10 18:10 IST · Windchasers: DGCA fee reply — properly formatted, registration as its own line

- The agent collapsed the DGCA fee into a run-on sentence with errors: "plus ₹20,000" tacked onto each price (it's a separate one-time registration), dropped the subject names, and "3.5 months" (wrong — 4 subjects is 3-4 mo, 6 is 4-5 mo).
- Now a structured multi-line reply: each track (4 Subjects ₹2.35 lakh / 6 Subjects ₹2.75 lakh) on its own block with the subject names and its own duration, and Registration ₹20,000 (one time) on a separate line.
- `windchasers-prompt.ts` — cost section A rewritten with the exact formatted template + rules (registration on its own line, per-track durations, never "3.5 months", never a run-on sentence).
- `quickReplyMap.ts` — the DGCA-fee quick reply uses the same formatted body.
- `brand-facts.ts` — `groundClassesFee` fact corrected (registration is a separate one-time fee, correct durations) and instructs the formatted layout.

## 2026-06-10 17:45 IST · Windchasers: Agents tab — real icons + a visible Connect button

- `InstagramAgentTab.tsx` — the "Connect to Instagram Business" button used `bg-[var(--button-bg)]`, which rendered with no fill on the dark theme, so it looked like plain text. Now a visible Instagram-gradient button with the Instagram glyph. The IG header badge uses the Instagram icon instead of the "IG" letters.
- `agents/page.tsx` — channel tabs now use real icons (globe / WhatsApp / Instagram / mic via react-icons) instead of the `WWW`/`WA`/`IG`/`MIC` text badges.

## 2026-06-10 17:30 IST · Windchasers: Instagram DMs + comments wired into the agent (App Review MVP)

- The Instagram webhook was a stub (verified + logged, never processed). Now it bridges Instagram into the same unified agent as WhatsApp/web, on the `social` channel. Identity is the IGSID (IG users have no phone), so leads resolve/create by `unified_context.social.igsid`.
- `instagramSender.ts` (new) — Graph API send helpers: `sendInstagramDM`, `sendInstagramCommentReply` (public), `sendInstagramPrivateReply` (comment→DM lead capture), `fetchInstagramUsername`. Uses `META_IG_ACCESS_TOKEN` (+ optional `META_IG_BUSINESS_ACCOUNT_ID`).
- `instagram/meta/route.ts` — POST now verifies the X-Hub-Signature (when `META_IG_APP_SECRET` set), dedups, and processes: inbound DM → lead → agent → reply; inbound comment → lead → agent-generated private reply (comment→DM) + a short public reply. GET verify unchanged.
- `promptBuilder.ts` — `social` channel now uses plain-text formatting (no markdown/asterisks, which IG/WhatsApp render literally).
- `inbox/page.tsx` — added a `social` channel filter tab (Instagram convos already render under "all").
- Needs to go live/testable: `META_IG_ACCESS_TOKEN` + `META_IG_VERIFY_TOKEN` in env, the Meta webhook subscribed to messages/comments with our callback URL. Booking-via-IG and button parsing are deliberately out of this MVP.

## 2026-06-10 16:45 IST · Windchasers: agent gives DGCA ground-classes fee, not the ₹80 lakh total

- Bug: asked "Fees structure for DGCA", the agent replied "investment goes up to ₹80 lakh" — that's the full CPL journey, not the ground-classes course fee. Everything cost-related routed to ₹80 lakh.
- Now distinguishes the DGCA Ground Classes COURSE fee from the full-journey investment:
  - 4 subjects — ₹2.35 lakh + ₹20,000 registration (3–4 months)
  - 6 subjects — ₹2.75 lakh + ₹20,000 registration (4–5 months); offline & online
- `brand-facts.ts` — new `groundClassesFee` locked fact (4/6 subject breakdown + registration), injected into the prompt; the `cost` rule now scopes ₹80 lakh to the full journey only.
- `windchasers-prompt.ts` — cost section branches: DGCA-ground-classes fee question → course fee; "cost to become a pilot" → ₹80 lakh investment.
- `quickReplyMap.ts` — a DGCA-fee quick-reply that fires BEFORE the generic ₹80 lakh one, so "fees structure for DGCA" returns the course fee with buttons (4 vs 6 subjects / counsellor / full journey cost). Bare "cost"/"fees" still default to the journey.

## 2026-06-10 16:30 IST · BCON: Notes — allow Demo Taken/Proposal Sent/Nurture stages + cancel tasks on terminal notes

- DB migration `add_demo_proposal_nurture_lead_stages` (BCON prod): added `Demo Taken`, `Proposal Sent`, `Nurture` to `all_leads_lead_stage_check`. These were a LATENT BUG — the admin-note logic already wrote them (DEMO_TAKEN / PROPOSAL_SENT / WARM_LATER categories), but the constraint rejected them, so those stage moves silently failed. Now they stick.
- `admin-notes/route.ts`: NOT_INTERESTED and CONVERTED notes now cancel all pending tasks before closing the lead (matches WC + the existing NOT_POTENTIAL behavior) — a converted/dead lead no longer keeps getting follow-up nudges.
- Note: BCON's note classification + actions already match WC functionally (14/14 categories); the remaining difference is architectural (BCON inline vs WC's shared noteOrchestrator.ts) — deferred to the packages/core extraction so it isn't done per-brand twice. Pipeline board folds the new stages into existing columns exactly like WC (mirror), so no leads are orphaned beyond WC's own behavior.

## 2026-06-10 16:10 IST · Windchasers: agent stops promising a booking time that has already passed

- A WhatsApp lead (prajwal) booked 5:00 PM today; at 6:28–6:30 PM, frustrated ("call now", "it's 6:30 now"), the agent kept robotically replying "your call is booked for today at 5:00 PM, the team will reach out at that time." Two causes: (1) `checkBooking` only looked at `unified_context.web.booking_*`, so WhatsApp bookings were invisible to it; (2) it never compared the booked time to the current IST time, so it had no idea the slot had passed.
- `engine.ts` — `checkBooking` now scans all channels (web/whatsapp/voice/social), normalises the time, and compares the booked moment to NOW in IST wall-clock. It returns an explicit "ALREADY PASSED — it is now {time} IST, do NOT promise a call at {booked time}" when the slot is in the past, or "UPCOMING" otherwise. No longer gated on booking-intent, so a frustrated follow-up still gets the context.
- The existing-booking RULES now branch: if PASSED → apologise warmly, never repeat the old time as if it's coming, offer the next slot or a team callback; if UPCOMING → brief reassurance. Plus: read the customer's tone, never send the same booking line twice.

## 2026-06-10 15:30 IST · Windchasers: booking times showing AM instead of PM

- Bug: a 3:00 PM booking (e.g. SHAIK Juweria Kaif, Jun 12) rendered as "3:00 AM" in the Leads table. Root cause: booking_time is stored in TWO formats — 24h "HH:MM" (web flow) and 12h "H:MM AM/PM" (WhatsApp flow) — and the display parser split on ":" and read the hour as 24h, so "3:00 PM" → hour 3 → "3:00 AM" (the PM was silently dropped). 10 WhatsApp bookings were affected.
- `LeadsTable.tsx` + `LeadDetailsModal.tsx` — new robust `formatBookingTime` that keeps an explicit AM/PM and only converts when the value is bare 24h. Replaces the broken inline parsers in the table chip, the CSV export, and the modal.
- `bookingManager.ts` — storeBooking now normalises booking.time to 24h (`toTime24`) before persisting, so new bookings are stored in one canonical format.
- Data fix (direct DB write, no code): normalised the 10 existing 12h booking_time values to 24h. Verified 0 remain; SHAIK now stored as "15:00" → displays "3:00 PM".
- FLAGGED (not fixed here): the Events/bookings page builds `new Date(date + "T" + time)` and uses `formatTime(bare-time)`, which is invalid for bare time strings — a separate pre-existing issue to address next.

## 2026-06-10 14:50 IST · BCON: LeadsTable SOURCE shows the landing page (3rd line, like Windchasers)

- User-reported: the SOURCE column showed source + entry point but not the page the lead was captured on, which Windchasers shows as a third line. Ported WC's landing-page line 1:1: reads `attribution.page_url` → `raw_form_fields.page_url` → `web.form_submission.page_url`, strips query/hash (utm noise), renders the pathname as a small clickable link (full URL on hover, opens in new tab, ≤28 chars).
- `LeadsTable.tsx` SOURCE cell only; leads with no captured page (e.g. organic WhatsApp/voice) show no third line — same as WC.

## 2026-06-10 14:20 IST · BCON: welcome template now reads what the visitor actually submitted

- BUG (user-reported with screenshot): website form fills triggered the WhatsApp welcome template with "General Inquiry for BCON" + the generic probe — ignoring the service the visitor picked and their business name. Root cause: the website packs both into the `message` field as `"<service-slug> - Brand: <visitor brand>"` (e.g. `"ai-customer-acquisition - Brand: BCON Club"`), but `/api/website` read a separate `service_interest` body field that never arrives, and hardcoded `brand_name: 'BCON'`.
- `api/website/route.ts`:
  - Parses the composite message → `service slug` + `visitor brand`; humanizes the slug ("ai-customer-acquisition" → "AI Customer Acquisition"). An explicit `service_interest` body field still wins if the website ever sends one.
  - Template params now: `service_interest` = the actual service, `brand_name` = the visitor's business (falls back to 'BCON' only if no brand parsed). Probe map unchanged (generic fallback for unmapped services — per-service copy is a later tuning pass).
  - Stores `service_interest` + `visitor_brand` in `web.form_submission`, and the visitor's brand at `unified_context.company` (same key the inbound route uses) so web leads show "Brand · City" in the leads table like WhatsApp leads do.

## 2026-06-05 21:30 IST · BCON: WhatsApp template send — re-engage leads past the 24h window (Inbox Phase B part 1)

- User-facing (Chats): when a lead's 24-hour WhatsApp window expired, the composer was dead and there was NO way to reach them. Now there's a WhatsApp button in the reply bar that opens the approved-template picker (ported from Windchasers, brand-isolated).
  - NEW `WhatsAppTemplatePicker.tsx` — lists Meta-APPROVED templates from `/api/whatsapp/templates` (10-min localStorage cache, key `bcon-wa-template-cache-v1`), parses `{{1}}`/`{{named}}` body variables into input fields, live preview, and a **Test-mode toggle that defaults ON** (sends to the owner test phone, not the lead) so operators can't accidentally fire at customers.
  - `inbox/reply/route.ts` — new `action: 'send_template'`: sends via Meta Cloud API (positional OR named params, language defaults `en` — BCON templates like `bcon_welcome_web_v1` are approved as `en`, not `en_US`), no 24h check (templates legitimately bypass it), logs the rendered text to the conversation with `template_name`/`test_mode`/`test_recipient` metadata so the inbox renders the green template card + TEST pill.
  - `inbox/page.tsx` — WhatsApp trigger button next to the AI button (WhatsApp channel only), picker render + thread refresh on send.
- Closes UI Layer "WhatsApp template picker — MISSING" and Function Layer "WhatsApp templates mgmt — BEHIND" for BCON.

## 2026-06-05 20:55 IST · BCON: website contact-form leads now capture attribution (UTM source was lost)

- BUG: website form leads showed SOURCE = "Web / Contact Form" even when they arrived WITH utm params. The `/api/website` endpoint captured `utm_source/medium/campaign` into `unified_context.web.utm` but never built `unified_context.attribution` — and the LeadsTable SOURCE column reads `attribution.source_label`, so the marketing source never surfaced (fell back to channel + form_type). Confirmed in DB: leads had `web.utm.source` populated (e.g. chatgpt.com) but `attribution` absent.
- `api/website/route.ts`: now calls `buildAttribution` from the utm + form_type + page_url it already receives, and stamps `unified_context.attribution` — set on create, preserve-once on update (immutable origin). So website leads now show their real marketing source (Meta / Google / …) in the SOURCE column, matching inbound + chat-widget + WhatsApp-CTWA paths.
- This was the one lead-ingress path not yet wired for attribution (inbound, chat widget, WhatsApp CTWA were already done). NOTE: existing pre-fix web leads still lack attribution (created before this); a one-time backfill from web.utm can fix them if wanted.

## 2026-06-05 20:30 IST · BCON: Inbox — one universal message renderer for every channel/tab

- User-facing (Chats): message formatting (bold / italics / line breaks) was only applied to WhatsApp + template messages; web (and any other channel/tab) used a fallback renderer that only handled `**double**` asterisks — so a web message with the agent's `*single*` formatting would show raw asterisks. Now EVERY message on EVERY tab renders identically, the way WhatsApp messages do.
  - `inbox/page.tsx`: `renderWhatsAppMarkdown` upgraded to a universal renderer — handles BOTH `**double**` (Markdown) and `*single*` (WhatsApp) bold, `_italic_`, `~strike~`, and newlines. The message body now uses it for ALL channels (dropped the per-channel `whatsapp ? … : renderMarkdown` branch). `renderMarkdown` left in place (no longer the body renderer).
- Matches Windchasers, where the conversation thread renders the same regardless of channel.

## 2026-06-05 20:05 IST · BCON: Inbox — fix invisible message bubbles (real contrast + width cap)

- User-facing (Chats): the customer message bubble was effectively invisible — I had copied Windchasers' `var(--bg-secondary)` fill, but in BCON's dark theme that's #111111 on a #000000 chat pane (no contrast), so customer messages read as naked text sprawling full-width. Now fixed to look like the WC reference.
  - `inbox/page.tsx`: customer bubble fill `bg-secondary` → **`bg-tertiary` (#1a1a1a)** so it actually reads as a card on black; AI (indigo) bubble bumped 0.10 → 0.18 fill / 0.45 border for clear presence. Regular bubble max-width `80%` → **`440px`** (matches WC; bubbles no longer span the whole pane). Template bubble unchanged (already green + visible).
  - `TodaySnapshotButton.tsx`: active range pill used white text on `--accent-primary` (which is white in dark mode) → invisible label. Now uses `--bg-primary` (inverse) for the active label.
- Verified live (dark mode) before shipping this time.

## 2026-06-05 19:40 IST · BCON: Overview parity (part 2) — Today's Snapshot button + endpoint

- The home dashboard was missing Windchasers' "Today's Snapshot" quick-glance — a top-right floating button that opens a modal of recent activity. Ported it, brand-isolated (no aviation PAT / demo / parent-student concepts).
  - NEW `GET /api/dashboard/today-snapshot` — auth-gated, service-role read. Returns, for a time window (today / 7d / 14d / 28d, IST): leads total + **by source** (uses our attribution `source_label`, falls back to first_touchpoint → Meta/WhatsApp/Google/Form/…), score histogram (hot/warm/cold/unscored), events (**bookings, agent replies, calls logged**), and top-5 most-active leads. All DB columns schema-verified before shipping.
  - NEW `TodaySnapshotButton.tsx` — floating button + modal: 4-KPI strip (New leads / Bookings / Agent replies / Calls logged), by-source bars, score distribution, activity, most-active leads (click → opens that lead's inbox). Range segmented control (Today/7d/14d/28d), refresh, skeleton loader. Theme-aware accent (`--accent-primary`) instead of WC's brand gold.
  - Wired into `FounderDashboard.tsx`.
- Completes the Overview parity pass (part 1 = gauge + sparklines, part 2 = this). Aviation bits from WC (PAT submitted, Demos, Parent/Student type) deliberately excluded.

## 2026-06-05 19:10 IST · BCON: Overview dashboard parity (part 1) — Avg Lead Score gauge + taller sparklines

- User-facing (home/Overview): the "At a Glance" Avg Lead Score gauge showed a percentage ("50%"); it's a score out of 100, not a percent. Now renders as a plain number ("50"), matching Windchasers and the per-lead cards.
- The four trend sparklines (Conversations / Engaged / Warm / Total) were cramped at 36px and could render empty; now 48px (matches WC, ~33% taller/more readable) with empty-data guards so they only render when there's data.
- `FounderDashboard.tsx` only — pure UI, no metric/backend changes.
- Part 1 of the Overview parity pass. Part 2 (the "Today's Snapshot" golden button + its endpoint, time-period-aware card subtitles) is next — a larger feature with its own API, done as a separate unit.

## 2026-06-05 18:45 IST · BCON: Inbox aesthetic ported from Windchasers (channel icons, template card, Meta-form card)

- The Inbox visuals were well behind Windchasers. Ported the full rendering treatment (BCON brand-isolated — no aviation/student concepts).
  - **Channel icons** (`ChannelIcon`): were chunky solid-coloured square boxes with white icons. Now clean tinted line-glyphs on a transparent background (web → blue, WhatsApp → green, voice → purple), matching WC — uses the same precomputed CSS tint filters + inactive opacity.
  - **Message bubbles**: three distinct tints (customer → neutral, PROXe AI → indigo, Template → WhatsApp-green) with backdrop blur, instead of one flat purple agent bubble.
  - **Template card**: templates now render as a proper WhatsApp-style card — WA-green header strip ("Template · WA" + channel icon + time), bold template header text, body, and a footer with delivery-status / **TEST →** / **send-failed (hover for Meta's reason)** pills. Quick-reply buttons render stacked + divided, flush to the card (real WhatsApp look).
  - **Meta-form card** (Facebook/Meta lead's first message): was a plain gray wrap-grid. Now a blue Meta-tinted card with a "Meta Form" pill and fields ordered one-per-row (Name, Email, Phone, City, Brand, Type, Urgency, then +N more). Dropped WC's aviation-only Parent/Student distinction.
- Phase A (look-and-feel) of the Inbox parity pass — now actually faithful to the WC reference, not a partial tweak. Phase B (WhatsApp template send + anonymous web visitors) still to come.

## 2026-06-05 18:15 IST · BCON: Inbox look-and-feel — WhatsApp markdown + stacked template buttons

- User-facing (Chats/Inbox): WhatsApp & template messages were rendering raw markdown — literal `*asterisks*`, `_underscores_`, `~tildes~` and no line breaks — so long WhatsApp messages read as a wall of text. Now they render the way the customer actually sees them on WhatsApp.
  - `inbox/page.tsx`: new `renderWhatsAppMarkdown()` (ported from Windchasers) — `*bold*` → bold, `_italic_` → italic, `~strike~` → strikethrough, `\n` → line break. Message body picks the renderer by channel: WhatsApp/template → WA markdown, everything else → existing `**bold**` markdown.
  - Template Quick-Reply buttons now render WhatsApp-style (stacked, divided by hairlines, theme-aware) instead of inline pills, matching how they appear on WhatsApp. Non-template buttons stay inline pills.
- Phase A of the Inbox parity pass (look-and-feel). Phase B (WhatsApp templates to re-engage past the 24h window + anonymous web-visitor conversations) is next.

## 2026-06-05 17:30 IST · Windchasers: Avg Lead Score is a score, not a percentage

- The "At a Glance" Avg Lead Score gauge rendered "50%". It's an average of lead scores (sum ÷ count, out of 100), not a percentage.
- `FounderDashboard.tsx` — the Avg Lead Score RadialProgress now uses a plain-number formatter (`${Math.round(v)}`, showPercentage=false), so it reads "50" instead of "50%". The ring still fills as a 0–100 gauge. Response Rate / Key Event Rate stay as percentages (correct); Avg Response stays "ms".
- Also restored earlier this turn (direct DB write, no code): all 144 lead scores re-derived from the client calculateLeadScore (the modal value) — avg 14→50, warm 5→81 — so the dashboard matches the per-lead cards.

## 2026-06-05 17:20 IST · BCON: web chat widget now captures utm attribution (closes the last attribution gap)

- Web-chat leads previously had no marketing signal (web_sessions store no utm) so they always resolved to Direct. Now the chat widget captures the landing-page attribution and feeds it through to the lead.
  - `ChatWidget.tsx`: new `readLandingAttribution(brandKey)` — reads utm_source/medium/campaign/content/term + page_url + document.referrer from the landing URL, persists to localStorage (`proxe-attr-<brand>`) so it survives in-site navigation and is still present when the visitor converts. Returns null on organic/direct visits (referrer on same host or no utm) → stays Direct. Included in the chat request payload as `metadata.attribution`.
  - `web/chat/route.ts`: reads `metadata.attribution`, builds an `AttributionSignal` (only when there's a real signal), passes it to `updateLeadProfile`.
  - `leadManager.ts`: `updateLeadProfile` forwards the optional `attributionSignal` to `ensureOrUpdateLead` (set-once / preserve-once, same path proven in the inbound E2E test).
- With this, attribution now spans ALL ingress: inbound forms ✅, WhatsApp CTWA ✅, web chat ✅. Web ad leads (utm-tagged) attribute to their real source; organic web stays Direct.

## 2026-06-05 16:55 IST · BCON: leads table — center-align all columns except Lead & Contact

- User-facing: Stage, Active, and Booking cells were left-aligned while their headers were centered, looking ragged vs Windchasers. Now every column except Lead and Contact is center-aligned (header + cell), matching the Windchasers reference.
- `LeadsTable.tsx`: Active header `left → center`; added `text-center` to the Stage, Active, and Booking `td`s (Source/Last Touch/Score were already centered). Lead and Contact stay left-aligned.

## 2026-06-05 16:30 IST · BCON: attribution on web + WhatsApp lead paths (not just inbound)

- Previously only the inbound (Pabbly/Meta-form) path set `unified_context.attribution`; leads created via web chat or WhatsApp had none and showed blank/legacy-fallback in the Source column + modal Attribution tab. Now `ensureOrUpdateLead` (the single chokepoint for BOTH web and WhatsApp lead creation) stamps attribution on every lead — **set once, preserve-once** (never overwrites an existing origin).
  - `leadManager.ts`: new optional `attributionSignal` param + `AttributionSignal` type. Builds attribution via the shared `buildAttribution`; with no signal (typical web chat / organic WhatsApp) `channel` is a platform so it correctly resolves to **Direct** + a channel-level first touch (Web Chat / WhatsApp) rather than faking a source. Stamped on INSERT always; on UPDATE only if missing.
  - `whatsapp/meta/route.ts`: captures Meta's **click-to-WhatsApp (CTWA) ad `referral`** (was being dropped) from the first message and maps it to a real signal — source **Meta**, first touch **WA Click Through**, with campaign/medium/content + the ad `source_url` as page_url/referrer. So WhatsApp leads from ads now attribute to Meta instead of Direct.
  - `attribution.ts`: added optional `referrer` to `AttributionPayload` (rendered as 'Referrer' in the modal). `AttributionSignal` re-exported from `services/index.ts`.
- SCOPING NOTE (honest): web sessions don't currently capture utm/landing-page params at all (0 of 16 rows), so web leads stay Direct until the **chat widget** is taught to read utm params off the landing-page URL — flagged as a follow-up. CTWA attribution will confirm live on the first real ad-click lead (logic reuses the inbound-test-proven resolver).

## 2026-06-05 16:00 IST · BCON: DB fix — `meta_forms` now allowed on `last_touchpoint` (Meta lead inserts were failing)

- **Campaign-blocking bug found via end-to-end inbound test.** The two touchpoint check-constraints on `all_leads` were out of sync: `first_touchpoint_check` included `'meta_forms'` but `last_touchpoint_check` did **not**. The inbound route maps `source:"facebook"` → touchpoint `meta_forms` and sets BOTH first- and last-touchpoint to it on a new lead, so every Meta lead-form submission was rejected with `all_leads_last_touchpoint_check` violation → the lead was lost. Would have silently 500'd every Meta lead once the campaign went live.
- Migration `allow_meta_forms_last_touchpoint` (Supabase, BCON prod `yvkauaiyranysldubnqv`): dropped + re-added `all_leads_last_touchpoint_check` with `'meta_forms'` appended so it matches `first_touchpoint_check`. Purely additive (widens allowed values) — cannot affect existing rows. On a fresh lead first==last touchpoint; last-touch only diverges later when the lead switches channel (e.g. replies on WhatsApp).
- **E2E test PASS:** POSTed a Meta lead-form payload to `/api/agent/leads/inbound` → lead inserts, SOURCE resolves to **Meta Forms**, first touch **Meta Lead Form**, campaign/medium/content/fbclid/landing-page all captured and rendered in both the table SOURCE column and the modal Attribution tab; first-outreach task created. Test lead "ZZ Test Meta Lead" (917411100099) left in place for manual deletion.
- FOLLOW-UP (other brand, not touched): the PROXE brand DB likely has the same `last_touchpoint_check` gap — should be checked before any Meta campaign there.

## 2026-06-05 15:40 IST · BCON: lead modal — new Attribution tab (Source / First touch / Last touch + full UTM)

- The lead detail modal had no attribution view — the source/first-touch captured at intake (see 13:33 entry) wasn't surfaced anywhere in the modal. Added a dedicated **Attribution** tab (5th tab, after 30-Day Interaction), ported from Windchasers and brand-neutral (no aviation/student fields).
- `LeadDetailsModal.tsx` — reads `unified_context.attribution`; renders Source, First touch, Last touch, then rich ad fields (Campaign, Ad/Content, Medium, UTM Source, Ad set ID, Term/Ad ID, Facebook click ID, Reel/Branded ID, Referrer, Captured at) — each row shown only when a value exists. Falls back to legacy `first_touchpoint`/`last_touchpoint` and parses `page_url` query params (fbclid, utm_id, …) when the `utm{}` block is sparse. Landing page shown at the bottom.
- Empty state: "No attribution data captured for this lead." (legacy leads pre-attribution). Type-checks clean (only the 4 pre-existing `template-sync` worker errors remain, not mine).

## 2026-06-05 15:10 IST · Windchasers: REVERT the score-persistence change (regression — tanked Avg Lead Score)

- The earlier score-persistence change recomputed EVERY lead via the `calculate_lead_score` RPC (all had a null `last_scored_at`) and persisted it, overwriting the previously-higher stored scores with this RPC's lower, decay-applied values. Result: Avg Lead Score ~40% → 14%, warm leads ~21 → 5.
- `founder-metrics/route.ts` — reverted to the original read-side backfill: recompute only null/zero scores, in-memory, NEVER persisted. Stops further overwrites. (e8541850)
- KNOWN ISSUE: the first bad load already persisted the lowered scores to the DB, so the dashboard keeps showing low numbers until the stored scores are restored. Restoration needs DB access (MCP currently erroring) to re-seed + verify — will NOT blind-fire another mass re-score.
- The modal/[id]/score alignment from the same change is kept (single-lead on open, safe; self-heals a lead's score when its modal is viewed).

## 2026-06-05 13:39 IST · BCON: LeadsTable column widths — Contact/email no longer too wide (definitive)

- The Contact (phone/email) column was rendering too wide vs Windchasers. Root cause: when the aviation columns were removed, the freed width got spread into Lead/Contact (Contact was 17%).
- Re-set the 8-column `colgroup` to sum to exactly 100% with Contact at **14%** (matching Windchasers), pushing the freed width into the content-heavy columns instead: Lead 20, Contact 14, Source 13, Last Touch 11, Score 7, Stage 13, Active 10, Booking 12.
- `table-layout: fixed` makes these authoritative regardless of email length (email already truncates), so the column sizing is now stable and won't need re-fixing.

## 2026-06-05 13:33 IST · BCON: attribution layer — SOURCE now shows the marketing place (Meta Forms / Google / …), not just the channel

- Ported Windchasers' attribution to BCON (brand-neutral, no aviation/PAT):
  - NEW `lib/services/attribution.ts` — `deriveSource` / `deriveFirstTouch` / `buildAttribution`; resolves the marketing SOURCE (Meta / Google / Instagram / Facebook / …) + first touch (Lead Form / Demo / WhatsApp / …) from utm + inbound source. Platforms (web/whatsapp/voice) are rejected as sources. Exported from `services/index.ts`.
  - `/api/agent/leads/inbound` — now writes `unified_context.attribution` on lead creation (utm_source / campaign / form_type → source + first_touch). Set ONCE per lead; never overwritten on later touches (immutable origin).
  - `LeadsTable.tsx` — SOURCE column now prefers the resolved attribution `source_label` (top) + `first_touch_label` (sub); falls back to utm/channel for legacy leads.
- Effect: NEW campaign leads will read e.g. "Meta Forms / Lead Form" with the campaign. Existing leads with no utm still read "Direct" — honest, no marketing signal to invent.
- Next: surface the attribution/source section inside the lead detail modal.

## 2026-06-05 13:20 IST · BCON: fix LeadsTable column widths (regression from aviation-column removal)

- Removing the two aviation `<col>` entries earlier left the `colgroup` summing to ~83%, so `table-layout: fixed` stretched the remaining columns and the table looked misaligned.
- Rebalanced the 8 columns to sum to 100% (Lead 18, Contact 17, Source 14, Last Touch 12, Score 7, Stage 12, Active 9, Booking 11), giving Source + Last Touch extra room for their two-line content.

## 2026-06-05 13:02 IST · BCON: richer LeadsTable — city+date in Lead, two-layer Source (like Windchasers, no aviation)

- Brought BCON's leads table up to the Windchasers richness the team expected, without any aviation/student content.
- **Lead column**: now shows the lead-in **date** under the name/company·city line; broadened the `city` lookup so it also reads the top-level `unified_context.city` that `/api/agent/leads/inbound` actually writes (previously only checked channel profile blocks, so inbound city wasn't showing).
- **Source column**: now two layers like Windchasers — marketing source badge (top) **+ entry-point sub-line** (Lead Form / WA Click Through / Web Form / Ads / etc.), derived from form_type → utm_medium → channel. Tells you *which source* AND *how/which page* the lead came in.
- Last-Touch already showed channel + who-touched-last (@PROXe / user) — unchanged.
- No flags, BCON-only code; no first-touch column (that lives in the lead detail model, per design).

## 2026-06-05 12:48 IST · BCON: remove Windchasers aviation columns from LeadsTable entirely (not just gate them)

- Per brand isolation, BCON shouldn't carry the aviation Type/Course logic at all — even gated. Removed the `showAviationColumns` flag and every gated block from BCON's `LeadsTable.tsx`: the Type + Course column headers and data cells, the User Type (Student/Parent/Professional) and Course (DGCA/Flight/Heli/Cabin/Drone) filter dropdowns, their `useState` + filter logic + effect deps, the two `colgroup` entries, the export's aviation header/row branch, and the `colSpan` (now fixed at 8).
- BCON leads table now has one clean column set — Lead, Contact, Source, Last Touch, Score, Stage, Active, Booking — with no Windchasers aviation code path remaining.
- No user-facing change for BCON (those columns were already hidden by the flag); this deletes the dead Windchasers code from the BCON fork.

## 2026-06-05 12:37 IST · BCON: leads table — drop Windchasers "Coaching PROXe" Instagram label (brand leak)

- BCON's `LeadsTable.tsx` source badge mapped Instagram/IG leads to "Coaching PROXe" (a Windchasers coaching-campaign label) — wrong for the BCON business club.
- Relabeled Instagram/IG → "Instagram" and removed the Windchasers-only `coachingproxe` utm_source mapping.
- Checked the aviation Type/Course/PAT columns + course/type filters: already brand-gated out for BCON (`showAviationColumns = brandId === 'windchasers'`), confirmed live on proxe.bconclub.com — no change needed there.
- User-facing: Instagram-sourced leads now read "Instagram" on the SOURCE column instead of "Coaching PROXe".

## 2026-06-05 11:59 IST · BCON: dashboard sidebar parity with Windchasers (nav order, Chats rename, pinned logo, icon-drift fix)

- Brought BCON's `DashboardLayout.tsx` sidebar up to the current Windchasers design, keeping BCON's brand (name "BCON", `/bcon-icon.png`, theme — no Windchasers content pulled in).
- Nav reordered Overview → Leads → Chats → Pipeline; "Conversations" renamed to "Chats"; inbox detection switched to href-based so the rename doesn't break the unread badge.
- Header: brand logo now sits in the same fixed 40px leading column as the nav icons (slimmer header) so it never shifts between collapsed/expanded.
- Nav icons pinned in a fixed 40×20px box with 20px label line-height — stops the icon vertical drift on hover-expand. Hover rail narrowed to 184px.
- User-facing: cleaner, non-drifting sidebar matching Windchasers; "Chats" label.
- Scope: UI/structural only — no data or functional changes; HealthBar + auth heartbeat intentionally NOT included (BCON lacks those components/routes; separate slices).

## 2026-06-04 14:30 IST · Windchasers: Avg Lead Score — persist scores, stop recomputing every load, align with the per-lead value

- Problem: the dashboard recomputed the whole null/zero lead base on every metrics cache-miss and never saved the result (redundant work forever), AND the stored value came from the SQL RPC while the per-lead score users see comes from the client `calculateLeadScore` — so the average never matched the lead cards. (The scorer is keyword/SQL-based, not an LLM call — so it's DB load, not token burn — but the waste was real.)
- `founder-metrics/route.ts` — now recomputes only leads whose `last_scored_at` is missing or older than a 6h TTL (freshly-scored leads, even legit 0s, are skipped), and PERSISTS what it computes via the service client (write-through) + stamps `last_scored_at`. Subsequent loads read the saved value. A lead left untouched past the TTL gets re-scored, so it decays colder over time (score factors days-inactive).
- `dashboard/leads/[id]/score/route.ts` + `LeadDetailsModal.tsx` — the modal now sends the client-computed (user-visible) score in the POST body, and the route persists THAT value (plus `last_scored_at`) instead of only the divergent RPC value. So opening a lead refreshes + saves the exact score shown, and the dashboard average converges on what users actually see.
- Net: scores are computed once and saved; the dashboard reads stored values; opening a lead refreshes it. No runner needed. (Note: 4 pre-existing TS errors in founder-metrics are unrelated and non-blocking.)

## 2026-06-04 14:05 IST · Windchasers: calendar-sync banner no longer alarms when Google isn't connected

- The Events calendar auto-syncs on page load; with no Google creds the sync route returned a 503 and the UI showed a red "Google Calendar Sync Failed" banner every time — alarming for what is an optional, unconfigured integration (bookings are stored in our own DB regardless).
- `api/calendar/sync/route.ts` — when creds are absent, returns 200 with a typed `{ configured: false, message }` instead of a 503 error.
- `BookingsCalendar.tsx` — auto-sync on load is now silent (passes `isAuto`); the "not connected" case shows nothing on load and only a quiet neutral (gray, info icon) note if the user clicks Sync themselves — never the red banner. A genuine sync failure also stays silent on auto-load and only surfaces on a manual sync. Real errors (creds present but Google API fails) still show as before when the user clicks Sync.

## 2026-06-04 13:25 IST · Windchasers: Google Ads source badge → purple

- The Google Ads badge in the Leads SOURCE column rendered an indigo close to Meta Forms' blue, so the two were hard to tell apart at a glance.
- `LeadsTable.tsx` — Google Ads now uses a distinct purple (#A855F7), applied via a label-based override so it wins no matter which branch resolved the badge color (mapped source, generic attribution-label fallback, etc.). Google Organic stays red, so paid-vs-organic Google also reads clearly. Meta Forms stays blue.

## 2026-06-04 13:15 IST · Windchasers: stop the vertical drift on sidebar expand

- The remaining shift on open was vertical: collapsed, each nav row's height was set by the 16px icon; expanded, the label's ~20px line-height made every row ~4px taller, so the icons drifted downward as the rows grew. (Not the dividers — those render identically in both states.)
- `DashboardLayout.tsx` — gave the icon leading box a fixed 20px height and pinned the label line-height to 20px, so a row is the same height whether it shows the icon only (collapsed) or icon + label (expanded). Rows no longer change height, so nothing shifts down on open. Header was already fixed-height, so the logo stays put too.

## 2026-06-04 13:05 IST · Windchasers: sidebar header simplified + narrower rail + pinned logo

- `DashboardLayout.tsx`:
  - The header swapped a centered logo (collapsed) for left-aligned bold text (expanded), so the top anchor jumped on expand — which read as "finicky / not exact" even though the nav icons were already pinned. The logo now lives in the SAME 40px leading column as the nav icons (center pinned at 28px), so it never moves; only the brand name reveals beside it.
  - Header slimmed: padding 10px → 6px 8px, min-height ~44px. Brand name simplified from `text-xl font-black` (20px/900) to 15px / weight 600. Collapse/close buttons toned down (size 20 → 18, muted colour).
  - Expanded rail narrowed 220px → 184px so labels just fit instead of floating in extra width.

## 2026-06-04 12:50 IST · Windchasers: At-a-Glance sparklines — taller, livelier spikes

- The trend mini-charts read as flat and low ("looks like no movement / not enough leads"). Two causes: `type="basis"` (a smoothing spline that doesn't touch the data points, so a lone spike gets averaged down) and no pinned Y domain (small daily movement squished into a thin band under one dominant spike).
- `MicroCharts.tsx` (Sparkline) — curve switched to `monotone` so spikes reach their true peak; added a hidden `YAxis` whose domain is pinned to the series' own min→max via a new `amplify` knob (default 0.85) so every day's movement fills most of the height with a little headroom. Flat series get a guaranteed visible band. Lower `amplify` later once real volume makes the lines naturally full.
- `FounderDashboard.tsx` — the four At-a-Glance card sparklines (Conversations, Engaged, Warm, Total) grew 36px → 48px so the taller spikes have physical room. Only these four use Sparkline, so no other chart changes.

## 2026-06-04 12:35 IST · Windchasers: sidebar icons no longer shift on hover-expand

- The nav icons jumped ~4px when the rail expanded because three things swapped between collapsed/expanded states at once: nav padding (0→8px horizontal), item margin (6→4px), and the item flipped from `justify-center` + `10px` padding to `justify-start` + `7px 12px` (icon moved from centered to left-aligned).
- `DashboardLayout.tsx` — Pinned the icon Supabase-style: the icon now lives in a fixed 40px leading box (centered, identical in both states), the item is `justify-start` always with `0` left padding, and nav padding + item margin + vertical padding are constant. The icon's X (28px) and Y never change — only the label reveals on expand. Children indent via expanded-only left padding.

## 2026-06-04 12:20 IST · Windchasers: sidebar nav — reorder + rename

- `DashboardLayout.tsx` — Nav order is now Overview · Leads · Chats · Pipeline (Leads moved above Conversations). Renamed the "Conversations" item to "Chats"; route is unchanged (/dashboard/inbox). Re-keyed the unread-badge `isInbox` check on the href instead of the label so the rename can't break it. (ffea729b, d536d736)

## 2026-06-04 12:00 IST · Windchasers: WhatsApp booking no longer blocks on email

- Found while verifying bookings: several flows (Ozzy, and the Thanzeel test) reached the slot-selection step then stalled at the agent's "drop your email to lock it in" ask — the tester never sent an email, so book_consultation never fired and nothing booked. Not a persistence bug; the agent was gating the lock on an email.
- On WhatsApp the phone is ALWAYS known and book_consultation only needs phone OR email, so the email gate was pure prompt behavior costing completed bookings. Per founder direction (form leads usually already carry the email; phone is guaranteed on WhatsApp), the agent now locks the slot on time-selection using the known phone, uses name/email from the form when present, and asks for a missing email only AFTER booking as an optional add-on.
- `windchasers-prompt.ts` — Step 3 + the booking hard-rule rewritten: never block the booking waiting for an email; lock first, ask email after.

## 2026-06-04 11:50 IST · Windchasers: snapshot "Demos booked" was missing WhatsApp/voice bookings

- Symptom: the Today snapshot showed Demos booked = 2 when 6 were booked today. The count only inspected `unified_context.web.booking` — the legacy web-only object shape — so every WhatsApp and voice booking was invisible. storeBooking persists bookings as `unified_context.<channel>.booking_date` (scalar) under web/whatsapp/voice; WhatsApp/voice never get the `web.booking` object the snapshot was reading.
- `today-snapshot/route.ts` — demo detection now scans all three channels and both shapes (scalar `booking_date` or legacy `booking.date`), counts each lead once, and windows on the booking's own timestamp when present, falling back to `metadata.booking_confirmed_at` then lead `created_at` for older bookings. Verified against the DB: today now resolves to 6 (was 2).
- `bookingManager.ts` — storeBooking now stamps `booking_created_at` (IST) into `unified_context.<channel>`, so future bookings window precisely instead of relying on the lead-creation fallback.

## 2026-06-04 11:30 IST · Windchasers: never offer an already-booked slot

- Symptom: the agent offered 3:00/4:00/5:00 PM, and only after the customer tapped 3:00 PM did it bounce with "3:00 PM is booked." check_availability already returns only open slots, but the LLM sometimes parrots the prompt's example menu instead of the tool's filtered list, so a booked slot leaked into the buttons.
- `engine.ts` — check_availability now records the open times it returned (date + available display times). After generation, those drive a deterministic strip of any time-slot the LLM still offered that isn't actually open.
- `quickReplyMap.ts` — new `stripBookedTimeSlots()`: removes `[BTN: <booked time>]` buttons (so a booked slot is never tappable) and, only when it actually removed one, scrubs that time from the prose enumeration too. Non-time buttons preserved; messages with no booked slot are byte-identical; no-ops when check_availability wasn't called (never invents availability). Unit-validated on the screenshot case + middle-slot + clean/no-op cases.
- `windchasers-prompt.ts` — Step 2 now tells the agent NOT to list times in the sentence (the buttons carry them) and to treat any time not in the tool's list as booked.
- Net: a booked slot can no longer be offered or tapped; book_consultation's re-check remains the final backstop.

## 2026-06-04 11:00 IST · Windchasers: storeBooking THROWS on failed persist (no more silent false bookings)

- `bookingManager.ts` — storeBooking previously logged "data may be lost" and returned void when it couldn't resolve a lead or the update failed, so book_consultation assumed success and the agent confirmed "recorded" with nothing saved (the guard couldn't help because the tool reported success). Now storeBooking THROWS on both failure modes → book_consultation returns success:false → the agent gives the honest "team will confirm" message and the lead is flagged, instead of a false confirmation.
- Recovered Samchok's booking (Fri 16:00); flagged it — Samchok + Ryan both requested Fri 4 PM, team to reschedule one.
- (a40536d0)

## 2026-06-04 10:50 IST · Windchasers: booking — fix false "recorded" + harden persistence

- `engine.ts` — ROOT cause of bookings showing "recorded" but not saving: when the confirmation copy changed to "Your booking is recorded…", the hallucinated-booking guard still only matched the OLD phrases ("is locked", "booking confirmed"), so a book_consultation that didn't actually persist sailed through with a false confirmation. Guard now matches the current wording (booking is recorded / you're all set / looking forward to…). On a failed/unpersisted booking it overwrites with an honest "I couldn't lock that slot, the team will confirm" and flags the lead.
- `bookingManager.ts` — Hardened storeBooking: wrapped updateLeadProfile + the session fetch (which reference columns whatsapp_sessions lacks) so they can't abort the save; channel-safe session select; added a sessionId-phone fallback (wa_meta_<phone>) and a CRITICAL log when a lead still can't be resolved.
- Recovered Ryan's lost booking (Fri 2026-06-05 16:00) + email.
- (54a5b162)

## 2026-06-04 10:35 IST · Windchasers: Meta-form card — normal width + Parent/Student tag

- `inbox/page.tsx` — Dropped the full-width stretch (max-w-78%, sizes to content) and added the form type (Parent/Student) chip next to the "Meta Form" badge, derived from the fields (child question → Parent). The literal Meta form name isn't in the message, so the type is the practical "which form" indicator.
- (0c16f877)

## 2026-06-04 10:30 IST · Windchasers: redesign the inbox Meta-form card

- `inbox/page.tsx` — Form Submission card redesigned: blue Meta tint + "Meta Form" badge (so it reads as "from Meta" like agent bubbles read green), fields in a clean vertical order (Name, Email, Phone, City, Timeline) with the rest under "+N more fields". Parser fix: `what_is_your_age?_:` (question mark + stray underscore before the colon) now splits into its own Age field instead of mashing into Timeline.
- (86978394)

## 2026-06-04 10:20 IST · Windchasers: no em dashes in any WhatsApp message

- `whatsapp/meta/route.ts` — cleanResponse already strips em/en dashes from LLM replies, but hardcoded/quick-reply messages (e.g. the form-lead opener) bypass it. Added the same strip to sendAndLogReply so EVERY outbound WhatsApp message is dash-free, and reworded the form-lead opener to drop its em dash.
- (dd62ca53)

## 2026-06-04 10:10 IST · Windchasers: distinguish Google Organic vs Google Ads in attribution

- `attribution.ts`, `LeadsTable.tsx` — Plain `google` source (a google.com referrer with no gclid/UTM) now labels "Google Organic" instead of "Google"; paid clicks (google_ads/googleads from gclid/utm_medium=cpc) stay "Google Ads". Backfilled the existing google lead's stored source_label to "Google Organic" so the attribution panel reflects it.
- (f58ef284)

## 2026-06-04 10:00 IST · Windchasers: stamp Parent vs Student lead-type from Meta form fields

- `whatsapp/meta/route.ts` — Meta form leads are now typed Parent vs Student from the form FIELDS (the form name itself isn't in the message). Parent forms ask about "your child"; student forms ask the person's own age / 12th completion. Stored as unified_context.windchasers.user_type, which the Type column + Today's-snapshot breakdown read. Backfilled existing form leads (12 Student; parent leads already typed).
- (5f2dffba)

## 2026-06-04 09:50 IST · Windchasers: leads table — sticky header, no active-time bump on edit, came-in date

- `LeadsTable.tsx` — (1) The sticky table header rode away on scroll because the scroll container was a flex child without `min-h-0`, so the page scrolled instead of the container. Added `min-h-0` so it scrolls internally and the header stays put. (2) Added the lead's came-in date under the name in the LEAD column.
- `api/dashboard/leads/[id]/route.ts` — Manual dashboard edits (name/email/city) were setting `last_interaction_at = now`, making the "Active" column jump to "now" on every edit. Removed that bump — `last_interaction_at` is the customer's last activity, not an edit timestamp (the edit is already recorded in last_actor + the activities audit).
- (2c532fe8)

## 2026-06-04 09:40 IST · Windchasers: form/ad leads get a DETERMINISTIC probing first reply (no academy dump)

- `whatsapp/meta/route.ts` — Despite the prompt rule, the LLM kept answering a form lead's first message with the academy description + full program list ("airline pilot training, helicopter, cabin crew, type rating…") because the form mentions pilot training. Prompt instructions are probabilistic, so this couldn't be guaranteed. Now the first reply to a form/ad lead is HARD-INTERCEPTED before the LLM runs: greet by first name + a single probing question + tappable buttons [How to start] [Timeline] [Cost] (parent-aware variant for child leads). The LLM never generates the form-lead opener, so it can't dump programs again. Also delivers the quick-reply buttons requested earlier.
- (85316633)

## 2026-06-04 09:30 IST · Windchasers: pipeline score matches the rest of the dashboard

- `dashboard/pipeline/page.tsx` — The pipeline read the raw stored `lead_score`, which is 0/stale for many leads (AI scoring never ran), while the leads table + lead detail show the client-side `calculateLeadScore` (message-aware). So the pipeline showed 0 for leads that actually have a real score (e.g. Srushthi: stored 0, calculated 72). The pipeline now computes `calculateLeadScore` for its leads (same as the leads table, with stored-score fallback) and uses it for the score dot, sorting, and the lead modal.
- Note: separately, the stored `lead_score` column itself is stale for many leads — surfaces that read it directly (e.g. founder-metrics Avg Lead Score) will also be affected until leads are re-scored.
- (21d7639f)

## 2026-06-04 09:20 IST · Windchasers: Today's snapshot — Parent vs Student lead-type breakdown

- `today-snapshot/route.ts` + `TodaySnapshotButton.tsx` — Added a "Lead type" block to the Today's snapshot quick view showing Parent vs Student counts for the selected window. Type derived from unified_context user_type (+ "child" form fields → Parent). Sits under "By source".
- (e31ca280)

## 2026-06-04 09:05 IST · Windchasers: capture Meta-form profile (name/email/city) onto the lead

- `whatsapp/meta/route.ts` — Meta lead-form click-through leads now parse the prefill ("key: value" per line) and persist the FORM name (full_name), email, city, age, timeline, and education onto the lead. Previously the form data lived only in the message text, so the lead model showed the WhatsApp account display name (e.g. "Saandi Maalik") with no email/city even though the form had name "Rishi", email, and city Bhiwani. Form name now wins over the WhatsApp account name; email filled only if empty; city/age/timeline merged into the brand profile (what the leads table + lead modal read).
- (e5964e75)

## 2026-06-04 08:55 IST · Windchasers: prevent double-booking the same slot (DB availability check)

- `bookingManager.ts` — Slot availability was determined ONLY by Google Calendar free/busy; with calendar unconfigured, getAvailableSlots returned every slot as available, so two leads could book the same time (e.g. both Jai + Deb at 4 PM today). Added a DB conflict check: getBookedTime24sForDate scans existing bookings (all_leads.unified_context across web/whatsapp/voice + web_sessions) and marks taken slots unavailable, in both the no-calendar and calendar paths. The engine already re-checks availability at book time, so a taken slot is now rejected and the agent offers another.
- (039a1ad6)

## 2026-06-04 08:45 IST · Windchasers: booking persistence — resolve lead by phone (WhatsApp fix)

- `bookingManager.ts` — Root cause of WhatsApp bookings never saving: `whatsapp_sessions` has NO `external_session_id` column (keyed by id / customer_phone_normalized), but storeBooking resolved the lead by `external_session_id`. That lookup silently failed for WhatsApp → leadId stayed null → the all_leads update was skipped entirely → booking dropped, while every error was swallowed so the agent still said "recorded". Now: the session lookup is guarded to web_sessions (where the column exists), and a PHONE fallback resolves the lead via all_leads.customer_phone_normalized (reliable on WhatsApp, safety net everywhere). Bookings now persist to unified_context → show in Key Events / UPCOMING.
- (6da69f25)

## 2026-06-04 08:30 IST · Windchasers: Meta-form source label wording → "Meta Forms" / "WA Click Through"

- `attribution.ts`, `LeadsTable.tsx` — Source pill copy: top "Meta Forms", bottom "WA Click Through" (was "Meta Form" / "WhatsApp Click-through"). Updated the 9 backfilled leads' stored labels to match.
- (6e32b61d)

## 2026-06-04 08:25 IST · Windchasers: booking persistence fix + Meta-form source labels

Booking persistence (`bookingManager.ts`, `windchasers-prompt.ts`):
- FIX: bookings silently saved nothing. storeBooking wrote booking_date/booking_time to all_leads (which has NO such columns — only web_sessions does); Supabase rejected the WHOLE update, including the unified_context write the dashboard reads, and the error wasn't checked. storeBooking returned without throwing, the engine assumed success, and the agent said "Done" while nothing persisted. Now persists via unified_context.<channel> only (what the dashboard/pipeline/score routes read) + logs failures.
- Prompt: after a successful book_consultation the agent says "Your booking is recorded for {date} at {time}. Someone from our team will get back to you to confirm this." — calendar-invite promises explicitly banned (we don't send them right now); the "team will confirm" line is only ever the post-booking confirmation, never a deflection.
- Note: existing un-saved bookings aren't recovered; fix applies to new bookings.

Meta-form attribution labels (`attribution.ts`, `whatsapp/meta/route.ts`, `LeadsTable.tsx`):
- Source pill for Meta lead-form "Chat on WhatsApp" leads now reads top "Meta Form" / bottom "WhatsApp Click-through" (was the long single "Meta Forms Click-through"). first_touch key whatsapp_clickthrough.
- Backfilled 9 existing form-click-through leads (were wrongly "Direct") to the new attribution.
- (booking bb3b50ff, labels 6db08b71)

## 2026-06-04 08:10 IST · Windchasers: WhatsApp agent retries empty responses (fewer dead-end fallbacks)

- `whatsapp/meta/route.ts` — Long multi-part questions were producing an empty AI response (or being killed at the 30s function limit), so the agent sent the canned "Hey! Give me a moment, I'll have someone from the team get in touch" fallback — which dead-ends (it only sets needs_human_followup, and no worker acts on it). Now: empty responses RETRY once before falling back, and maxDuration raised 30s → 60s so big prompts + the retry have room.
- Does NOT change the exception path (e.g. a booking step that throws on "Yes") — that still falls back; retrying a throw risks half-applied side effects. Tracked separately.
- (01cb3e25)

## 2026-06-04 07:55 IST · Windchasers: "when do classes start" must give the batch date, not eligibility

- `windchasers-prompt.ts` / `windchasers-web-prompt.ts` — Hardened the batch-start handling. "When do classes start?" was still being answered with eligibility requirements ("once you're eligible — 12th pass with Physics & Maths, Class 1 medical"). Now any start/begin/next-batch/"when can I join" question is treated strictly as a DATE question → "Our DGCA ground classes start on the 7th of every month — next batch on the 7th of next month." Added an explicit prohibition on answering it with eligibility, and an optional one-line clarifier if which-classes is genuinely ambiguous.
- (4b84f816)

## 2026-06-04 07:38 IST · Windchasers: agent behaviour, inbox display, attribution, booking detection

Agent behaviour (`brand-facts.ts`, `windchasers-prompt.ts`, `windchasers-web-prompt.ts`):
- BATCH SCHEDULE locked fact: "a new batch starts on the 7th of every month". Agent must answer the batch-start question directly instead of "depends on readiness" / deflecting to a counsellor.
- NAME HANDLING guard (rule #7, both channels): "NAME and I" / "I'm NAME" / a bare name = ONE person (the sender). Never "you and NAME" or "both of you" — fixes the "you and Vivan" blunder where one person was treated as two.
- Also carried (pre-existing in brand-facts, part of the domain migration): website + demo/consultation/assessment CTA URLs moved pilot.windchasers.in → windchasers.in.

Inbox / messaging (`web/chat/route.ts`, `inbox/page.tsx`, `services/utils.ts`):
- Anonymous web sessions now CAPTURE the name the visitor typed in chat onto web_sessions.customer_name (the profile/name extraction was gated on leadId and never ran for anonymous sessions). The inbox list + right panel show that name instead of "Anonymous Web Visitor".
- stripHTML now PRESERVES newlines (collapses only horizontal whitespace) so formatted WhatsApp replies render with their line breaks / bullets / paragraphs in the inbox instead of one wall of text.

Lead staging (`leads/score/route.ts`):
- Comprehensive booking detection: checks nested web/whatsapp/voice booking shapes and treats a booking_date alone as booked. Previously ~2/3 of booked leads never reached Key Events.

Attribution (`attribution.ts`, `LeadsTable.tsx`, `whatsapp/meta/route.ts`):
- New 'meta_forms_clickthrough' source ("Meta Forms Click-through"). Meta lead-form "Chat on WhatsApp" leads are detected from the form-prefill first message and tagged with this source instead of "Direct".

- Note: anonymous-name capture and the newline fix apply to NEW messages/sessions; already-stored data isn't retroactively fixed.
- (agent `e3564b88`, inbox `1da7a09c`, staging `732d430d`, attribution `14771a92`)

## 2026-06-04 05:06 IST · Windchasers: fix empty pipeline + rebuild stage logic

- `api/dashboard/leads/route.ts` — FIX: the pipeline showed 0 leads in every column despite 95 staged leads. The default newsletter-exclusion used a PostgREST `.not('…form_type','eq','newsletter')` filter, which generates `form_type <> 'newsletter'` → NULL (excluded) for every lead whose nested form_type is NULL (i.e. all 95). Replaced with a NULL-safe JS `!== 'newsletter'` post-filter. Pipeline now populates.
- `api/leads/score/route.ts` — Rebuilt auto-staging to a HYBRID (score AND replies) model. Auto only ever sets the behaviour-detectable stages: Booking → 'Booking Made' (Key Events); 3+ customer replies AND score ≥ 50 → 'Qualified'; 1+ reply → 'Engaged'; else 'New'. Removed the old 'High Intent' (score ≥61) and 'Booking Made @ score≥86' auto-assignments. Post-call stages (Call Done, Proposal Sent, Won/Converted, Lost) are now MANUAL-only — already protected by the is_manual_override skip at the top of the handler.
- `dashboard/pipeline/page.tsx` — Column mapping realigned to the new model: 'Call Done' maps to a real manual 'Call Done' value (was wrongly mapped to 'High Intent'); legacy 'High Intent' folds into the Qualified column; 'In Sequence' → New.
- User-facing: the Pipeline page works again and stages mean what they say (a high score no longer masquerades as a completed call).
- Note: thresholds (3 replies / score 50) are intentionally simple and tunable. Existing 'High Intent' leads display under Qualified and re-stage on their next message.
- (3ce2bae2)

## 2026-06-04 04:02 IST · Windchasers: inbox metrics, form display + agent prompt behavior

Inbox (`inbox/page.tsx`):
- Contact-panel "Messages" stat now counts AGENT replies across web + whatsapp (relabeled "Agent Msgs"), instead of customer messages.
- Response rate is now bounded 0–100%: share of customer messages that got an agent reply before the customer spoke again. The old agentMsgs ÷ customerMsgs formula ran over 100% (e.g. 143%) whenever the agent sent more bubbles than the customer.
- Form Submission card parses Meta lead forms cleanly: splits simple labels (first name/phone/email/city) and apostrophe keys (child's …) that previously mashed into one value, stops truncating labels to 15 chars, and surfaces parent-relevant fields (concern, timeline, child's education) in the visible row.

Dashboard (`founder-metrics/route.ts`):
- At-a-Glance Response Rate uses the same bounded definition (was 108% → ~94% on live data). Daily trend point capped at 100%.

Agent prompts (`windchasers-prompt.ts`, `windchasers-web-prompt.ts`):
- Rule #3 extended: don't define/explain ground classes or theory subjects either — acknowledge briefly and ask what they want to know.
- New commerce/arts/non-PCM handling: instead of "doesn't require a commerce background", surface the real Physics+Maths gate and the NIOS bridge (already in brand-facts).
- WhatsApp first-message rules: form/ad leads (incl. the "chat on WhatsApp from the form" path) no longer get the academy info-dump — the agent greets by name, acknowledges parent/child or "just researching", reflects their concern, and asks one focused question.
- User-facing: cleaner inbox, realistic response rates, and better first replies to ad/form leads.
- (inbox `247ca036`, dashboard `90099574`, prompts `381e70a4`)

## 2026-05-31 10:10 IST · Windchasers: At-a-Glance fixes + leads page 50-cap

- `founder-metrics/route.ts` — Avg Lead Score now uses `Math.floor` instead of `Math.round`, so a 40.x average reads 40% (was rounding up to 41%).
- `FounderDashboard.tsx` — Warm Leads card now shows a live warm-rate percentage (warm count ÷ total leads, one decimal) on the 'All' filter, mirroring how the Engaged Leads card shows engagementRate. Period filters still show the period label.
- `LeadsTable.tsx` — leads page was capped at 50 with no way to see more (data layer already loads up to 1000). Default display bumped 50→100 and the limit selector gained 100 / 250 / All options. Score-trend arrow lookup raised 50→250.
- User-facing: founders see all their leads (not just the first 50), Avg Lead Score reads correctly, and Warm Leads shows a percentage like Engaged Leads.
- Scope: Windchasers brand only.
- (240de142)

## 2026-05-31 10:20 IST · Revert: bcon At-a-Glance/leads changes (wrong brand)

- Reverted commit 911da396 — those three dashboard fixes were applied to bcon by mistake; the work was scoped to Windchasers (now shipped separately in 240de142). bcon `founder-metrics/route.ts`, `FounderDashboard.tsx`, and `LeadsTable.tsx` restored to their prior state.
- (981e626c)

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

