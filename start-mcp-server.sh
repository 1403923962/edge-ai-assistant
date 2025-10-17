#!/bin/bash

# Start MCP Server (SSE version)
# This script starts the SSE-based MCP Server for edge-ai-assistant

echo "Starting Edge AI Assistant MCP Server (SSE)..."

# Check if port 3200 is already in use
if lsof -Pi :3200 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 3200 is already in use!"
    echo "Do you want to kill the existing process and restart? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Killing process on port 3200..."
        kill -9 $(lsof -ti:3200) 2>/dev/null || true
        sleep 1
    else
        echo "Aborted."
        exit 1
    fi
fi

# Set environment variables
export NATIVE_HOST_URL=http://localhost:9999
export MCP_PORT=3200

# Start MCP Server
cd "$(dirname "$0")"
node mcp-server/server-sse.js
