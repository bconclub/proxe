# Remove Widget Route from Dashboard

## Problem
Widget page exists in BOTH:
- ✅ `/var/www/windchasers-web-agent/.next/server/app/widget/` (CORRECT - 2.4KB)
- ❌ `/var/www/windchasers-proxe/.next/server/app/widget/` (WRONG - 196KB - this is dashboard's 404 page)

The dashboard's widget route is interfering with nginx routing.

## Fix Commands

### Step 1: Remove Widget from Dashboard Build
```bash
cd /var/www/windchasers-proxe

# Remove widget directory from build
rm -rf .next/server/app/widget

# Verify it's gone
ls -la .next/server/app/widget/ 2>/dev/null && echo "Still exists!" || echo "✅ Removed"
```

### Step 2: Check Dashboard Source Code (Should Not Have Widget Route)
```bash
cd /var/www/windchasers-proxe

# Check if widget directory exists in source
ls -la src/app/widget/ 2>/dev/null && echo "⚠️ Widget route exists in dashboard source!" || echo "✅ No widget route in source"

# If it exists, remove it
if [ -d "src/app/widget" ]; then
    echo "Removing widget route from dashboard source..."
    rm -rf src/app/widget
fi
```

### Step 3: Rebuild Dashboard (Without Widget Route)
```bash
cd /var/www/windchasers-proxe

# Rebuild to ensure widget route is gone
NODE_ENV=production npm run build

# Verify widget is NOT in new build
ls -la .next/server/app/widget/ 2>/dev/null && echo "⚠️ Widget still in build!" || echo "✅ Widget removed from dashboard build"
```

### Step 4: Restart Dashboard
```bash
pm2 restart windchasers-dashboard
pm2 logs windchasers-dashboard --lines 20
```

### Step 5: Verify Routing
```bash
# Dashboard should NOT serve /widget (should 404 or route to web-agent)
curl -I http://localhost:3003/widget
# Should return 404 or redirect

# Web-agent SHOULD serve /widget
curl -I http://localhost:3001/widget
# Should return 200 OK

# Via nginx (should route to web-agent)
curl -I https://proxe.windchasers.in/widget
# Should return 200 OK from web-agent
```

## Quick Fix One-Liner
```bash
cd /var/www/windchasers-proxe && rm -rf .next/server/app/widget src/app/widget 2>/dev/null; npm run build && pm2 restart windchasers-dashboard && echo "✅ Dashboard widget route removed"
```
