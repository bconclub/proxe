# Changelog

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

