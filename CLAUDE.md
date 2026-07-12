# GO PROXe — one-core monorepo

One shared Next.js app (`core/`) serves 5 brands: **bcon, windchasers, pop, lokazen, proxe**.
Brand is fixed at build time: `BRAND_ID` env + `brands/<id>/config.ts` (+ optional `brands/<id>/widget` fork via `@brand`).
There are NO per-brand code branches — brand separation is build-time gating, never branching.

## Branch model (verified 2026-07-12)

| Branch | Production for |
|---|---|
| `main` | bcon, windchasers, lokazen, proxe |
| `migrate/one-core` | pop (temporary — until merged back to main) |

**Any change to shared `core/` must be pushed to BOTH branches** (main first, then one-core) until pop returns to main.

Per-brand deploys are scoped by `core/scripts/vercel-ignore.sh` reading the **commit scope**:
- `fix(windchasers): …` → only windchasers rebuilds (even if it touches `core/`)
- `fix(core): …` / generic scope → ALL brands rebuild
- touching `brands/<id>/` → that brand rebuilds
So: scope the commit by blast radius. Brand-scoped commits that also change shared behavior will leave other brands stale — use a generic scope for shared changes.

## WORK DISCIPLINE — worktree per thread (MANDATORY)

Multiple Claude threads run concurrently on this machine. The main checkout at `C:\GO PROXe` is a shared, permanently-dirty tree. **Never commit from it; never `git add -A` anywhere.**

Working on a brand (e.g. windchasers) means: own worktree, fresh from origin/main.

1. **Start of thread:**
   ```
   git -C "C:/GO PROXe" fetch origin
   git -C "C:/GO PROXe" worktree add C:/PROXe-wt/<brand-or-task> -b wt/<brand-or-task> origin/main
   ```
2. **Work there.** Edit, run, verify inside the worktree only.
3. **Ship small + fast:** commit with the right scope, then
   ```
   git -c credential.helper= -c credential.helper=store push origin HEAD:main
   ```
   (the empty-then-store helper dance avoids the machine's GCM popup hang + a stale first credential in the store)
   If the change touched shared `core/`, repeat onto one-core: apply the same patch on a worktree of `origin/migrate/one-core`, push `HEAD:migrate/one-core`.
4. **Verify the deploy landed:** `curl -s https://proxe.bconclub.com/api/build-info` (or the brand's domain) until the version bumps. A push is not a deploy.
5. **End of thread:** `git worktree remove <path>` + `git worktree prune`.

Push safety, every time: `git fetch` + check `git rev-list --left-right --count origin/main...HEAD` before pushing. Expect races from other threads; rebase, don't force.

## Hard rules

- **No bleeds:** shared `core/` code must NEVER hardcode a brand name, label, price, or taxonomy ("BCON", "Lokazen team", "Property Owner", pilot pricing…). Gate with `brandId === 'x'` / `BRAND_ID` / `getBrandConfig().name` / `features.*`. A full bleed audit was done 2026-07-12 — don't reintroduce.
- **Versioning:** a pre-commit hook auto-bumps `core/package.json` patch on every `core/` commit. NEVER hand-edit version files.
- **Env isolation:** never copy API keys across `brands/*/.env.local`. Each brand has its own Supabase / WhatsApp / WABA.
- **Dev servers:** use `.claude/launch.json` configs (`bcon-core` :4022, `windchasers-core` :4025, `lokazen-live` :4020, `pop-core-*`) — each has its own port + `NEXT_DIST_DIR`. Never share a `.next` between sessions.
- **DB changes:** write migrations under `brands/<id>/supabase/migrations/`; the user runs them in the Supabase SQL editor (no direct DDL access).

## State

Cross-thread build state lives in `.claude/state/todo.md` — read it at thread start, update when your list changes.
