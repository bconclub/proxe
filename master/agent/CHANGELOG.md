# master — Changelog

> Brand-specific changelog for the **master** template (the canonical multi-brand base new brands are created from). Deploys nowhere. Company-wide history across all brands lives in the repo-root [`/CHANGELOG.md`](../../CHANGELOG.md).
>
> Version auto-bumps per commit that touches `master/agent/` (pre-commit hook). Current line: 0.0.6+.

## 2026-06-17 · Cross-brand versioning + changelog

- master now auto-versions on commit (was no bumper; its `generated-version.ts` carried a stale 0.0.56 wrongly copied from the WC file-sync). Reconciled to `package.json`'s real value — first real bump **0.0.5 → 0.0.6**.
- This per-brand changelog added.

## 2026-06-17 · Finished as the canonical multi-brand base

- **Brought to full Windchasers core parity** (was 165 files, stale + non-building): 162 clean core files synced verbatim from WC + the brand-touched lib/app layer ported. `next build` green, 48/48 pages.
- **Preserved master's multi-brand bits**: `configs/*` resolver + `services/supabase.ts` `brandPrefix()` (NOT WC's hard `WINDCHASERS` lock).
- **Brand layer made brand-resolved** so master is a true multi-brand base: `promptBuilder` switches windchasers|bcon by env (default windchasers) instead of hardcoding WC; `leadManager` uses the resolved `BRAND_ID` context key; added `bcon-web-prompt`. Adding a brand = drop in `<brand>-prompt` + one switch case + config + brand-facts, no other core surgery.
- Added deps `resend` + `@vapi-ai/web`; removed an orphaned `StageBadge.tsx`.
