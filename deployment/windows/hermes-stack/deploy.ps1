[CmdletBinding(SupportsShouldProcess)]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'hermes'

$runtimeFiles = @(
  'stack-supervisor\supervisor.py',
  'stack-supervisor\install.ps1',
  'stack-supervisor\launch-workspace.ps1',
  'antigravity-relay\relay.py'
)

foreach ($relativePath in $runtimeFiles) {
  $source = Join-Path $sourceRoot $relativePath
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Versioned runtime source is missing: $source"
  }

  $destination = Join-Path $runtimeRoot $relativePath
  $destinationDirectory = Split-Path -Parent $destination
  if ($PSCmdlet.ShouldProcess($destination, "Deploy $source")) {
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

if (-not $SkipInstall -and -not $WhatIfPreference) {
  $installer = Join-Path $runtimeRoot 'stack-supervisor\install.ps1'
  & $installer
}

Write-Output "Hermes stack runtime deployed to $runtimeRoot"
