#!/bin/bash
# Kill process on a specific port
# Usage: ./scripts/kill-port.sh [port]
# Example: ./scripts/kill-port.sh 4000

PORT=${1:-4000}

echo "🔍 Checking port $PORT..."

# Find process using the port
PID=$(lsof -ti:$PORT 2>/dev/null)

if [ -z "$PID" ]; then
  echo "✅ Port $PORT is free"
  exit 0
fi

echo "⚠️  Port $PORT is in use by process $PID"
ps -p $PID -o pid,cmd 2>/dev/null || echo "Process details not available"

read -p "Kill process $PID? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  kill -9 $PID 2>/dev/null
  sleep 1
  if lsof -ti:$PORT >/dev/null 2>&1; then
    echo "❌ Failed to kill process on port $PORT"
    exit 1
  else
    echo "✅ Port $PORT is now free"
  fi
else
  echo "Cancelled"
  exit 0
fi
