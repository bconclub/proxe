# Fix: proxe.windchasers.in showing wrong site

## Problem
`proxe.windchasers.in` is showing a completely different site instead of the Windchasers dashboard.

## Quick Diagnosis

SSH into your VPS and run:

```bash
# 1. Check what PM2 is running
pm2 list

# 2. Check what's on port 3003
netstat -tlnp | grep :3003

# 3. Check Nginx configuration
sudo cat /etc/nginx/sites-available/proxe.windchasers.in | grep -A 5 "proxy_pass"

# 4. Check deployment directory
ls -la /var/www/windchasers-proxe/package.json
cat /var/www/windchasers-proxe/package.json | grep '"name"'
```

## Common Issues

### Issue 1: Wrong PM2 Process Running

**Check:**
```bash
pm2 describe windchasers-dashboard
```

**Fix:**
```bash
# Stop wrong process
pm2 stop all
pm2 delete all

# Navigate to correct directory
cd /var/www/windchasers-proxe

# Start correct process
pm2 start ecosystem.config.js --only windchasers-dashboard
# OR
PORT=3003 pm2 start npm --name windchasers-dashboard -- start

pm2 save
```

### Issue 2: Nginx Pointing to Wrong Port/Directory

**Check:**
```bash
sudo cat /etc/nginx/sites-available/proxe.windchasers.in
```

**Should show:**
```nginx
location / {
    proxy_pass http://localhost:3003;  # ← Should be 3003, not 3001 or other
    ...
}
```

**Fix:**
```bash
sudo nano /etc/nginx/sites-available/proxe.windchasers.in

# Update proxy_pass to:
proxy_pass http://localhost:3003;

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Issue 3: Wrong Directory Deployed

**Check:**
```bash
# Check what's in the deployment directory
ls -la /var/www/windchasers-proxe/src/app/page.tsx
cat /var/www/windchasers-proxe/package.json | grep '"name"'
```

**Should show:**
- `package.json` with name related to "windchasers" or "dashboard"
- `src/app/page.tsx` should redirect to `/dashboard` or `/auth/login`

**If wrong, redeploy:**
The GitHub Actions workflow should deploy `brand/windchasers/dashboard/build/` to `/var/www/windchasers-proxe/`

### Issue 4: Conflicting Deployment

There might be another workflow deploying to the wrong place. Check:

```bash
# Check if PROXe dashboard is in wrong location
ls -la /var/www/dashboard 2>/dev/null
pm2 list | grep -E "dashboard|proxe"
```

**If PROXe is running on port 3003:**
```bash
# Stop it
pm2 stop dashboard
pm2 delete dashboard

# Make sure windchasers-dashboard is running
pm2 start ecosystem.config.js --only windchasers-dashboard
```

## Complete Reset

If nothing works, do a complete reset:

```bash
# 1. Stop all processes
pm2 stop all
pm2 delete all

# 2. Verify correct directory
cd /var/www/windchasers-proxe
ls -la package.json

# 3. Clean and rebuild
rm -rf .next node_modules/.cache
npm ci
npm run build

# 4. Verify build
if [ ! -f ".next/BUILD_ID" ]; then
  echo "Build failed!"
  exit 1
fi

# 5. Start with ecosystem
pm2 start ecosystem.config.js --only windchasers-dashboard
pm2 save

# 6. Wait and verify
sleep 10
curl http://localhost:3003/api/health
pm2 logs windchasers-dashboard --lines 20
```

## Verification

After fixing, verify:

```bash
# 1. PM2 shows correct process
pm2 list | grep windchasers-dashboard

# 2. Port 3003 is listening
netstat -tlnp | grep :3003

# 3. App responds
curl http://localhost:3003

# 4. Nginx proxies correctly
curl -H "Host: proxe.windchasers.in" http://localhost

# 5. Visit in browser
# https://proxe.windchasers.in should show Windchasers dashboard
```

## Run Diagnostic Script

A diagnostic script is available:

```bash
cd /var/www/windchasers-proxe
chmod +x scripts/verify-vps-deployment.sh
./scripts/verify-vps-deployment.sh
```

This will show:
- What PM2 processes are running
- What's on each port
- What's in the deployment directory
- Nginx configuration
- What's actually being served
