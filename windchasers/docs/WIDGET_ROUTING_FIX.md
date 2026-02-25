# Widget Routing Fix

## Issue
The `/widget` endpoint on `proxe.windchasers.in/widget` is showing a full informational page instead of the chat widget interface.

## Root Cause Analysis

The widget page (`/widget`) should:
1. Route to web-agent (port 3001) via nginx
2. Render only the ChatWidget component (no page content)
3. Show a chat interface, not informational content

## Possible Causes

1. **Wrong App Serving Widget**: Dashboard (port 3003) might be serving `/widget` instead of web-agent (port 3001)
2. **Build Issue**: Widget page not built correctly
3. **Routing Issue**: Next.js routing not configured correctly
4. **Cache Issue**: Old build cached

## Immediate Fix Steps

### Step 1: Verify Which App is Serving /widget

SSH into VPS and check:

```bash
# Check if web-agent is running
pm2 list | grep windchasers-web-agent

# Test direct access to web-agent widget
curl -I http://localhost:3001/widget

# Test via nginx
curl -I https://proxe.windchasers.in/widget

# Check nginx routing
sudo grep -A 10 "location /widget" /etc/nginx/sites-enabled/proxe.windchasers.in
```

### Step 2: Check Widget Page Build

```bash
cd /var/www/windchasers-web-agent

# Verify widget page exists in build
ls -la .next/server/app/widget/

# Check if it's a page or route
cat .next/server/app/widget/page.js | head -20
```

### Step 3: Verify Widget Page Code

The widget page should only render ChatWidget:

```typescript
// src/app/widget/page.tsx should be:
export default function WidgetPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', ... }}>
      <ChatWidget apiUrl={apiUrl} widgetStyle="bubble" />
    </div>
  )
}
```

### Step 4: Rebuild Web-Agent

```bash
cd /var/www/windchasers-web-agent
npm run build
pm2 restart windchasers-web-agent
```

### Step 5: Clear All Caches

```bash
# Clear Next.js cache
rm -rf .next

# Clear nginx cache
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx

# Rebuild
npm run build
pm2 restart windchasers-web-agent
```

## Verification

After fixes, test:

```bash
# Should return 200 and show widget HTML
curl https://proxe.windchasers.in/widget

# Should NOT show "Training Paths" or footer content
# Should show ChatWidget component
```

## Expected Widget Page Structure

The widget page should:
- ✅ Have dark background (#0F0A06)
- ✅ Show ChatWidget component only
- ✅ No page content, headers, or footers
- ✅ Full viewport (100vw x 100vh)
- ✅ Fixed positioning

## If Still Not Working

1. **Check Dashboard Routes**: Ensure dashboard doesn't have a `/widget` route
2. **Check Nginx Priority**: Widget route must come BEFORE dashboard routes
3. **Check Build Output**: Verify `.next/server/app/widget/page.js` exists
4. **Check PM2 Logs**: `pm2 logs windchasers-web-agent` for errors
