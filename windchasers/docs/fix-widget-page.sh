#!/bin/bash
# Quick fix script for widget page showing wrong content
# Run this on the VPS: bash fix-widget-page.sh

set -e

echo "🔧 Fixing widget page routing issue..."
echo ""

# Step 1: Check current state
echo "1. Checking web-agent status..."
cd /var/www/windchasers-web-agent
pm2 list | grep windchasers-web-agent || echo "   ⚠️  Web-agent not running"

echo ""
echo "2. Testing widget endpoint..."
echo "   Direct (port 3001):"
curl -s http://localhost:3001/widget | head -20 || echo "   ❌ Failed"

echo ""
echo "3. Checking widget page build..."
if [ -f ".next/server/app/widget/page.js" ] || [ -f ".next/server/app/widget/page.html" ]; then
    echo "   ✅ Widget page exists in build"
    ls -la .next/server/app/widget/ | head -5
else
    echo "   ❌ Widget page NOT found in build!"
    echo "   This is the problem - widget page wasn't built"
fi

echo ""
echo "4. Rebuilding web-agent..."
echo "   This will take a few minutes..."

# Clean build
rm -rf .next
npm run build

echo ""
echo "5. Verifying widget page was built..."
if [ -f ".next/server/app/widget/page.js" ] || [ -f ".next/server/app/widget/page.html" ]; then
    echo "   ✅ Widget page now exists!"
else
    echo "   ❌ Widget page still missing - check build logs"
    exit 1
fi

echo ""
echo "6. Restarting web-agent..."
pm2 restart windchasers-web-agent

echo ""
echo "7. Waiting for restart..."
sleep 5

echo ""
echo "8. Testing widget endpoint again..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/widget)
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Widget endpoint responding (HTTP $HTTP_CODE)"
else
    echo "   ⚠️  Widget endpoint returned HTTP $HTTP_CODE"
fi

echo ""
echo "✅ Fix complete!"
echo ""
echo "Test the widget:"
echo "  curl https://proxe.windchasers.in/widget | head -50"
echo ""
echo "The widget should show ChatWidget, not informational content."
