# Windchasers — Changelog

> Brand-specific changelog for **Windchasers** (`proxe.windchasers.in`). Company-wide history across all brands lives in the repo-root [`/CHANGELOG.md`](../../../CHANGELOG.md), which currently holds the full Windchasers back-history (pre-2026-06-17) since WC was the original fork. New WC-specific entries go here going forward; notable ones also land in the root log.
>
> Version auto-bumps per commit that touches `brands/windchasers/agent/` (pre-commit hook). Current line: 0.0.59+.

## 2026-06-18 · Home loads instantly (client cache for founder-metrics)

- The home now paints from a cached snapshot in `localStorage` immediately, then revalidates in the background — no more blocking on the heavy `/api/dashboard/founder-metrics` fetch (which cold-starts miss the in-memory server cache on Vercel).
- A failed/blipped refresh keeps the last good data instead of wiping to the error screen.

## 2026-06-18 · Owner assignment is admin-only

- Inbox lead panel: the OWNER dropdown now renders only for admins; non-admins see the owner as a read-only label ("Unassigned" / name). Everyone can still SEE the owner.
- `/api/dashboard/team-members` returns `isAdmin` (caller's role) for the gate.
- `/api/dashboard/leads/[id]/owner` now rejects non-admins (403) — server-side enforcement so the hidden UI can't be bypassed.
- Auto-assign-on-touch (owner = whoever replies/logs) is unchanged — that's the separate "you own what you work" behavior, not manual reassignment.

## 2026-06-18 · Token usage: time-window toggle (24h / 7d / 14d / 30d / All)

- Metering now also writes **per-IST-day buckets** (`byDay`) alongside the cumulative total, so /tokens can sum windows.
- `/api/dashboard/token-usage?range=` sums the last N days; `All` = cumulative since metering began.
- /tokens page got a 24h / 7D / 14D / 30D / All toggle — cost, tokens, calls and the per-area table all refilter to the window.
- Note: per-day buckets start accumulating from this deploy, so 24h/7d show data from now forward; "All" still reflects the full history.

## 2026-06-18 · Pipeline page: funnel-summary view

- New `PipelineFunnel` component at the top of `/dashboard/pipeline` (kanban kept below): Pre-Key (New / Engaged / Qualified, blue) → Key Event banner ("Demo Booked" = Booking Made, purple) → Post-Key (Demo Done / Offer Made / Won, green) → Exit States (No Show amber / Parked gray / Closed-Lost red), plus a metrics row (Key Event Rate, Show-up Rate, True Win Rate, Revivable).
- Counts via per-stage Supabase count queries (no row-cap issues). Cards click through to the leads list filtered by stage.
- Note: Demo Done / Offer Made / Won / No Show / Parked have no DB stage yet, so they read 0 (matches the design); add those stages to make them live.

## 2026-06-18 · Custom dashboard sounds (team-supplied)

- New cues in `public/sounds/`: `notification.mp3` (new lead + lead update) and `page-load.mp3` (page-ready). Replaces the old pop.wav / long-pop.wav mappings.
- Page-load gain raised 0.18 → 0.7 (the old value was suppressing a too-loud file; the new cue is the chosen one). Tunable in `sound-prefs.ts`.

## 2026-06-18 · Cabin-crew welcome routing + agent stops dumping the full menu to cabin leads

- `pickWelcomeTemplate` is now 3-way (cabin → pilot → generic) via a new `isCabinCrewSource()` helper. The cabin path is **flag-gated** (`CABIN_WELCOME_TEMPLATE`, currently null) so it's safe to deploy — cabin leads keep getting the generic welcome until the Meta-approved cabin template name is filled in (an unapproved name would fail-send). Flip the constant to activate.
- WA agent: a KNOWN cabin-crew lead (cabin-crew page/form/course interest) no longer gets the full "pilot / helicopter / cabin / type rating — which interests you?" menu on a broad question; it goes straight to cabin crew with Eligibility / What's covered / How to apply buttons.
- **Pending (Meta side):** create + approve a cabin-crew welcome template (single `customer_name` body param, language `en`), then set `CABIN_WELCOME_TEMPLATE` to its name.

## 2026-06-18 · WA agent: pilot fork = airplane vs helicopter + Visit-Academy sends map

- **Pilot leads no longer asked "pilot / helicopter / cabin crew".** A lead who came via the pilot welcome / pilot assessment / pilot source is already known to want pilot — the qualifier now offers only the real fork, **Airplane vs Helicopter** (`[Airplane][Helicopter]`), and never offers Cabin Crew. Genuinely-unknown leads still get the 3-way path question.
- **"Visit the academy" now sends the academy details + Google Maps link first**, then asks to lock a day — instead of jumping straight to date-picking. Added `location.mapUrl` to brand-facts (swap for the exact Google Business share link when available).

## 2026-06-17 · Home refinements

- **Greeting** shifts by IST time of day; **KPI cards** get a subtle accent tint + matching border; **Follow-up Health** follows its status across the whole card.
- **Engine Overview toggle** now 24h / 7D / 14D / All, and the funnel is a real per-window cohort (Follow-up Due + Booked scale with the window too).
- **Lighter card tint** (7%→4% fill, 22%→14% border); **High Intent Leads** card green not red; **Upcoming Events** trimmed to two lines with a recency-coloured countdown chip.
- Token metering now persists (awaited write; fixed the `dashboard_settings.updated_by` UUID write bug).

_Full Windchasers history before this date: see the root [`/CHANGELOG.md`](../../../CHANGELOG.md)._
