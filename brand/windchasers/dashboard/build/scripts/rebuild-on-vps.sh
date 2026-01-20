#!/bin/bash
# Manual rebuild script for VPS
# Run this on the VPS to force a clean rebuild

set -e

echo "🔄 Starting manual rebuild on VPS..."

cd /var/www/windchasers-proxe

# Stop the app
echo "⏹️  Stopping application..."
pm2 stop windchasers-dashboard || pm2 stop ecosystem.config.js --only windchasers-dashboard || echo "App not running"

# Clean everything
echo "🧹 Cleaning build artifacts..."
rm -rf .next
rm -rf node_modules/.cache
rm -rf .next/cache 2>/dev/null || true

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build
echo "🏗️  Building application..."
echo "This may take several minutes..."
npm run build 2>&1 | tee build.log || {
  echo "❌ Build command failed!"
  echo "Last 50 lines of build output:"
  tail -50 build.log || true
  exit 1
}

# Verify build
if [ ! -d ".next" ]; then
  echo "❌ ERROR: Build failed - .next directory not found!"
  exit 1
fi

# Check BUILD_ID (critical)
if [ ! -f ".next/BUILD_ID" ]; then
  echo "❌ ERROR: BUILD_ID file not found - build is incomplete!"
  exit 1
fi
echo "✅ BUILD_ID found: $(cat .next/BUILD_ID)"

# Check chunks
CHUNK_COUNT=$(find .next/static/chunks -name "*.js" 2>/dev/null | wc -l)
if [ "$CHUNK_COUNT" -lt 50 ]; then
  echo "❌ ERROR: Only $CHUNK_COUNT chunks found - build is incomplete!"
  echo "Expected at least 50 chunks. Checking build.log for errors..."
  tail -50 build.log || true
  exit 1
else
  echo "✅ Found $CHUNK_COUNT chunk files"
fi

# Check CSS files
if [ -d ".next/static/css" ]; then
  CSS_COUNT=$(find .next/static/css -name "*.css" 2>/dev/null | wc -l)
  echo "✅ Found $CSS_COUNT CSS files"
  if [ "$CSS_COUNT" -eq 0 ]; then
    echo "⚠️  WARNING: No CSS files found - styling may be broken"
  fi
fi

# Restart
echo "🔄 Restarting application..."
if [ -f ecosystem.config.js ]; then
  pm2 restart ecosystem.config.js --only windchasers-dashboard || \
  pm2 start ecosystem.config.js --only windchasers-dashboard
else
  PORT=3003 pm2 restart windchasers-proxe || \
  PORT=3003 pm2 start npm --name windchasers-proxe -- start
fi

pm2 save

echo "✅ Rebuild complete!"
echo "📊 PM2 status:"
pm2 list | grep windchasers
