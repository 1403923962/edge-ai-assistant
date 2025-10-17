@echo off
echo ========================================
echo Edge AI Assistant - 启动服务
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] 启动 Native Host (端口9999)...
start "Native Host" cmd /k "set PORT=9999 && node native-host/host.js"

timeout /t 2 /nobreak >nul

echo [2/2] 测试连接...
curl http://localhost:9999/health

echo.
echo ========================================
echo ✅ 服务已启动
echo ========================================
echo.
echo Native Host: http://localhost:9999
echo SSE Events:  http://localhost:9999/events
echo.
echo 提示：
echo - 保持此窗口打开
echo - Native Host 在新窗口运行
echo - 现在可以使用 Claude Code 调用 MCP 工具
echo.
pause
