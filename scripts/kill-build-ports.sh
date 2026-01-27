#!/bin/bash
# kill-build-ports.sh - Kill all processes on build ports

PORTS=(4000 4001 4002 4003 4100 4101)

echo "Checking and killing processes on build ports..."

for port in "${PORTS[@]}"; do
  pid=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "Killing process $pid on port $port"
    kill -9 $pid 2>/dev/null
    sleep 0.5
  else
    echo "Port $port is free"
  fi
done

echo ""
echo "Verifying ports are free:"
for port in "${PORTS[@]}"; do
  pid=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "⚠️  Port $port: STILL IN USE (PID: $pid)"
  else
    echo "✅ Port $port: FREE"
  fi
done
