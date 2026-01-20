#!/bin/bash
# Script to verify what's actually running on VPS

echo "🔍 VPS Deployment Verification"
echo "=============================="
echo ""

echo "1️⃣  PM2 Processes:"
echo "-----------------"
pm2 list
echo ""

echo "2️⃣  What's running on port 3003 (dashboard):"
echo "---------------------------------------------"
netstat -tlnp | grep :3003 || echo "Nothing listening on port 3003"
echo ""

echo "3️⃣  Directory contents (/var/www/windchasers-proxe):"
echo "----------------------------------------------------"
if [ -d "/var/www/windchasers-proxe" ]; then
  echo "✅ Directory exists"
  echo "   package.json:"
  if [ -f "/var/www/windchasers-proxe/package.json" ]; then
    cat /var/www/windchasers-proxe/package.json | grep -E '"name"|"version"' | head -3
  fi
  echo ""
  echo "   .next directory:"
  ls -la /var/www/windchasers-proxe/.next 2>/dev/null | head -5 || echo "   ❌ .next not found"
  echo ""
  echo "   Recent files:"
  ls -lt /var/www/windchasers-proxe | head -10
else
  echo "❌ Directory does not exist!"
fi
echo ""

echo "4️⃣  Nginx Configuration for proxe.windchasers.in:"
echo "-------------------------------------------------"
if [ -f "/etc/nginx/sites-available/proxe.windchasers.in" ]; then
  echo "✅ Config file exists"
  echo ""
  echo "   Server name:"
  grep "server_name" /etc/nginx/sites-available/proxe.windchasers.in | head -3
  echo ""
  echo "   Location / (main proxy):"
  grep -A 10 "location /" /etc/nginx/sites-available/proxe.windchasers.in | head -12
  echo ""
  echo "   Proxy pass target:"
  grep "proxy_pass" /etc/nginx/sites-available/proxe.windchasers.in | grep -v "location /widget" | grep -v "location /api" | head -3
else
  echo "❌ Config file not found!"
fi
echo ""

echo "5️⃣  Test localhost:3003 response:"
echo "---------------------------------"
curl -s http://localhost:3003 | head -50 || echo "❌ Not responding"
echo ""

echo "6️⃣  Check for other deployment directories:"
echo "-------------------------------------------"
echo "   /var/www/dashboard:"
ls -la /var/www/dashboard 2>/dev/null | head -5 || echo "   Does not exist"
echo ""
echo "   /var/www/proxe:"
ls -la /var/www/proxe 2>/dev/null | head -5 || echo "   Does not exist"
echo ""

echo "7️⃣  PM2 process details (windchasers-dashboard):"
echo "------------------------------------------------"
pm2 describe windchasers-dashboard 2>/dev/null | head -30 || echo "Process not found"
echo ""

echo "8️⃣  Check what's actually being served:"
echo "--------------------------------------"
echo "   HTTP response headers:"
curl -I http://localhost:3003 2>/dev/null | head -10 || echo "   Not responding"
echo ""
