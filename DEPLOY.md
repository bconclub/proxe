# Deploy — one core, per-brand Vercel projects

Every brand is a Vercel project that builds the **same `/core`** with a different
`BRAND_ID`. Apply these settings **when `migrate/one-core` merges to `main`** (doing
it before would break current deploys, which still expect the old `brands/*/agent`).

## Brand → Vercel project (bconclub team)
| Brand | Project | BRAND_ID |
|---|---|---|
| bcon | `bcon-proxe` | `bcon` |
| windchasers | `windhcasers-proxe` | `windchasers` |
| pop | `pop-proxe` | `pop` |
| lokazen | `lokazen-proxe` | `lokazen` |
| proxe | (bconclub / TBD) | `proxe` |

## Per-project settings (Vercel dashboard → Project → Settings)
1. **General → Root Directory** = `core`   ← the Next.js app now lives in /core
2. **General → Build & Development**:
   - Build Command: `npm run build`   (prebuild auto-stages the brand via `BRAND_ID`)
   - Install Command: `npm install`
   - Output: default (`.next`)
3. **Environment Variables** (Production + Preview):
   - `BRAND_ID` = the brand slug (e.g. `bcon`) ← selects the brand at build
   - `NEXT_PUBLIC_BRAND` = same slug
   - All the brand's secrets (Supabase URL/anon/service, Claude, WhatsApp, Vapi,
     Google, Resend…) — already present; keep them. Use **generic** names going
     forward (`NEXT_PUBLIC_SUPABASE_URL`, not `NEXT_PUBLIC_<BRAND>_SUPABASE_URL`).
4. **Git**: connected repo = `bconclub/proxe`, production branch = `main`.

## Pull env locally anytime (authoritative source = Vercel)
```
vercel link --yes --project <project> --scope team_ha49zkxrYmn1QCTQCQlgGgNr
vercel env pull brands/<brand>/.env.local --environment=production --yes
```
Then `npm run build:<brand>` in `/core` (prebuild stages env + public).

## Adding a NEW brand (the payoff)
1. `mkdir brands/<id>` → add `config.ts` (export `brandConfig`), `prompts/`, `public/`, `CHANGELOG.md`
2. Create a Vercel project → Root Directory `core`, set `BRAND_ID=<id>` + secrets
3. Done. No code copied, no core edit, no propagation.
