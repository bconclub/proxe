# Quick Reference: Bubble Embed Implementation

## What Changed

### New Route
```
brand/windchasers/web-agent/build/src/app/widget/bubble/page.tsx
```
- Lightweight bubble-only page
- Fixed positioning (bottom-right)
- Optimized for iframe embedding
- No page chrome

### Updated Route
```
brand/windchasers/web-agent/build/src/app/widget/embed.js/route.ts
```
- **Old:** Created popup window → `window.open('/widget')`
- **New:** Injects iframe → `<iframe src="/widget/bubble">`
- **Result:** Clean bubble loads immediately, no blank page

---

## Architecture

### Three Widget Delivery Methods

| Method | Route | Use Case |
|--------|-------|----------|
| **Full Page** | `/widget` | Direct access, dashboards, full-screen mode |
| **Bubble** | `/widget/bubble` | Iframe embedding, clean minimal interface |
| **Script Embed** | `/widget/embed.js` | Third-party websites, plug-and-play |

### Embed Flow

```
Website loads <script src="/widget/embed.js">
    ↓
JavaScript IIFE executes
    ↓
Creates <iframe src="/widget/bubble">
    ↓
ChatWidget renders in fixed bubble
    ↓
API calls to /api/chat work via CORS
```

---

## Implementation Details

### Bubble Page Features
- `position: fixed` (bottom-right corner)
- `width: 400px, height: 100vh` (full height)
- `background: transparent`
- `z-index: 999999`
- Mobile responsive (100% width)
- Client-side only rendering

### Embed Script Features
- IIFE for safe injection
- Duplicate prevention via ID check
- Iframe sandbox permissions:
  - ✅ Scripts, Forms, Modals, Popups
  - ❌ Top-level navigation
- Microphone/Camera permissions enabled
- Mobile responsive styles

---

## Code Snippets

### Bubble Page (`/widget/bubble`)
```tsx
'use client'
import { ChatWidget } from '@/components/ChatWidget'

export default function BubblePage() {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => setMounted(true), [])
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      zIndex: 999999,
      background: 'transparent'
    }}>
      <ChatWidget 
        apiUrl="https://agent.windchasers.in/api/chat"
        widgetStyle="bubble"
      />
    </div>
  )
}
```

### Embed Script (`/widget/embed.js`)
```javascript
(function() {
  if (document.getElementById('windchasers-bubble-iframe')) return;
  
  const iframe = document.createElement('iframe');
  iframe.id = 'windchasers-bubble-iframe';
  iframe.src = 'https://agent.windchasers.in/widget/bubble';
  iframe.style.cssText = 'position:fixed;bottom:0;right:0;width:400px;height:100vh;border:none;background:transparent;pointer-events:none;z-index:999999;';
  iframe.style.pointerEvents = 'auto';
  iframe.setAttribute('allow', 'microphone; camera; geolocation');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms allow-modals');
  
  document.body.appendChild(iframe);
  
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 768px) {
      #windchasers-bubble-iframe {
        width: 100% !important;
        height: 100vh !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
```

---

## Deployment

### Build
```bash
cd brand/windchasers/web-agent/build
npm run build
```
✅ **Build time:** 34 seconds  
✅ **Status:** Ready

### Deploy
**Option 1 - Vercel (Recommended)**
```bash
git add src/app/widget/bubble/page.tsx
git add src/app/widget/embed.js/route.ts
git commit -m "feat: add bubble embed route with iframe injection"
git push origin main
```
Vercel auto-deploys → Done ✅

**Option 2 - Local/VPS**
```bash
npm run build
npm run start
# PM2 or process manager restarts
```

---

## Testing

### Local Testing
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Test routes
curl http://localhost:4003/widget/bubble
curl http://localhost:4003/widget/embed.js
```

### Browser Testing
1. Visit `http://localhost:4003/widget/bubble`
   - Should see ChatWidget in bottom-right
   - Dark theme, no page header
   
2. Test embed script:
   ```html
   <html>
     <body>
       <h1>Test Page</h1>
       <script src="http://localhost:4003/widget/embed.js"></script>
     </body>
   </html>
   ```
   - Should see bubble iframe load in bottom-right
   - Chat should be interactive
   - API calls should work

### Production Testing (pilot.windchasers.in)
- Embed script loads without errors
- Iframe renders bubble correctly
- Microphone/camera permissions work
- Mobile responsive

---

## Configuration

### API Endpoint
Currently hardcoded in bubble page:
```tsx
apiUrl="https://agent.windchasers.in/api/chat"
```

To make it configurable, modify embed.js:
```javascript
const apiUrl = new URL(document.currentScript.src)
  .searchParams.get('api') 
  || 'https://agent.windchasers.in/api/chat';
```

### CSP Whitelist
Configured in middleware.ts for `/widget` (applies to `/widget/bubble`):
```
frame-ancestors 'self'
  https://proxe.windchasers.in
  https://windchasers.in
  https://pilot.windchasers.in
  http://localhost:*
  http://localhost:3000
  http://localhost:3001
```

---

## Troubleshooting

### Bubble doesn't appear
1. Check browser console for errors
2. Verify CSP allows embedding domain
3. Check iframe's `src` is accessible
4. Verify no other script has ID `windchasers-bubble-iframe`

### API calls fail
1. Check CORS headers on `/api/chat`
2. Verify `apiUrl` in bubble page matches host
3. Check browser console for Network errors
4. Verify session/auth tokens if required

### Microphone not working
1. Check iframe `allow` attribute includes `microphone`
2. Verify HTTPS on production (HTTP blocks permissions)
3. Check browser microphone permissions
4. Test in DevTools: `document.getElementById('windchasers-bubble-iframe').contentWindow.navigator.mediaDevices`

### Mobile display issues
1. Check media queries in embed script
2. Verify viewport meta tag on host page
3. Test on actual device (not just browser resize)
4. Check for conflicting CSS in host page

---

## Performance Notes

- **First Load:** ~330KB (shared chunks)
- **Bubble Route:** 473B (minimal)
- **Embed Script:** Dynamic, ~2KB gzipped
- **Build Time:** 34 seconds
- **Cache:** 3600 seconds (1 hour)

---

## Files Reference

- [bubble/page.tsx](src/app/widget/bubble/page.tsx)
- [embed.js/route.ts](src/app/widget/embed.js/route.ts)
- [middleware.ts](src/middleware.ts) - CSP configuration
- [ChatWidget.tsx](src/components/ChatWidget.tsx) - Component implementation

---

**Status:** ✅ Production Ready  
**Version:** 1.0.3  
**Last Updated:** February 2, 2026
