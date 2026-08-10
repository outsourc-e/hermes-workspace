[CmdletBinding()]
param(
  [ValidateRange(0, 600)]
  [int]$TimeoutSeconds = 45,

  [ValidateRange(1, 10000)]
  [int]$PollMilliseconds = 750,

  [switch]$NoFailureDialog
)

$ErrorActionPreference = 'Stop'
$taskName = 'Hermes_Workspace_Stack'
$url = 'http://127.0.0.1:3000/operations'
$expectedContent = 'Hermes Workspace'

try {
  try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  } catch {
    throw "Required scheduled task '$taskName' was not found. Run install.ps1 first. $($_.Exception.Message)"
  }

  if ($task.State -ne 'Running') {
    try {
      Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
    } catch {
      throw "Scheduled task '$taskName' could not be started. $($_.Exception.Message)"
    }
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $ready = $false
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 -ErrorAction Stop
      if (
        $response.StatusCode -eq 200 -and
        ([string]$response.Content).Contains($expectedContent)
      ) {
        $ready = $true
        break
      }
    } catch {
      # The scheduled supervisor may still be starting Workspace.
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  } while ((Get-Date) -lt $deadline)

  if (-not $ready) {
    $taskState = 'unknown'
    $lastTaskResult = 'unknown'
    try {
      $taskState = (Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State
      $lastTaskResult = (Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop).LastTaskResult
    } catch {
      # Preserve the health timeout as the primary failure.
    }
    throw "Hermes Workspace did not become healthy within $TimeoutSeconds seconds (task state: $taskState; last result: $lastTaskResult)."
  }

  Start-Process -FilePath $url -ErrorAction Stop
} catch {
  $message = "Hermes Workspace launcher failed: $($_.Exception.Message)"
  [Console]::Error.WriteLine($message)
  if (-not $NoFailureDialog) {
    try {
      $shell = New-Object -ComObject WScript.Shell
      [void]$shell.Popup($message, 0, 'Hermes Workspace', 0x10)
    } catch {
      # The nonzero exit and stderr message still surface failure to callers.
    }
  }
  exit 1
}
