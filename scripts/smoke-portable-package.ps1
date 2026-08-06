param(
  [string]$ArtifactPath,
  [int]$TimeoutSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectRoot 'release'

if (-not $ArtifactPath) {
  $artifacts = @(
    Get-ChildItem `
      -LiteralPath $releaseDir `
      -File `
      -Filter 'hermes-workspace-*-windows-x64-portable.exe'
  )
  if ($artifacts.Count -ne 1) {
    throw "Expected exactly one x64 portable artifact in $releaseDir; found $($artifacts.Count)."
  }
  $ArtifactPath = $artifacts[0].FullName
}

$ArtifactPath = (Resolve-Path -LiteralPath $ArtifactPath).Path
if ([IO.Path]::GetExtension($ArtifactPath) -ne '.exe') {
  throw "Portable artifact is not an executable: $ArtifactPath"
}

$existingListener = Get-NetTCPConnection `
  -State Listen `
  -LocalAddress '127.0.0.1' `
  -LocalPort 3847 `
  -ErrorAction SilentlyContinue
if ($existingListener) {
  throw 'Port 3847 is already in use; refusing to smoke-test an ambiguous process.'
}

$shimDir = Join-Path ([IO.Path]::GetTempPath()) ("hermes-portable-smoke-{0}" -f [guid]::NewGuid())
New-Item -ItemType Directory -Path $shimDir | Out-Null
Set-Content `
  -LiteralPath (Join-Path $shimDir 'hermes.cmd') `
  -Encoding Ascii `
  -Value "@echo off`r`nexit /b 0`r`n"

$oldPath = $env:PATH
$env:PATH = "$shimDir;$oldPath"
$env:ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
$portableProcess = $null
$ready = $false

function Stop-ProcessTree([int]$ProcessId) {
  & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

try {
  $portableProcess = Start-Process `
    -FilePath $ArtifactPath `
    -ArgumentList @('--no-sandbox', '--disable-gpu') `
    -PassThru
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $portableProcess.Refresh()
    if ($portableProcess.HasExited) {
      throw "Portable application exited before readiness with code $($portableProcess.ExitCode)."
    }

    try {
      $response = Invoke-WebRequest `
        -UseBasicParsing `
        -Uri 'http://127.0.0.1:3847/?desktop=1' `
        -TimeoutSec 2
      if (
        $response.StatusCode -eq 200 -and
        $response.Content.Contains('Hermes Workspace')
      ) {
        $ready = $true
        break
      }
    } catch {
      # The extracted application can take several seconds to start listening.
    }

    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    throw "Portable application did not become ready within $TimeoutSeconds seconds."
  }
} finally {
  if ($portableProcess) {
    Stop-ProcessTree $portableProcess.Id
  }

  $listeners = @(
    Get-NetTCPConnection `
      -State Listen `
      -LocalAddress '127.0.0.1' `
      -LocalPort 3847 `
      -ErrorAction SilentlyContinue
  )
  foreach ($listener in $listeners) {
    Stop-ProcessTree $listener.OwningProcess
  }

  $env:PATH = $oldPath
  Remove-Item -LiteralPath $shimDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Portable package smoke passed: $ArtifactPath"
