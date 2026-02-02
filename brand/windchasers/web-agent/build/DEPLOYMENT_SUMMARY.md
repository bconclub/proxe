# Web-Agent CSP Update & Deployment Summary

**Date:** February 2, 2026  
**Component:** `brand/windchasers/web-agent/build`  
**Status:** ✅ Build Successful | Ready for Deployment

---

## Changes Made

### 1. Updated CSP Frame-Ancestors Policy
**File:** [src/middleware.ts](src/middleware.ts)

**Previous Configuration (Line 50-52):**
```typescript
response.headers.set(
  'Content-Security-Policy',
  "frame-ancestors 'self' https://proxe.windchasers.in https://windchasers.in"
)
```

**Updated Configuration:**
```typescript
response.headers.set(
  'Content-Security-Policy',
  "frame-ancestors 'self' https://proxe.windchasers.in https://windchasers.in https://pilot.windchasers.in http://localhost:* http://localhost:3000 http://localhost:3001"
)
```

### 2. New Allowed Origins

| Origin | Purpose | Environment |
|--------|---------|-------------|
| `https://proxe.windchasers.in` | Production PROXe dashboard | Production |
| `https://windchasers.in` | Production main site | Production |
| `https://pilot.windchasers.in` | **[NEW]** Staging/pilot site | Production |
| `http://localhost:*` | **[NEW]** All localhost ports | Development |
| `http://localhost:3000` | **[NEW]** Primary dev port | Development |
| `http://localhost:3001` | **[NEW]** Secondary dev port | Development |

---

## Build Results

```
✅ Build completed successfully!

📊 Build Performance Summary:
   Pre-build checks                     0s (0.0%)
   Next.js build                       29s (99.4%)
   Post-build verification              0s (0.6%)
   Total build time                    30s

📦 Generated 6 JavaScript chunks
💾 Build size: 655.59 MB
```

### Build Output Summary
| Route | Type | Size |
|-------|------|------|
| `/` | Static | 655 B |
| `/_not-found` | Static | 184 B |
| `/api/calendar/availability` | Dynamic | 0 B |
| `/api/calendar/book` | Dynamic | 0 B |
| `/api/calendar/list` | Static | 0 B |
| `/api/chat` | Dynamic | 0 B |
| `/api/chat/summarize` | Dynamic | 0 B |
| `/widget` | Static | 500 B |
| `/widget/embed.js` | Dynamic | 0 B |

**Middleware:** ✅ Compiled (26.8 kB)

---

## What This Enables

### For Pilot Site (`https://pilot.windchasers.in`)
✅ Can now embed the widget via iframe without CSP violations:
```html
<iframe src="https://agent.windchasers.in/widget"></iframe>
```

### For Development
✅ All local development environments can test iframe embedding:
```html
<!-- Works on localhost:3000 and localhost:3001 -->
<iframe src="http://localhost:4003/widget"></iframe>
```

### For Widget Embedding
✅ The `/widget/embed.js` floating button script continues to work on all sites (no CSP restrictions apply to script tags)

---

## Deployment Instructions

### Option 1: Vercel Deployment (Recommended)
1. Push changes to main branch:
   ```bash
   cd brand/windchasers/web-agent/build
   git add src/middleware.ts
   git commit -m "feat: update CSP to allow pilot.windchasers.in and localhost for iframe embedding"
   git push origin main
   ```

2. Vercel will automatically:
   - Detect the push
   - Run `npm run build` (via vercel.json)
   - Deploy .next folder to production
   - Activate new middleware configuration

### Option 2: Manual Deployment
```bash
cd brand/windchasers/web-agent/build
npm run build
# Upload .next folder to Vercel or your hosting platform
```

### Option 3: PM2 Deployment (if running locally)
```bash
npm run build:production
npm run start
# PM2 will restart with new middleware
```

---

## Verification Checklist

- [x] Middleware source code updated
- [x] Production build successful
- [x] Middleware compiled in .next/server/
- [x] CSP headers include all required origins
- [x] X-Frame-Options still set to SAMEORIGIN
- [x] Development mode still removes CSP (allows any localhost)
- [ ] Deploy to production environment
- [ ] Test iframe embedding from pilot.windchasers.in
- [ ] Test iframe embedding from localhost:3000 and :3001
- [ ] Verify widget/embed.js still works on external sites

---

## Security Notes

✅ **Safe Changes:**
- CSP is still restrictive in production
- Development mode (NODE_ENV !== 'production') still has unrestricted CSP
- X-Frame-Options remains SAMEORIGIN for additional security
- Only specific subdomains and localhost ports are allowed
- Wildcard `http://localhost:*` only applies to localhost (not all origins)

⚠️ **Important:**
- The CSP applies to the `/widget` route (iframe endpoint)
- The `/widget/embed.js` script endpoint has no CSP restrictions (scripts can be loaded from anywhere)
- CORS headers remain permissive (`*`) to allow cross-origin widget usage

---

## Related Files

- [src/middleware.ts](src/middleware.ts) - Updated ✅
- [vercel.json](vercel.json) - Deployment config (no changes needed)
- [package.json](package.json) - Build scripts (no changes needed)
- [WEB_AGENT_WIDGET_REPORT.md](../../../WEB_AGENT_WIDGET_REPORT.md) - Architecture reference

---

**Next Steps:** Push to main branch and monitor Vercel deployment
