# Wi-Fi and Bluetooth radios through the Windows radio API.
#   radios.ps1 get                       -> {"wifi":"On","bluetooth":"Off"}  (a missing radio is left out)
#   radios.ps1 toggle wifi|bluetooth     -> flips it and prints the same JSON
#   radios.ps1 set wifi|bluetooth on|off
#   radios.ps1 set all on|off            -> airplane mode: every radio; the report gains "airplane":true|false
param([string]$Mode = "get", [string]$Kind = "", [string]$State = "")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}
$RadioType = [Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime]
$AccessType = [Windows.Devices.Radios.RadioAccessStatus, Windows.System.Devices, ContentType = WindowsRuntime]
$ListType = [System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]
$StateType = [Windows.Devices.Radios.RadioState, Windows.System.Devices, ContentType = WindowsRuntime]

[void](Await ($RadioType::RequestAccessAsync()) $AccessType)
$radios = @(Await ($RadioType::GetRadiosAsync()) $ListType)
# RadioKind: 1 = Wi-Fi, 2 = Bluetooth
function Pick($name) {
  $want = if ($name -eq "wifi") { 1 } elseif ($name -eq "bluetooth") { 2 } else { 0 }
  $radios | Where-Object { [int]$_.Kind -eq $want } | Select-Object -First 1
}
function Report {
  $o = [ordered]@{}
  foreach ($n in "wifi", "bluetooth") { $r = Pick $n; if ($r) { $o[$n] = [string]$r.State } }
  if ($radios.Count -gt 0) { $o["airplane"] = -not ($radios | Where-Object { [string]$_.State -eq "On" }) }
  $o | ConvertTo-Json -Compress
}

if ($Mode -eq "set" -and $Kind -eq "all") {
  # airplane mode: everything off; turning it off brings back Wi-Fi and Bluetooth only
  $target = (Get-Culture).TextInfo.ToTitleCase($State.ToLower())
  foreach ($r in $radios) {
    if ($target -eq "On" -and [int]$r.Kind -notin 1, 2) { continue }
    [void](Await ($r.SetStateAsync([Windows.Devices.Radios.RadioState]$target)) $AccessType)
  }
} elseif ($Mode -ne "get") {
  $r = Pick $Kind
  if (-not $r) { Write-Output ('{"error":"no ' + $Kind + ' radio"}'); exit 1 }
  $target = if ($Mode -eq "toggle") { if ([string]$r.State -eq "On") { "Off" } else { "On" } } else { (Get-Culture).TextInfo.ToTitleCase($State.ToLower()) }
  [void](Await ($r.SetStateAsync([Windows.Devices.Radios.RadioState]$target)) $AccessType)
}
Report
