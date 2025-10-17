# PowerShell launcher for Native Messaging Host
# This ensures binary stdin/stdout handling without cmd.exe interference

$hostScript = Join-Path $PSScriptRoot "host.js"
$nodePath = "C:\Program Files\nodejs\node.exe"

# Start node.exe with proper binary mode handling
& $nodePath $hostScript
