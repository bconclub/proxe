#!/bin/bash
# Quick fix script for chunk loading errors
# Run this on the VPS: bash fix-chunk-loading.sh

set -e

echo "🔍 Diagnosing chunk loading issue..."
echo ""

# Check if chunk exists on dashboard
echo "1. Checking dashboard chunks..."
cd /var/www/windchasers-proxe
if [ -d ".next/static/chunks" ]; then
    CHUNK_COUNT=$(find .next/static/chunks -name "*.js" | wc -l)
    echo "   ✅ Dashboard has $CHUNK_COUNT chunks"
    
    # Check for specific chunk
    if find .next/static/chunks -name "392-*.js" | grep -q .; then
        echo "   ✅ Chunk 392 exists in dashboard"
    else
        echo "   ❌ Chunk 392 NOT found in dashboard"
    fi
else
    echo "   ❌ Dashboard .next/static/chunks directory missing!"
fi

echo ""

# Check if chunk exists on web-agent
echo "2. Checking web-agent chunks..."
cd /var/www/windchasers-web-agent
if [ -d ".next/static/chunks" ]; then
    CHUNK_COUNT=$(find .next/static/chunks -name "*.js" | wc -l)
    echo "   ✅ Web-agent has $CHUNK_COUNT chunks"
    
    # Check for specific chunk
    if find .next/static/chunks -name "392-*.js" | grep -q .; then
        echo "   ✅ Chunk 392 exists in web-agent"
    else
        echo "   ❌ Chunk 392 NOT found in web-agent"
    fi
else
    echo "   ❌ Web-agent .next/static/chunks directory missing!"
fi

echo ""

# Test direct access
echo "3. Testing direct access..."
echo "   Dashboard (port 3003):"
curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" http://localhost:3003/_next/static/chunks/392-41b8016a80ee3729.js || echo "   ❌ Failed to connect"

echo "   Web-agent (port 3001):"
curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" http://localhost:3001/_next/static/chunks/392-41b8016a80ee3729.js || echo "   ❌ Failed to connect"

echo ""

# Check PM2 status
echo "4. Checking PM2 processes..."
pm2 list | grep -E "windchasers|name" || echo "   ⚠️  PM2 not running or processes not found"

echo ""

# Fix options
echo "🔧 Fix options:"
echo ""
echo "Option A: Rebuild dashboard (if chunk missing)"
echo "  cd /var/www/windchasers-proxe"
echo "  npm run build"
echo "  pm2 restart windchasers-dashboard"
echo ""
echo "Option B: Rebuild web-agent (if chunk missing)"
echo "  cd /var/www/windchasers-web-agent"
echo "  npm run build"
echo "  pm2 restart windchasers-web-agent"
echo ""
echo "Option C: Clear nginx cache"
echo "  sudo rm -rf /var/cache/nginx/*"
echo "  sudo systemctl reload nginx"
echo ""
echo "Option D: Check nginx logs"
echo "  sudo tail -50 /var/log/nginx/proxe-windchasers-error.log"
echo "  sudo tail -50 /var/log/nginx/proxe-windchasers-access.log | grep 404"
echo ""
