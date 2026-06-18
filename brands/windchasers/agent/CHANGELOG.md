# Windchasers — Changelog

> Brand-specific changelog for **Windchasers** (`proxe.windchasers.in`). Company-wide history across all brands lives in the repo-root [`/CHANGELOG.md`](../../../CHANGELOG.md), which currently holds the full Windchasers back-history (pre-2026-06-17) since WC was the original fork. New WC-specific entries go here going forward; notable ones also land in the root log.
>
> Version auto-bumps per commit that touches `brands/windchasers/agent/` (pre-commit hook). Current line: 0.0.59+.

## 2026-06-18 · WA agent: pilot fork = airplane vs helicopter + Visit-Academy sends map

- **Pilot leads no longer asked "pilot / helicopter / cabin crew".** A lead who came via the pilot welcome / pilot assessment / pilot source is already known to want pilot — the qualifier now offers only the real fork, **Airplane vs Helicopter** (`[Airplane][Helicopter]`), and never offers Cabin Crew. Genuinely-unknown leads still get the 3-way path question.
- **"Visit the academy" now sends the academy details + Google Maps link first**, then asks to lock a day — instead of jumping straight to date-picking. Added `location.mapUrl` to brand-facts (swap for the exact Google Business share link when available).

## 2026-06-17 · Home refinements

- **Greeting** shifts by IST time of day; **KPI cards** get a subtle accent tint + matching border; **Follow-up Health** follows its status across the whole card.
- **Engine Overview toggle** now 24h / 7D / 14D / All, and the funnel is a real per-window cohort (Follow-up Due + Booked scale with the window too).
- **Lighter card tint** (7%→4% fill, 22%→14% border); **High Intent Leads** card green not red; **Upcoming Events** trimmed to two lines with a recency-coloured countdown chip.
- Token metering now persists (awaited write; fixed the `dashboard_settings.updated_by` UUID write bug).

_Full Windchasers history before this date: see the root [`/CHANGELOG.md`](../../../CHANGELOG.md)._
