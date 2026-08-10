$ErrorActionPreference = 'Stop'
$taskName = 'Hermes_Workspace_Stack'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-PinnedExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Candidates
  )
  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace([string]$candidate)) {
      continue
    }
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      $resolved = (Resolve-Path -LiteralPath $candidate).ProviderPath
      if (-not [IO.Path]::IsPathRooted($resolved)) {
        throw "$Name resolved to a non-absolute path: $resolved"
      }
      return $resolved
    }
  }
  throw "$Name executable was not found in any validated candidate path."
}

function Assert-PinnedExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  if ($Name -eq 'pythonw') {
    $quotedArguments = @(
      $Arguments | ForEach-Object {
        '"' + $_.Replace('"', '\"') + '"'
      }
    ) -join ' '
    $process = Start-Process `
      -FilePath $Path `
      -ArgumentList $quotedArguments `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    $exitCode = $process.ExitCode
  } else {
    & $Path @Arguments *> $null
    $exitCode = $LASTEXITCODE
  }
  if ($exitCode -ne 0) {
    throw "$Name validation failed for $Path with exit code $exitCode."
  }
}

function Quote-TaskArgument {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) {
    throw "Scheduled-task arguments cannot contain a double quote: $Value"
  }
  return '"' + $Value + '"'
}

$programFiles = $env:ProgramFiles
$localPrograms = Join-Path $env:LOCALAPPDATA 'Programs'
$hermesHome = Join-Path $env:LOCALAPPDATA 'hermes'

$python = Resolve-PinnedExecutable 'python' @(
  (Join-Path $programFiles 'Python312\python.exe'),
  (Join-Path $localPrograms 'Python\Python312\python.exe')
)
$pythonw = Resolve-PinnedExecutable 'pythonw' @(
  (Join-Path (Split-Path -Parent $python) 'pythonw.exe'),
  (Join-Path $programFiles 'Python312\pythonw.exe'),
  (Join-Path $localPrograms 'Python\Python312\pythonw.exe')
)
$hermes = Resolve-PinnedExecutable 'hermes' @(
  (Join-Path $hermesHome 'hermes-agent\venv\Scripts\hermes.exe')
)
$node = Resolve-PinnedExecutable 'node' @(
  (Join-Path $programFiles 'nodejs\node.exe'),
  (Join-Path $localPrograms 'nodejs\node.exe')
)
$npm = Resolve-PinnedExecutable 'npm' @(
  (Join-Path $programFiles 'nodejs\npm.cmd'),
  (Join-Path $localPrograms 'nodejs\npm.cmd')
)
$agy = Resolve-PinnedExecutable 'agy' @(
  (Join-Path $env:LOCALAPPDATA 'agy\bin\agy.exe')
)

Assert-PinnedExecutable 'python' $python @('--version')
Assert-PinnedExecutable 'pythonw' $pythonw @('-c', 'import sys; raise SystemExit(0)')
Assert-PinnedExecutable 'python-psutil' $python @('-c', 'import psutil')
Assert-PinnedExecutable 'hermes' $hermes @('--version')
Assert-PinnedExecutable 'node' $node @('--version')
Assert-PinnedExecutable 'npm' $npm @('--version')
Assert-PinnedExecutable 'agy' $agy @('--version')

$supervisorPath = Join-Path $root 'supervisor.py'
$supervisorArguments = @(
  (Quote-TaskArgument $supervisorPath),
  '--python-exe', (Quote-TaskArgument $python),
  '--pythonw-exe', (Quote-TaskArgument $pythonw),
  '--hermes-exe', (Quote-TaskArgument $hermes),
  '--node-exe', (Quote-TaskArgument $node),
  '--npm-exe', (Quote-TaskArgument $npm),
  '--agy-exe', (Quote-TaskArgument $agy)
) -join ' '

$action = New-ScheduledTaskAction `
  -Execute $pythonw `
  -Argument $supervisorArguments `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description 'Single-instance supervisor for Hermes gateway, Claude Max relay, Antigravity relay, dashboard, and Workspace.' `
  -Force | Out-Null

$desktopPath = [Environment]::GetFolderPath('DesktopDirectory')
$shortcutPath = Join-Path $desktopPath 'Hermes Workspace.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $root 'launch-workspace.ps1'))
$shortcut.WorkingDirectory = $root
$shortcut.Description = 'Start or recover Hermes Workspace, then open Operations'
$shortcut.Save()

# Start only when registration did not leave the task running. IgnoreNew remains
# the second line of defense, but avoiding a redundant start also keeps
# LastTaskResult from being polluted with ERROR_REQUEST_REFUSED.
$registeredTask = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($registeredTask.State -ne 'Running') {
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
}
Write-Output "Installed and started $taskName"
Write-Output "Launcher: $shortcutPath"
