# PROXe `packages/core` Extraction — Plan (for approval)

_Status: DRAFT for review. Do not start executing until the open decisions below are answered._

## Goal
One shared `packages/core` so a core (PROXe-wide) change is made **once** and flows to every brand on the next build — ending the per-brand-diff drift. Brands become thin: config + prompts + theme + env + a few brand-specific fields.

## Reality check — the brands have DRIFTED (this is the hard part)
The three brands were forked and each evolved independently. The "shared" files are **not identical** today, e.g.:
- inbox/page.tsx — BCON ~2.6k lines vs WC ~2.7k
- FounderDashboard.tsx — BCON ~1.0k vs WC ~0.65k
- flows/page.tsx — BCON ~1.25k vs WC ~2.1k
- services (conversationLogger, whatsappSender, bookingManager) — diverged

So this is **not** "move identical files." Each module must be **reconciled to one canonical implementation OR parameterized by brand config** before/while extracting. That reconciliation is the real work.

## What's CORE vs BRAND
**CORE → packages/core:** `lib/services/*`, `lib/agent-core/*`, `components/dashboard/*`, the `app/api/dashboard/*` + `app/api/agent/*` logic, `app/dashboard/*` pages, supabase server/client, shared hooks/utils.
**BRAND → stays per-brand:** `configs/*` (prompts, brand-facts, `BrandConfig`), theme CSS tokens, env keys, voice stack (Vapi vs Vobiz), WABA + Supabase project, public assets/logo, and the handful of brand-specific fields (e.g. lead-modal fields).

## Approach — incremental, build-gated, reversible
1. **Workspace setup** — npm/pnpm workspaces; create `packages/core` with a `@proxe/core` alias (tsconfig paths). No app behavior change yet.
2. **Canonical source** — WC is the reference (per the master plan). For each module, WC's impl is the baseline; BCON's genuine improvements get folded in.
3. **Leaf-first extraction order** (least brand coupling first):
   1. `lib/services/utils.ts` + pure leaf helpers (near-identical, low risk) — **proof of concept**
   2. `lib/agent-core` (claudeClient, conversationIntelligence) — parameterize the extraction schema by brand config (BCON B2B vs WC aviation)
   3. core `lib/services` (conversationLogger, leadManager, bookingManager, whatsappSender) — reconcile drift to canonical + brand config for templates/copy
   4. `components/dashboard/*` (the heavy UI) — biggest; reconcile drift; theme via tokens only
   5. `app/dashboard/*` pages + `app/api/dashboard|agent/*` routes
4. **Parameterize brand differences** via the existing `BrandConfig` + a brand-context provider injected at the app edge. Pure-config diffs → config; real logic forks → reconcile to one impl with config flags.
5. Each brand app imports from `@proxe/core`; brand layer becomes config + thin wrappers.
6. **Build-gate every brand after each module**; deploy only when all three build green.
7. **Worktree + batch-merge** (current workflow). Coordinate with the always-active WC session: extract a module when WC isn't mid-editing those files, or treat WC's version as canonical so its edits land in core.

## Risks
- Drift reconciliation is per-module real work, not a file move.
- All three brands are LIVE — must stay deployable throughout (incremental + gated).
- The parallel WC session edits core files constantly → coordination/freeze windows needed.
- Theme-token divergence (pixel-parity rule still applies).
- PROXE is far behind (~5–17%) — extraction actually HELPS it (inherits core), but its stubs must be swapped for core imports.

## Recommendation
Do **module 1 (utils/leaf services) as a proof-of-concept** first — validates the workspace, the `@proxe/core` import rewiring, and per-brand build-gating — before touching the heavy drifted UI. Get sign-off on tooling + the canonical rule first.

## Open decisions for you
1. **Workspace tool:** npm workspaces (simplest) vs pnpm vs Turborepo?
2. **Canonical source:** WC = reference for each module (default) — confirm.
3. **Coordination** with the WC session during extraction (freeze windows, or WC-canonical so its live edits flow into core)?
4. **Scope now:** full extraction roadmap, or just the proof-of-concept module to validate the approach?
