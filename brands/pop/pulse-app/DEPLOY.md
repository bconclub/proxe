# Pulse Punjab — leader app (PROXe artifact)

The Expo / React-Native-for-Web leader app, now living **inside the PROXe
monorepo** as a POP artifact. One codebase; still its own Vercel deploy.

- Source of truth: this folder (`brands/pop/pulse-app/`).
- Backend: PROXe leader API at `/api/leader/*` (login-gated, HMAC session token).
- Login: leader enters a passcode → exchanged server-side for a 12h token.
  No secret ships in the public bundle.

## Local dev

```
cd brands/pop/pulse-app
npm install
npm run web            # expo web dev server
```

## Build (what Vercel runs)

```
npm run build:web      # expo export -p web  +  scripts/postexport.cjs  →  dist/
```

`vercel.json` already sets `buildCommand`, `outputDirectory: dist`, and the SPA
rewrite.

## Vercel — point the existing pulse-punjab project at this folder

The pulse-punjab Vercel project used to deploy from a standalone repo. To deploy
from the monorepo instead (so code + deploy are connected), in the Vercel
dashboard for that project:

1. **Settings → Git**: connect it to the `bconclub/proxe` repo (the same repo
   `pop-proxe` uses — Vercel supports many projects on one repo).
2. **Settings → General → Root Directory**: set to `brands/pop/pulse-app`.
3. **Production Branch**: `migrate/one-core` (or `main` once merged).
4. Redeploy.

`pop-proxe` keeps its own Root Directory (`core`) and is unaffected.

## Env (Vercel project → Settings → Environment Variables)

- `EXPO_PUBLIC_API_URL` = `https://pop-proxe.vercel.app` (PROXe origin the app
  calls). If unset, the app falls back to this value (see `src/lib/api.ts` and
  `app.json` `extra.apiBaseUrl`).

The leader passcode and HMAC key (`LEADER_API_KEY`) live on the **PROXe** side
(`pop-proxe` project env) — never in this bundle.
