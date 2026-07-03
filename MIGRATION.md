# One-Core Migration — plan of record

Branch: `migrate/one-core` (main untouched until every brand builds green locally).
Target defined in `ARCHITECTURE.md`. This file = the executable steps + progress.

## Strategy: strangler-fig, verified brand-by-brand (NOT big-bang)
Prove the whole architecture on the CLEANEST brand first (windchasers, 91% identical
to master), then bring the others in one at a time. A brand is "done" only when it
BUILDS GREEN locally against `/core` + its own `/brands/<id>` config + env.

## Assessment (identical vs differ vs brand-only, per brand, vs master seed)
```
windchasers  identical:230 differ:22  brand-only:1   ← cleanest → migrate FIRST
lokazen      identical:205 differ:52  brand-only:11
pop          identical:164 differ:78  brand-only:11  (+ War Room artifact → /modules)
bcon         identical:172 differ:82  brand-only:16  (lead/dev brand)
proxe        identical:47  differ:118 brand-only:2   (interchangeable w/ bcon; do last)
```
Core seed = `master/agent/src` (264 files) — but 77 non-config files carry brand
tokens → must be GENERICIZED as they move into `/core`.

## Build composition mechanism (the linchpin)
ONE Next.js app. Brand chosen at build by `BRAND_ID`:
- `next.config.js` webpack alias: `@/brand` → `brands/${process.env.BRAND_ID}`
- `tsconfig` paths: `@/*` → `core/src/*`, `@/modules/*` → `modules/*`
- Core imports brand data via `@/brand/config`, `@/brand/prompts`, etc.
- Env: GENERIC names (`NEXT_PUBLIC_SUPABASE_URL`), values from `brands/<id>/.env` at build.
- Public assets: `brands/<id>/public` copied to `/public` in a prebuild step.
- Modules bundled; rendered only when `config.flags.<module>` is true (code-split later).
- `package.json`: `build:<brand>` = `BRAND_ID=<brand> next build`.

## Phases
- [x] P0  Clone → `C:\GO PROXe`, branch `migrate/one-core`, assessment
- [ ] P1  Skeleton: `/core` (seeded from master), `/modules`, `/brands/<id>` + build wiring
- [ ] P2  GENERICIZE the 77 brand-tokened core files (read brand from config, not literals)
- [ ] P3  Extract War Room → `/modules/war-room`, Scout → `/modules/scout`
- [ ] P4  Brand #1 = windchasers: config+prompts+env → `/brands/windchasers`; **build green locally**
- [ ] P5  Reconcile windchasers' 22 differing files into `/core` (improve) or `/brands` (specific)
- [ ] P6  Repeat for lokazen → pop → bcon → proxe (build green each)
- [ ] P7  Update the 6 deploy workflows to build-per-brand from `/core`
- [ ] P8  Delete `propagate/reverse-sync/brand-shared.json/sync-fleet/master/` + brand app copies
- [ ] P9  Merge `migrate/one-core` → main; deploy per brand

## Rules while migrating
- Never break a currently-deployable brand app until its replacement builds green.
- Commit at every verified milestone. `git pull` before each session.
- No brand literal enters `/core` or `/modules` — run `bleed-check` as the gate.
