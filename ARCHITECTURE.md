# PROXe — Architecture (the sole truth)

The rule everything follows:

> **A brand is DATA, not a copy of the code.**
> If two brands run the same logic, it exists **once**. If a brand differs, that
> difference is **config, a flag, or an opt-in module** — never a second copy of a file.

Every hour of "propagate / reconcile / it-might-get-wiped" pain came from brands
being *code* (forked folders). This document makes brands *data*. Follow it and
propagation, drift, and cross-brand bleed become **structurally impossible** —
because nothing is ever copied between brands.

---

## 1. The three buckets — everything is exactly one

| Bucket | What | Lives in | "Propagation" |
|---|---|---|---|
| **CORE** | Shared platform (engine, services, dashboard, API, UI). ~90% of the code. Brand-agnostic — no brand name ever appears in it. | `/core` (one copy) | None. Shared by construction. Edit once → every brand has it next build. |
| **MODULE** | Opt-in feature only *some* brands need — War Room, Scout, Brain, Voice. | `/modules/<name>` (one copy each) | None. A brand **turns it on** with a flag. |
| **BRAND** | Pure config/data — name, theme, prompts, templates, flags, secrets, changelog. | `/brands/<id>` (later: a `brands` DB row) | Change a brand's config → only that brand changes. |

**The reframe that kills the bleed problem:** War Room is not "POP's code that must
be kept out of others." It's a **module that exists for everyone and is activated
for POP** (`flags.warRoom = true`). Scout = a module activated for location brands.
Nothing leaks because nothing is copied — features are **toggled, not forked**.

---

## 2. What is BRAND-SPECIFIC (the definitive list)

