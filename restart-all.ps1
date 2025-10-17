# Stop all edge-ai-assistant services
Write-Host "Stopping services..." -ForegroundColor Yellow

# Find and kill processes on port 9999 and 3200
$port9999 = Get-NetTCPConnection -LocalPort 9999 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
$port3200 = Get-NetTCPConnection -LocalPort 3200 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pid in $port9999) {
    Write-Host "Killing process $pid on port 9999"
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

foreach ($pid in $port3200) {
    Write-Host "Killing process $pid on port 3200"
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# Start services
Write-Host "`nStarting Native Host..." -ForegroundColor Green
$env:PORT = "9999"
Start-Process -FilePath "node" -ArgumentList "native-host/host.js" -WorkingDirectory "C:\Users\1\edge-ai-assistant" -WindowStyle Hidden

Start-Sleep -Seconds 2

Write-Host "Starting MCP Server..." -ForegroundColor Green
$env:NATIVE_HOST_URL = "http://localhost:9999"
$env:MCP_PORT = "3200"
Start-Process -FilePath "node" -ArgumentList "mcp-server/server-sdk.js" -WorkingDirectory "C:\Users\1\edge-ai-assistant" -WindowStyle Hidden

Start-Sleep -Seconds 3

# Test services
Write-Host "`nTesting services..." -ForegroundColor Cyan
try {
    $native = Invoke-RestMethod -Uri "http://localhost:9999/health"
    Write-Host "Native Host: $($native | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "Native Host: Failed" -ForegroundColor Red
}

try {
    $mcp = Invoke-RestMethod -Uri "http://localhost:3200/health"
    Write-Host "MCP Server: $($mcp | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "MCP Server: Failed" -ForegroundColor Red
}
