# VPS Cache Setup for Faster Builds

## Overview
The deployment workflow now uses VPS-side caching to dramatically reduce build times. Caches are stored in `/var/cache/` directories.

## Cache Directories

### Web-Agent Cache
- **Location**: `/var/cache/windchasers-web-agent/`
- **Contents**:
  - `node_modules/` - Cached npm packages
  - `.next-cache/` - Next.js build cache

### Dashboard Cache
- **Location**: `/var/cache/windchasers-dashboard/`
- **Contents**:
  - `node_modules/` - Cached npm packages
  - `.next-cache/` - Next.js build cache

## How It Works

### node_modules Caching
1. **Cache Key**: MD5/SHA256 hash of `package-lock.json`
2. **Cache Hit**: If lockfile unchanged, copy cached `node_modules`
3. **Cache Miss**: Install dependencies and save to cache
4. **Speed Improvement**: 70-90% faster installs on cache hits

### .next/cache Caching
1. **Cache**: Next.js build cache (compiled pages, etc.)
2. **Restore**: Copy cached files before build
3. **Save**: Copy cache after successful build
4. **Speed Improvement**: 30-50% faster builds on cache hits

## Manual Cache Management

### Clear Cache (if needed)
```bash
# Web-agent
sudo rm -rf /var/cache/windchasers-web-agent

# Dashboard
sudo rm -rf /var/cache/windchasers-dashboard
```

### Check Cache Status
```bash
# Web-agent
ls -lh /var/cache/windchasers-web-agent/
du -sh /var/cache/windchasers-web-agent/*

# Dashboard
ls -lh /var/cache/windchasers-dashboard/
du -sh /var/cache/windchasers-dashboard/*
```

### Verify Cache Validity
```bash
# Check if cache matches current lockfile
cd /var/www/windchasers-web-agent
CURRENT_HASH=$(md5sum package-lock.json | cut -d' ' -f1)
CACHED_HASH=$(cat /var/cache/windchasers-web-agent/node_modules/.cache-valid 2>/dev/null || echo "")
echo "Current: $CURRENT_HASH"
echo "Cached:  $CACHED_HASH"
```

## Expected Performance

### First Build (No Cache)
- Install: ~2-3 minutes
- Build: ~3-5 minutes
- **Total: ~5-8 minutes**

### Subsequent Builds (Cache Hit)
- Install: ~10-30 seconds (cached)
- Build: ~1-3 minutes (with cache)
- **Total: ~2-4 minutes** (50-60% faster)

### After Dependency Changes
- Install: ~2-3 minutes (cache miss)
- Build: ~1-3 minutes (cache helps)
- **Total: ~3-6 minutes**

## Cache Maintenance

### Automatic Cleanup
Caches persist between deployments. To prevent disk space issues:

```bash
# Set up automatic cleanup (optional)
# Add to crontab: Clean caches older than 30 days
0 0 * * * find /var/cache/windchasers-* -type d -mtime +30 -exec rm -rf {} \;
```

### Disk Space Monitoring
```bash
# Check cache sizes
du -sh /var/cache/windchasers-*

# Typical sizes:
# node_modules: ~200-400 MB
# .next-cache: ~50-150 MB
```

## Troubleshooting

### Cache Not Working
1. Check directory permissions:
   ```bash
   sudo chown -R $USER:$USER /var/cache/windchasers-*
   ```

2. Check disk space:
   ```bash
   df -h /var/cache
   ```

3. Verify cache directories exist:
   ```bash
   ls -la /var/cache/windchasers-*
   ```

### Build Still Slow
1. Check if cache is being used (look for "Using cached" messages)
2. Verify lockfile hasn't changed
3. Check VPS CPU/memory resources
4. Review build logs for bottlenecks

### Cache Corruption
If builds fail after cache restore:
```bash
# Clear cache and rebuild
sudo rm -rf /var/cache/windchasers-web-agent
sudo rm -rf /var/cache/windchasers-dashboard
```

## Best Practices

1. **Don't manually modify caches** - Let the workflow manage them
2. **Monitor disk space** - Caches can grow over time
3. **Clear cache after major updates** - npm/Next.js version changes
4. **Keep package-lock.json committed** - Required for cache validation
