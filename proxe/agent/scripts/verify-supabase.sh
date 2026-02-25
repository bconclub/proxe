#!/bin/bash

# Supabase Connection Verification Script for Windchasers Dashboard
# This script verifies that Supabase is properly configured and connected
# Usage: ./scripts/verify-supabase.sh [port]
# Default port: 3003

set -e

PORT=${1:-3003}
APP_URL="http://localhost:${PORT}"

echo "🔍 Windchasers Dashboard - Supabase Connection Verification"
echo "============================================================"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ ERROR: .env.local file not found!"
  echo "   Please create .env.local with required Supabase credentials"
  echo "   See env.production.example for reference"
  exit 1
fi

echo "✅ .env.local file found"
echo ""

# Check for required environment variables
echo "📋 Checking environment variables..."

MISSING_VARS=()

if ! grep -q "NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL" .env.local; then
  MISSING_VARS+=("NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL")
fi

if ! grep -q "NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY" .env.local; then
  MISSING_VARS+=("NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY")
fi

if ! grep -q "SUPABASE_SERVICE_ROLE_KEY" .env.local; then
  MISSING_VARS+=("SUPABASE_SERVICE_ROLE_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "❌ Missing required environment variables:"
  for var in "${MISSING_VARS[@]}"; do
    echo "   - $var"
  done
  exit 1
fi

echo "✅ All required environment variables found"
echo ""

# Check if app is running
echo "🌐 Checking if application is running on port ${PORT}..."
if ! curl -s "${APP_URL}" > /dev/null 2>&1; then
  echo "⚠️  Application is not responding on port ${PORT}"
  echo "   Please start the application first:"
  echo "   pm2 start windchasers-dashboard"
  echo "   OR"
  echo "   pm2 start ecosystem.config.js --only windchasers-dashboard"
  exit 1
fi

echo "✅ Application is running"
echo ""

# Check /api/status endpoint
echo "🔍 Checking Supabase connection via /api/status endpoint..."

STATUS_RESPONSE=$(curl -s "${APP_URL}/api/status" 2>/dev/null || echo "")

if [ -z "$STATUS_RESPONSE" ]; then
  echo "❌ ERROR: Could not reach /api/status endpoint"
  echo "   Make sure the application is running and the endpoint is accessible"
  exit 1
fi

# Check if jq is available
if command -v jq &> /dev/null; then
  # Parse JSON response
  CAN_REACH=$(echo "$STATUS_RESPONSE" | jq -r '.connectivity.canReachSupabase // false')
  DB_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.database.status // "unknown"')
  AUTH_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.auth.status // "unknown"')
  URL_VALID=$(echo "$STATUS_RESPONSE" | jq -r '.supabaseConfig.urlValid // false')
  ANON_KEY_VALID=$(echo "$STATUS_RESPONSE" | jq -r '.supabaseConfig.anonKeyValid // false')
  SERVICE_KEY_VALID=$(echo "$STATUS_RESPONSE" | jq -r '.supabaseConfig.serviceRoleKeyValid // false')
  
  echo ""
  echo "📊 Supabase Configuration Status:"
  echo "   URL Valid: $URL_VALID"
  echo "   Anon Key Valid: $ANON_KEY_VALID"
  echo "   Service Role Key Valid: $SERVICE_KEY_VALID"
  echo ""
  echo "📡 Connectivity Status:"
  echo "   Can Reach Supabase: $CAN_REACH"
  echo "   Database Status: $DB_STATUS"
  echo "   Auth Status: $AUTH_STATUS"
  echo ""
  
  # Overall status
  if [ "$CAN_REACH" = "true" ] && [ "$DB_STATUS" = "connected" ] && [ "$AUTH_STATUS" = "ok" ]; then
    echo "✅ SUCCESS: Supabase is properly connected and working!"
    exit 0
  else
    echo "❌ ERROR: Supabase connection issues detected"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Verify Supabase credentials in .env.local"
    echo "2. Check PM2 logs: pm2 logs windchasers-dashboard"
    echo "3. Verify Supabase project is active: https://supabase.com/dashboard"
    echo "4. Check network connectivity"
    exit 1
  fi
else
  # Fallback: check for key strings in response
  echo ""
  if echo "$STATUS_RESPONSE" | grep -q '"canReachSupabase":true'; then
    if echo "$STATUS_RESPONSE" | grep -q '"status":"connected"'; then
      echo "✅ SUCCESS: Supabase appears to be connected!"
      echo ""
      echo "Note: Install 'jq' for more detailed status information:"
      echo "  sudo apt-get install jq  # Ubuntu/Debian"
      echo "  brew install jq          # macOS"
      exit 0
    else
      echo "⚠️  WARNING: Can reach Supabase but database may not be connected"
      echo "   Install 'jq' for detailed status: sudo apt-get install jq"
      exit 1
    fi
  else
    echo "❌ ERROR: Supabase connection issues detected"
    echo ""
    echo "Full status response:"
    echo "$STATUS_RESPONSE" | head -20
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Verify Supabase credentials in .env.local"
    echo "2. Check PM2 logs: pm2 logs windchasers-dashboard"
    echo "3. Install jq for better diagnostics: sudo apt-get install jq"
    exit 1
  fi
fi
