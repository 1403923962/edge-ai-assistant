# Edge AI Assistant Installation Script
# This script registers the native messaging host with Edge

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Edge AI Assistant Installation" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Get absolute paths
$projectPath = $PSScriptRoot
$nativeHostPath = Join-Path $projectPath "native-host"
$manifestPath = Join-Path $nativeHostPath "manifest.json"
$extensionPath = Join-Path $projectPath "extension"

Write-Host "Project Path: $projectPath" -ForegroundColor Yellow
Write-Host "Native Host: $nativeHostPath" -ForegroundColor Yellow
Write-Host "Extension: $extensionPath" -ForegroundColor Yellow
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js detected: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found! Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Step 1: Install extension and get ID
Write-Host ""
Write-Host "Step 1: Load Extension in Edge" -ForegroundColor Cyan
Write-Host "----------------------------------------"
Write-Host "1. Open Edge and go to: edge://extensions" -ForegroundColor Yellow
Write-Host "2. Enable 'Developer mode' (toggle in bottom-left)" -ForegroundColor Yellow
Write-Host "3. Click 'Load unpacked'" -ForegroundColor Yellow
Write-Host "4. Select folder: $extensionPath" -ForegroundColor Yellow
Write-Host "5. Copy the Extension ID (looks like: abcdefghijklmnopqrstuvwxyz)" -ForegroundColor Yellow
Write-Host ""

$extensionId = Read-Host "Enter the Extension ID you just copied"

if ($extensionId.Length -lt 20) {
    Write-Host "✗ Invalid Extension ID" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Extension ID: $extensionId" -ForegroundColor Green

# Step 2: Update manifest with extension ID
Write-Host ""
Write-Host "Step 2: Updating Native Host Manifest..." -ForegroundColor Cyan

$manifestContent = Get-Content $manifestPath -Raw
$manifestContent = $manifestContent -replace "EXTENSION_ID_PLACEHOLDER", $extensionId
$manifestContent = $manifestContent -replace '"path": "host.bat"', "`"path`": `"$(Join-Path $nativeHostPath "host.bat" | ConvertTo-Json)`""
Set-Content $manifestPath $manifestContent

Write-Host "✓ Manifest updated" -ForegroundColor Green

# Step 3: Register in Windows Registry
Write-Host ""
Write-Host "Step 3: Registering Native Messaging Host..." -ForegroundColor Cyan

$registryPath = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.edge.ai.assistant"

# Create registry key
if (Test-Path $registryPath) {
    Remove-Item $registryPath -Force
}

New-Item -Path $registryPath -Force | Out-Null
Set-ItemProperty -Path $registryPath -Name "(Default)" -Value $manifestPath

Write-Host "✓ Registry key created: $registryPath" -ForegroundColor Green
Write-Host "✓ Manifest path: $manifestPath" -ForegroundColor Green

# Step 4: Test
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Start the native host: npm start" -ForegroundColor White
Write-Host "2. Reload the extension in Edge (edge://extensions)" -ForegroundColor White
Write-Host "3. Check the extension popup for connection status" -ForegroundColor White
Write-Host ""
Write-Host "Native Host API will be available at: http://localhost:8765" -ForegroundColor Cyan
Write-Host ""
