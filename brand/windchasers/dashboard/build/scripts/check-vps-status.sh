#!/bin/bash
# Diagnostic script to check VPS deployment status

echo "🔍 VPS Deployment Diagnostic"
echo "============================"
echo ""

echo "📊 PM2 Process Status:"
echo "---------------------"
pm2 list | grep -E "windchasers|proxe" || echo "No windchasers processes found"
echo ""

echo "📁 Deployment Directory Check:"
echo "-------------------------------"
echo "Dashboard directory: /var/www/windchasers-proxe"
if [ -d "/var/www/windchasers-proxe" ]; then
  echo "✅ Directory exists"
  echo "   Contents:"
  ls -la /var/www/windchasers-proxe | head -20
  echo ""
  echo "   .next directory:"
  if [ -d "/var/www/windchasers-proxe/.next" ]; then
    echo "   ✅ .next exists"
    ls -la /var/www/windchasers-proxe/.next | head -10
  else
    echo "   ❌ .next directory missing!"
  fi
  echo ""
  echo "   package.json:"
  if [ -f "/var/www/windchasers-proxe/package.json" ]; then
    cat /var/www/windchasers-proxe/package.json | grep -E '"name"|"version"' | head -5
  else
    echo "   ❌ package.json missing!"
  fi
else
  echo "❌ Directory does not exist!"
fi
echo ""

echo "🌐 Nginx Configuration:"
echo "----------------------"
if [ -f "/etc/nginx/sites-available/proxe.windchasers.in" ]; then
  echo "✅ Nginx config exists"
  echo "   Proxy target:"
  grep -A 5 "location /" /etc/nginx/sites-available/proxe.windchasers.in | head -10
else
  echo "❌ Nginx config not found!"
fi
echo ""

echo "🔌 Port Check:"
echo "--------------"
echo "Port 3003 (dashboard):"
netstat -tlnp | grep :3003 || echo "   Not listening"
echo "Port 3001 (web-agent):"
netstat -tlnp | grep :3001 || echo "   Not listening"
echo ""

echo "📝 PM2 Logs (last 20 lines):"
echo "---------------------------"
pm2 logs windchasers-dashboard --lines 20 --nostream 2>/dev/null || echo "No logs available"
echo ""

echo "🏥 Health Check:"
echo "----------------"
curl -s http://localhost:3003/api/health 2>/dev/null | head -10 || echo "❌ Health endpoint not responding"
echo ""

echo "📦 Build Info:"
echo "--------------"
if [ -f "/var/www/windchasers-proxe/.next/BUILD_ID" ]; then
  echo "   BUILD_ID: $(cat /var/www/windchasers-proxe/.next/BUILD_ID)"
  echo "   Build timestamp: $(stat -c %y /var/www/windchasers-proxe/.next/BUILD_ID 2>/dev/null || echo 'unknown')"
else
  echo "   ❌ BUILD_ID not found - build may be incomplete"
fi
