#!/bin/bash
# Edge AI Assistant - Native Host Startup Script
# Usage: ./start-native-host.sh

cd "$(dirname "$0")"

echo "========================================="
echo "Edge AI Assistant - Starting Native Host"
echo "========================================="
echo ""

# Check if port is already in use
if lsof -Pi :9999 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 9999 is already in use!"
    echo "Kill existing process? (y/n)"
    read -r answer
    if [ "$answer" = "y" ]; then
        lsof -ti:9999 | xargs kill -9
        echo "✓ Process killed"
        sleep 1
    else
        echo "Exiting..."
        exit 1
    fi
fi

echo "Starting Native Host on port 9999..."
echo ""

PORT=9999 node native-host/host.js

echo ""
echo "Native Host stopped."
