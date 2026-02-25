# Chunk Loading Error Fix

## Error
```
Loading chunk 392 failed.
(error: https://proxe.windchasers.in/_next/static/chunks/392-41b8016a80ee3729.js)
```

## Root Causes

1. **Incomplete Build**: Build timed out or was interrupted, leaving missing chunks
2. **Nginx Routing Issue**: Chunks not being routed correctly between dashboard (3003) and web-agent (3001)
3. **Build Mismatch**: Client expects different chunks than what's on server (stale build)
4. **Cache Issues**: Browser or nginx caching old chunk references

## Immediate Fix Steps (Run on VPS)

### 1. Verify Build Completed Successfully
```bash
# SSH into VPS
cd /var/www/windchasers-proxe  # Dashboard
ls -la .next/static/chunks/ | head -20

cd /var/www/windchasers-web-agent  # Web-agent
ls -la .next/static/chunks/ | head -20
```

### 2. Check if Chunk Exists
```bash
# Check dashboard
curl -I http://localhost:3003/_next/static/chunks/392-41b8016a80ee3729.js

# Check web-agent
curl -I http://localhost:3001/_next/static/chunks/392-41b8016a80ee3729.js

# Check via nginx
curl -I https://proxe.windchasers.in/_next/static/chunks/392-41b8016a80ee3729.js
```

### 3. Rebuild if Needed
```bash
# Dashboard
cd /var/www/windchasers-proxe
npm run build
pm2 restart windchasers-dashboard

# Web-agent
cd /var/www/windchasers-web-agent
npm run build
pm2 restart windchasers-web-agent
```

### 4. Clear Nginx Cache
```bash
# Clear nginx proxy cache
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx
```

### 5. Check Nginx Logs
```bash
# Check error logs
sudo tail -f /var/log/nginx/proxe-windchasers-error.log

# Check access logs for 404s
sudo tail -f /var/log/nginx/proxe-windchasers-access.log | grep 404
```

## Long-term Fix

### Option 1: Fix Nginx Routing (Recommended)

The current nginx config routes `/_next/static/chunks/` to dashboard first, then falls back to web-agent. This can cause issues if:
- The chunk is in web-agent but dashboard returns 404 (nginx might not properly fallback)
- Both apps have chunks with same names but different content

**Solution**: Add explicit routing based on referrer or improve fallback logic.

### Option 2: Ensure Complete Builds

Add build verification to deployment workflow:
```bash
# After build, verify chunks exist
CHUNK_COUNT=$(find .next/static/chunks -name "*.js" | wc -l)
if [ "$CHUNK_COUNT" -lt 30 ]; then
  echo "ERROR: Build incomplete - only $CHUNK_COUNT chunks found"
  exit 1
fi
```

### Option 3: Use Different Chunk Paths

Modify Next.js config to use app-specific chunk paths:
```javascript
// next.config.js
module.exports = {
  assetPrefix: process.env.NODE_ENV === 'production' ? '/dashboard' : '',
  // Or use different output paths
}
```

## Prevention

1. **Complete Builds**: Ensure builds finish successfully (we fixed timeout)
2. **Build Verification**: Check chunk count after build
3. **Proper Routing**: Ensure nginx routes chunks correctly
4. **Cache Busting**: Use proper cache headers and build IDs

## Quick Test

After fixes, test:
```bash
# Test chunk loading
curl -I https://proxe.windchasers.in/_next/static/chunks/392-41b8016a80ee3729.js

# Should return 200 OK, not 404
```
