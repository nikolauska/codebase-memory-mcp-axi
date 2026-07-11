$ErrorActionPreference = "Stop"

$DataDir = if ($env:PLUGIN_DATA) { $env:PLUGIN_DATA } elseif ($env:CLAUDE_PLUGIN_DATA) { $env:CLAUDE_PLUGIN_DATA } elseif ($env:CBM_AXI_DATA_DIR) { $env:CBM_AXI_DATA_DIR } else { $null }
$InstallDir = if ($env:CBM_AXI_INSTALL_DIR) { $env:CBM_AXI_INSTALL_DIR } elseif ($DataDir) { Join-Path $DataDir "bin" } else { "$env:LOCALAPPDATA\Programs\cbm-axi" }
$Version = if ($env:CBM_AXI_VERSION) { $env:CBM_AXI_VERSION } else { "latest" }
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "cbm-axi-install-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  $Backend = Get-Command codebase-memory-mcp -ErrorAction SilentlyContinue
  if (-not $Backend) {
    $UpstreamInstaller = Join-Path $TempDir "codebase-memory-mcp-install.ps1"
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1" -OutFile $UpstreamInstaller
    & powershell -ExecutionPolicy Bypass -File $UpstreamInstaller "--dir=$InstallDir" "--skip-config"
  }

  $Arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
  $BaseUrl = if ($Version -eq "latest") {
    "https://github.com/nikolauska/codebase-memory-mcp-axi/releases/latest/download"
  } else {
    "https://github.com/nikolauska/codebase-memory-mcp-axi/releases/download/$Version"
  }
  $Asset = "cbm-axi-windows-$Arch.exe"
  $Binary = Join-Path $TempDir $Asset
  $Checksums = Join-Path $TempDir "checksums.txt"
  Invoke-WebRequest -Uri "$BaseUrl/$Asset" -OutFile $Binary
  Invoke-WebRequest -Uri "$BaseUrl/checksums.txt" -OutFile $Checksums

  $Expected = (Get-Content $Checksums | Where-Object { $_ -match "(^|/)${Asset}$" } | Select-Object -First 1) -split "\s+" | Select-Object -First 1
  if (-not $Expected) { throw "checksum missing for $Asset" }
  $Actual = (Get-FileHash -Path $Binary -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Expected.ToLowerInvariant() -ne $Actual) { throw "checksum mismatch for $Asset" }

  Copy-Item $Binary (Join-Path $InstallDir "cbm-axi.exe") -Force
  $UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
  if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$UserPath;$InstallDir", "User")
  }
  Write-Host "Installed cbm-axi and codebase-memory-mcp to $InstallDir"
  Write-Host "Optional user hook setup: cbm-axi setup"
} finally {
  Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
