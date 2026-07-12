$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$DataDir = if ($env:PLUGIN_DATA) { $env:PLUGIN_DATA } elseif ($env:CLAUDE_PLUGIN_DATA) { $env:CLAUDE_PLUGIN_DATA } elseif ($env:CBM_AXI_DATA_DIR) { $env:CBM_AXI_DATA_DIR } else { Join-Path $env:LOCALAPPDATA "cbm-axi" }
$InstallDir = Join-Path $DataDir "bin"
$Binary = Join-Path $InstallDir "cbm-axi.exe"
$Backend = Join-Path $InstallDir "codebase-memory-mcp.exe"
$Version = (Get-Content (Join-Path $Root ".codex-plugin\plugin.json") -Raw | ConvertFrom-Json).version
$BackendVersion = (Get-Content (Join-Path $Root "codebase-memory-mcp.version") -Raw).Trim()
$InstalledVersion = if (Test-Path $Binary) { & $Binary --version 2>$null } else { $null }
$InstalledBackendVersion = if (Test-Path (Join-Path $InstallDir "codebase-memory-mcp.version")) { (Get-Content (Join-Path $InstallDir "codebase-memory-mcp.version") -Raw).Trim() } else { $null }

if ($InstalledVersion -ne "version: v$Version" -or -not (Test-Path $Backend) -or $InstalledBackendVersion -ne $BackendVersion) {
  $env:CBM_AXI_INSTALL_DIR = $InstallDir
  $env:CBM_AXI_DATA_DIR = $DataDir
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\install.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$env:PATH = "$InstallDir;$env:PATH"
& $Binary @args
exit $LASTEXITCODE
