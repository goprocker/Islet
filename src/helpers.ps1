# One PowerShell for the four background watchers, each in its own runspace, because a
# PowerShell process per watcher costs about 65 MB each. Lines on stdout:
#   M <json> : media.ps1 watch
#   S <json> : system.ps1
#   H <json> : volume-hud.ps1
#   anything else comes from spotify-audio.cs, which also owns stdin (vol commands)
param([int]$ParentPid = 0)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$jobs = @(
  @{ Script = '& (Join-Path $root "media.ps1") watch | ForEach-Object { [Console]::Out.WriteLine("M $_") }' }
  @{ Script = '& (Join-Path $root "system.ps1") | ForEach-Object { [Console]::Out.WriteLine("S $_") }' }
  @{ Script = '& (Join-Path $root "volume-hud.ps1") | ForEach-Object { [Console]::Out.WriteLine("H $_") }' }
  @{ Script = '& (Join-Path $root "spotify-audio.ps1")' }
)
function Start-Watcher($job) {
  $rs = [RunspaceFactory]::CreateRunspace()
  $rs.ApartmentState = "MTA" # spotify-audio.cs and WinRT awaits both expect it
  $rs.Open()
  $rs.SessionStateProxy.SetVariable("root", $PSScriptRoot)
  $ps = [PowerShell]::Create()
  $ps.Runspace = $rs
  [void]$ps.AddScript($job.Script)
  $job.Ps = $ps
  $job.Handle = $ps.BeginInvoke()
}
foreach ($job in $jobs) { Start-Watcher $job }

while ($true) {
  Start-Sleep -Seconds 2
  # killed Islet leaves no one to stop us; exit would wait forever for the watchers
  if ($ParentPid -and -not (Get-Process -Id $ParentPid)) { [Diagnostics.Process]::GetCurrentProcess().Kill() }
  # a watcher that stopped comes back alone; the others keep running
  foreach ($job in $jobs) {
    if ($job.Handle.IsCompleted) {
      $job.Ps.Runspace.Dispose(); $job.Ps.Dispose()
      Start-Watcher $job
    }
  }
}
