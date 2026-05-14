param(
  [string]$Distro = "Ubuntu",
  [string]$WorkspacePath = "",
  [string]$SessionName = "hermes-workspace",
  [switch]$Restart
)

$ErrorActionPreference = "Stop"

function Invoke-WslBash {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  $output = & wsl.exe -d $Distro -- bash -lc $Command 2>&1
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output   = @($output)
  }
}

function Assert-WslOk {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(Mandatory = $true)]
    [string]$ErrorMessage
  )

  $result = Invoke-WslBash -Command $Command
  if ($result.ExitCode -ne 0) {
    $details = ($result.Output -join "`n").Trim()
    if ($details) {
      throw "$ErrorMessage`n$details"
    }
    throw $ErrorMessage
  }
}

$whoamiResult = Invoke-WslBash -Command "whoami"
if ($whoamiResult.ExitCode -ne 0 -or $whoamiResult.Output.Count -eq 0) {
  throw "Could not determine the WSL username for distro '$Distro'."
}
$wslUser = ($whoamiResult.Output[-1]).Trim()
if ([string]::IsNullOrWhiteSpace($WorkspacePath)) {
  $WorkspacePath = "/home/$wslUser/hermes-workspace"
}

Assert-WslOk -Command "command -v tmux >/dev/null 2>&1" -ErrorMessage "tmux is not installed in WSL distro '$Distro'."
Assert-WslOk -Command "command -v pnpm >/dev/null 2>&1" -ErrorMessage "pnpm is not installed in WSL distro '$Distro'."
Assert-WslOk -Command "command -v hermes >/dev/null 2>&1" -ErrorMessage "hermes is not installed in WSL distro '$Distro'."
Assert-WslOk -Command "test -d '$WorkspacePath'" -ErrorMessage "Workspace path not found: $WorkspacePath"

$sessionCheck = Invoke-WslBash -Command "tmux has-session -t '$SessionName' 2>/dev/null"
$sessionExists = $sessionCheck.ExitCode -eq 0

if ($sessionExists -and -not $Restart) {
  Write-Host "Session '$SessionName' is already running. Use -Restart to recreate it."
  $paneInfo = Invoke-WslBash -Command "tmux list-panes -t '$SessionName' -F 'pane=#{pane_index} pid=#{pane_pid} cmd=#{pane_current_command}'"
  if ($paneInfo.ExitCode -eq 0 -and $paneInfo.Output.Count -gt 0) {
    $paneInfo.Output | ForEach-Object { Write-Host $_ }
  }
  Write-Host "Workspace URL: http://localhost:3000"
  return
}

if ($sessionExists -and $Restart) {
  Assert-WslOk -Command "tmux kill-session -t '$SessionName'" -ErrorMessage "Failed to stop existing tmux session '$SessionName'."
}

Assert-WslOk -Command "tmux new-session -d -s '$SessionName' -c '$WorkspacePath' 'pnpm start:all'" -ErrorMessage "Failed to start tmux session '$SessionName'."

Start-Sleep -Seconds 2
$postStart = Invoke-WslBash -Command "tmux has-session -t '$SessionName' 2>/dev/null"
if ($postStart.ExitCode -ne 0) {
  throw "tmux session '$SessionName' exited immediately after startup."
}
$logResult = Invoke-WslBash -Command "tmux capture-pane -pt '$SessionName':0.0 -S -40"

Write-Host "Started Hermes Gateway + Workspace in tmux session '$SessionName'."
Write-Host "Workspace URL: http://localhost:3000"
Write-Host "View logs with: wsl -d $Distro -- tmux attach -t $SessionName"
Write-Host "Tail logs:"
if ($logResult.ExitCode -eq 0 -and $logResult.Output.Count -gt 0) {
  $logResult.Output | ForEach-Object { Write-Host $_ }
}
