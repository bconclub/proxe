# Fix Port Conflict and Widget Routing

## Issues Found
1. Port 3001 already in use - web-agent can't start
2. Widget page exists in dashboard build (wrong location)
3. Widget route being served by dashboard instead of web-agent

## Immediate Fix Commands

### Step 1: Kill Process Using Port 3001
```bash
# Find what's using port 3001
sudo lsof -i :3001
# OR
sudo netstat -tlnp | grep :3001
# OR
sudo ss -tlnp | grep :3001

# Kill the process (replace PID with actual process ID)
sudo kill -9 <PID>

# Or kill all node processes on port 3001
sudo fuser -k 3001/tcp
```

### Step 2: Clean Up PM2
```bash
# Stop all PM2 processes
pm2 stop all
pm2 delete all

# Make sure nothing is running
pm2 list
```

### Step 3: Verify Widget Page Location
```bash
# Widget should be in WEB-AGENT, not dashboard
# Check web-agent (CORRECT location)
ls -la /var/www/windchasers-web-agent/.next/server/app/widget/ 2>/dev/null || echo "Widget NOT in web-agent"

# Check dashboard (WRONG location - should not exist here)
ls -la /var/www/windchasers-proxe/.next/server/app/widget/ 2>/dev/null && echo "⚠️ Widget in dashboard - this is wrong!"
```

### Step 4: Rebuild Web-Agent (If Widget Missing)
```bash
cd /var/www/windchasers-web-agent

# Clean and rebuild
rm -rf .next
NODE_ENV=production SKIP_TYPE_CHECK=true NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Verify widget page was built
ls -la .next/server/app/widget/
```

### Step 5: Remove Widget from Dashboard (If It Exists There)
```bash
cd /var/www/windchasers-proxe

# Check if widget directory exists (it shouldn't)
if [ -d ".next/server/app/widget" ]; then
    echo "⚠️ Widget found in dashboard - removing..."
    rm -rf .next/server/app/widget
    # Rebuild dashboard
    npm run build
fi
```

### Step 6: Start Services Correctly
```bash
# Start web-agent FIRST (port 3001)
cd /var/www/windchasers-web-agent
PORT=3001 pm2 start npm --name windchasers-web-agent -- start
pm2 save

# Wait a moment
sleep 3

# Start dashboard (port 3003)
cd /var/www/windchasers-proxe
PORT=3003 pm2 start npm --name windchasers-dashboard -- start
pm2 save

# Check status
pm2 list
pm2 logs --lines 10
```

### Step 7: Verify Routing
```bash
# Test web-agent widget directly
curl -I http://localhost:3001/widget
# Should return 200 OK

# Test via nginx
curl -I https://proxe.windchasers.in/widget
# Should route to web-agent (port 3001)

# Check nginx config
sudo grep -A 5 "location /widget" /etc/nginx/sites-enabled/proxe.windchasers.in
```

## Quick One-Liner Fix
```bash
# Kill port 3001, clean PM2, restart services
sudo fuser -k 3001/tcp && pm2 delete all && cd /var/www/windchasers-web-agent && PORT=3001 pm2 start npm --name windchasers-web-agent -- start && sleep 3 && cd /var/www/windchasers-proxe && PORT=3003 pm2 start npm --name windchasers-dashboard -- start && pm2 save && pm2 list
```
