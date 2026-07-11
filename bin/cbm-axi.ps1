$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$DataDir = if ($env:PLUGIN_DATA) { $env:PLUGIN_DATA } elseif ($env:CLAUDE_PLUGIN_DATA) { $env:CLAUDE_PLUGIN_DATA } elseif ($env:CBM_AXI_DATA_DIR) { $env:CBM_AXI_DATA_DIR } else { Join-Path $env:LOCALAPPDATA "cbm-axi" }
$InstallDir = Join-Path $DataDir "bin"
$Binary = Join-Path $InstallDir "cbm-axi.exe"

if (-not (Test-Path $Binary)) {
  $env:CBM_AXI_INSTALL_DIR = $InstallDir
  $env:CBM_AXI_DATA_DIR = $DataDir
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\install.ps1")
}

& $Binary @args
exit $LASTEXITCODE
