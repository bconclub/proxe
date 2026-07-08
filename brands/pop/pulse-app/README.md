# Pulse of Punjab

Interactive **web app** for the *Punjab Yatra 2026 · ਪੰਜਾਬੀਅਤ ਦੀ ਲਹਿਰ* campaign - a
choropleth of all **117 Vidhan Sabha constituencies** with a premium dark
"election-night" UI, voter age analytics, the P1/P2/P3 mobilization framework, a
scan→call voter journey, and a pluggable API/backend layer.

Built with **Expo (React Native for Web)** so the same codebase runs as a website
**and** installs as a native mobile app later. **Web is the primary target** - it's
what the team reviews and what gets embedded / installed from the campaign site.

## Run the web app (dev)

```bash
npm install
npm run web          # Expo dev server → http://localhost:8088
```

Open `http://localhost:8088` in any browser.

## Build the deployable / installable web app

```bash
npm run build:web    # → static site in dist/  (PWA: manifest + service worker)
npm run serve:web    # preview the production build → http://localhost:8089
```

`dist/` is a plain static site - deploy it to **Vercel, Netlify, Cloudflare Pages,
GitHub Pages, or any static host**, or drop it behind the campaign website. It's a
**PWA**: visitors can "Install" / "Add to Home Screen" straight from the browser
(manifest + offline service worker are wired in by `scripts/postexport.cjs`).

## Native mobile (secondary)

The same app runs natively via Expo Go / EAS (`npm start`, then `a` for Android).
Android package id `in.punjabyatra.pulse`; push notifications via `expo-notifications`.
Build an APK/AAB with `eas build -p android`. See `src/lib/notifications.ts`.

## How it looks / what's in it

- **Map tab** - SVG choropleth on web (`react-native-maps` on native), all 117 seats,
  tap a seat → detail sheet. **5 color modes:** engagement heat · 2022 result (party) ·
  youth density (18-29) · priority (P1/P2/P3) · seat type (General/SC).
- **Seats tab** - searchable list, district filter, 2022 winner dot per seat.
- **Program tab** - P1/P2/P3 priorities, 7-month timeline, knowledge base, WhatsApp funnel.
- **Journey tab** - scan → share-voice → schedule-call demo (fires a notification).
- **Detail sheet** - 2022 MLA, pulse metrics, voter age profile, scan-card, grievance flow.

## Data & variables (all wired and ready)

| File | What |
|------|------|
| `src/data/constituencies.json` | 117 ACs: `no, name, district, reserved, lha` |
| `src/data/results-2022.json`   | 2022 ECI result - all 117 per-seat winners + party aggregates |
| `src/data/punjab-ac.json`      | real ECI boundary polygons (geojson) |
| `src/data/framework.json`      | P1/P2/P3 program, timeline, scan-card, grievance, WhatsApp |
| `src/lib/pulse.ts`             | seeded per-seat metrics + 7-band age model (stable mock) |
| `src/lib/geo.ts`               | geojson → polygons + choropleth fill per color mode |
| `src/theme.ts`                 | design tokens (dark, saffron/azure, Inter + Sora) |

## Backends / APIs

`src/lib/api.ts` is the single integration seam. Today it serves the bundled data;
set `EXPO_PUBLIC_API_URL` (or `app.json → extra.apiBaseUrl`) and flip `USE_LOCAL`
to route every screen to live services - no UI changes:

| Endpoint | Used by |
|----------|---------|
| `GET /constituencies`, `/results`, `/framework` | map, list, program |
| `GET /pulse`, `/pulse/:no` | metrics, choropleth |
| `POST /grievances` | voter journey |
| `POST /subscribe` | WhatsApp / updates opt-in |
| `POST /devices` | push token registration |

## Project structure

```
App.tsx                      # root: fonts, tab nav, brand header, detail sheet
src/theme.ts                 # design tokens
src/data/                    # bundled datasets (117 ACs, 2022 results, geojson)
src/lib/{api,pulse,geo,notifications}.ts
src/components/MapCanvas.tsx      # native map (react-native-maps)
src/components/MapCanvas.web.tsx  # web map (react-native-svg choropleth)
src/components/               # ColorModeBar, Legend, SeatList, DetailSheet, ...
src/screens/                  # ProgramScreen, JourneyScreen
public/                       # PWA manifest, service worker, icons (copied to dist/)
scripts/postexport.cjs        # injects PWA wiring into the exported index.html
```
