# Quick Fix for VPS Build Issues

## Current Issues
1. PM2 processes errored
2. Build hanging/taking too long
3. Need to get services running quickly

## Step-by-Step Fix

### Step 1: Check PM2 Logs (See What's Wrong)
```bash
pm2 logs windchasers-web-agent --lines 50 --nostream
pm2 logs windchasers-dashboard --lines 50 --nostream
```

### Step 2: Delete Errored Processes
```bash
pm2 delete windchasers-web-agent
pm2 delete windchasers-dashboard
pm2 delete windchasers  # Old process
pm2 delete turquoise    # Old process
pm2 save
```

### Step 3: Build with Type Checking Skipped (FAST)
```bash
cd /var/www/windchasers-web-agent

# Set environment to skip type checking
export NODE_ENV=production
export SKIP_TYPE_CHECK=true

# Build with timeout and memory limit
NODE_OPTIONS="--max-old-space-size=4096" timeout 600 npm run build
```

### Step 4: If Build Still Hangs, Use This Alternative
```bash
cd /var/www/windchasers-web-agent

# Skip type checking completely
NODE_ENV=production SKIP_TYPE_CHECK=true NODE_OPTIONS="--max-old-space-size=4096" npm run build -- --no-lint
```

### Step 5: Start PM2 Processes
```bash
cd /var/www/windchasers-web-agent
PORT=3001 pm2 start npm --name windchasers-web-agent -- start
pm2 save

cd /var/www/windchasers-proxe
PORT=3003 pm2 start npm --name windchasers-dashboard -- start
pm2 save

# Check status
pm2 list
pm2 logs --lines 20
```

### Step 6: Verify Services
```bash
# Test web-agent
curl http://localhost:3001/widget

# Test dashboard
curl http://localhost:3003

# Check PM2
pm2 status
```

## If Build Still Fails

### Option A: Build Without Type Checking (Fastest)
```bash
cd /var/www/windchasers-web-agent

# Temporarily modify package.json build script
# Change: "build": "next build"
# To: "build": "next build --no-lint"

# Or use environment variable
TSC_COMPILE_ON_ERROR=true npm run build
```

### Option B: Check System Resources
```bash
# Check memory
free -h

# Check disk space
df -h

# Check CPU
top
```

### Option C: Build in Background with Logging
```bash
cd /var/www/windchasers-web-agent
nohup npm run build > build.log 2>&1 &
tail -f build.log
```

## Emergency: Use Existing Build (If Available)
If there's an old `.next` directory that worked:
```bash
cd /var/www/windchasers-web-agent

# Check if old build exists elsewhere
ls -la /var/www/windchasers-web-agent/.next* 2>/dev/null || echo "No old build"

# If you have a backup, restore it
# Otherwise, continue with fresh build
```
