@echo off
REM Start MCP Server (SSE version)
REM This script starts the SSE-based MCP Server for edge-ai-assistant

echo Starting Edge AI Assistant MCP Server (SSE)...

REM Set environment variables
set NATIVE_HOST_URL=http://localhost:9999
set MCP_PORT=3200

REM Start MCP Server
cd /d "%~dp0"
node mcp-server\server-sse.js