Everything here lives under `/brands/<id>/` (or that brand's env). Nothing else is.

- **Identity** — display name, slug, tagline
- **Theme** — colors, logo, avatar, favicon, `public/` images
- **Voice** — system / web / voice / WhatsApp prompt files, persona, brand-facts
- **Templates** — WhatsApp Meta template names (`{brand}_welcome_web_v1`), email copy
- **Flags** — which MODULES are on (`warRoom`, `scout`, `voice`, `brain`, `instagram`…)
- **Chat surface** — quick buttons, explore buttons, greeting, placeholder
- **Secrets / connections** (`.env` — GENERIC names, brand values):
  `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, WhatsApp token/phone,
  `VAPI_*`, `GOOGLE_CALENDAR_ID`, domain, `NEXT_PUBLIC_APP_URL`, `CLAUDE_MODEL`
- **Changelog** — `brands/<id>/CHANGELOG.md` (per-brand — already the practice ✓)
- **Seed data** — brand-only demo/seed (POP War Room constituencies)
- **Deploy** — domain / vercel project per brand
- **DB** — its own Supabase for now (connection via env; see §5)

## What is CORE (never brand-specific, never edited per brand)

Engine (`agent-core`), services (leadManager, sessionManager, bookingManager,
whatsappSender, knowledgeSearch…), dashboard shell + shared components, shared API
routes, hooks, lib, utils, supabase client/server plumbing — and critically
**`promptBuilder`**, rewritten to load the prompt from `getBrandConfig().systemPrompt`
**dynamically** (see §4). No more "hand-edit promptBuilder per brand."

---

## 3. The Next.js static-env unlock

Next.js inlines `NEXT_PUBLIC_*` only with **static** keys. That drove the per-brand
copies. Fix: **generic var names, brand-specific values.**

```ts
// core code — ONE static generic key, inlined per build:
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
// brands/bcon/.env  → NEXT_PUBLIC_SUPABASE_URL=https://bcon-ref.supabase.co
// brands/pop/.env   → NEXT_PUBLIC_SUPABASE_URL=https://pop-ref.supabase.co
```
Same core, satisfies the static-key rule, each brand's build gets its own value. No
`NEXT_PUBLIC_BCON_*` hardcodes, so no brand identity baked into shared code.

---

## 4. Target repo structure (one repo, one `main`)

```
/core/                     shared platform, written ONCE
  app/  (dashboard, api, widget)   components/   lib/   hooks/   services/   engine/
  configs/loadBrand.ts     ← reads BRAND_ID → returns brand config + active modules
/modules/                  opt-in features, flag-gated
  war-room/   scout/   brain/   voice/   instagram/
/brands/                   ONLY data per brand (no shared logic)
  bcon/     config.ts · prompts/ · templates.ts · public/ · CHANGELOG.md · .env.example
  pop/      config.ts (flags.warRoom=true) · prompts/ · public/ · CHANGELOG.md
  lokazen/  config.ts (flags.scout=true) · prompts/ · public/ · CHANGELOG.md
  windchasers/ · proxe/
/app-entry                 thin: BRAND_ID → load brand → render /core + enabled /modules
CHANGELOG.md               PLATFORM changelog (core/module changes)
```

New feature you build on bcon → decide the bucket **as you write it**:
core file → everyone gets it; module → opt-in; brand config → bcon only. No later sync.

---

## 5. Database — decoupled from the code

Code reads its DB from env (`NEXT_PUBLIC_SUPABASE_URL` + service key). So:
- **Now:** per-brand Supabase keeps working, zero code forking — it's just an env value.
- **At scale (hundreds/thousands):** one multi-tenant DB, `brand` column + Row-Level
  Security (you already have `brand` columns). Onboard = insert a row, not provision a DB.
- You don't decide this now. Fix the code first; the DB is a config value.

---

## 6. Deploy model

- **Now (bridge, tens of brands):** one `/core`, build per brand — `BRAND_ID=pop npm run build`
  with pop's `.env`. Same source, N builds, N Vercel projects. No copies.
- **Endgame (thousands):** ONE deployment, resolve brand from the **subdomain**
  (`pop.proxe.com` → brand `pop`), load config from a `brands` DB row, render core +
  enabled modules. **Add a brand = one row + a subdomain. No code, no build, no deploy.**

---

## 7. Onboarding a new brand — before vs after

**Before (today):** copy `master/agent/src` → new folder, hand-edit promptBuilder,
hardcode `NEXT_PUBLIC_{BRAND}_*`, keep a whole app in sync forever.

**After (this architecture):** add `/brands/<id>/config.ts` + prompt + `.env`, set flags
for the modules you want. Done. (Endgame: insert a DB row.) Zero code copied.

---

## 8. Migration path (the last painful reconcile, then never again)

- **P0 — Freeze.** `C:\GO PROXe` (clone of `github.com/bconclub/proxe`, branch `main`)
  is the ONE source of truth. Archive every other proxe folder/tree read-only.
  Always `git pull` before work; never make a side-copy. (The 64-commit drift that
  cost us days came from a stale copy — this rule prevents it.)
- **P1 — Carve buckets.** Create `/core`, `/modules`, `/brands`. Move the already-identical
  files → `/core`; brand config/prompts/public → `/brands/<id>`; War Room → `/modules/war-room`,
  Scout → `/modules/scout`.
- **P2 — One final reconcile** of the diverged files: each is a core improvement (→ `/core`)
  or actually brand-specific (→ module or brand config). Last N-way merge ever.
- **P3 — Wire resolution + generic env** (`BRAND_ID` → `loadBrand()`; `NEXT_PUBLIC_SUPABASE_URL`).
  Rewrite `promptBuilder` to read the prompt from brand config.
- **P4 — Delete the machinery:** `propagate-from-master.js`, `reverse-sync.js`,
  `brand-shared.json`, `sync-fleet`, `master/`, the duplicate brand app copies.
- **P5 — Brand configs → `brands` table; deploy → runtime multi-tenant.** Scale to thousands.

---

## Non-negotiables (pin these)
1. One repo, one `main`. No second folder, no per-brand branch/tree. Pull before you work.
2. No brand name/domain/template string ever appears in `/core` or `/modules`.
3. A brand difference is config, a flag, or a module — never a copied file.
4. Decide a new file's bucket when you write it, not when you sync it.
