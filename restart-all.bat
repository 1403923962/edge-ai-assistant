@echo off
echo Stopping all edge-ai-assistant services...

REM Kill all node processes related to edge-ai-assistant
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.exe"') do (
    netstat -ano | findstr ":9999" | findstr "%%a" && taskkill /F /PID %%a 2>nul
    netstat -ano | findstr ":3200" | findstr "%%a" && taskkill /F /PID %%a 2>nul
)

timeout /t 2 /nobreak >nul

echo Starting Native Host...
cd /d "%~dp0"
start /B node native-host/host.js

timeout /t 2 /nobreak >nul

echo Starting MCP Server...
start /B node mcp-server/server-sdk.js

timeout /t 3 /nobreak >nul

echo.
echo Services started!
curl http://localhost:9999/health
echo.
curl http://localhost:3200/health
