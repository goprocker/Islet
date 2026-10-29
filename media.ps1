# Bridge to Windows media session (SMTC) for Spotify.
#   media.ps1 watch          -> prints one JSON line per second
#   media.ps1 <command>      -> toggle | next | prev, then exits
#   media.ps1 seek <seconds>
param([string]$Mode = "watch", [double]$Arg = 0)

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

$MgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$PropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$AsStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 }
$StreamType =[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$mgr = Await ($MgrType::RequestAsync()) $MgrType

function Get-Spotify {
  $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1
}
# which player to show: Spotify while it plays, else any other player that plays
# (YouTube in a browser, VLC, Media Player...), else paused Spotify, else whatever Windows picks
function Get-Player {
  $all = @($mgr.GetSessions())
  $playing = { param($x) $x.GetPlaybackInfo().PlaybackStatus -eq 4 }
  $sp = $all | Where-Object { $_.SourceAppUserModelId -like '*Spotify*' } | Select-Object -First 1
  if ($sp -and (& $playing $sp)) { return $sp }
  $other = $all | Where-Object { (& $playing $_) } | Select-Object -First 1
  if ($other) { return $other }
  if ($sp) { return $sp }
  $mgr.GetCurrentSession()
}

# "like": Spotify's own shortcut (Alt+Shift+B) sent to its window, then focus goes back
if ($Mode -eq "like") {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@
  $sp = Get-Process Spotify | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $sp) { exit }
  $prev = [Win]::GetForegroundWindow()
  $h = $sp.MainWindowHandle
  $wasMin = [Win]::IsIconic($h)
  # a bare Alt tap lets Windows hand focus to another app
  [Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  if ($wasMin) { [Win]::ShowWindow($h, 4) | Out-Null }
  [Win]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 150
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.SendKeys]::SendWait("%+b")
  Start-Sleep -Milliseconds 150
  if ($wasMin) { [Win]::ShowWindow($h, 6) | Out-Null }
  [Win]::SetForegroundWindow($prev) | Out-Null
  exit
}

if ($Mode -ne "watch") {
  $s = Get-Player
  if ($s) {
    switch ($Mode) {
      "toggle" { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
      "next"   { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
      "prev"   { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
      "seek"   { Await ($s.TryChangePlaybackPositionAsync([long]($Arg * 10000000))) ([bool]) | Out-Null }
    }
  }
  exit
}

$lastKey = ""
$art = $null
while ($true) {
  $s = Get-Player
  if (-not $s) {
    Write-Output '{"active":false}'
  } else {
    $p = Await ($s.TryGetMediaPropertiesAsync()) $PropsType
    $key = "$($p.Title)|$($p.Artist)"
    if ($key -ne $lastKey) { $lastKey = $key; $art = $null }
    # Spotify often sets the thumbnail a moment after the title, so keep trying until we get bytes
    if (-not $art -and $p.Thumbnail) {
      $rs = Await ($p.Thumbnail.OpenReadAsync()) $StreamType
      if ($rs) {
        # PowerShell 5 can't resolve this overload on a COM object, so call it through reflection
        $st = $AsStreamForRead.Invoke($null, @($rs))
        $ms = New-Object System.IO.MemoryStream
        $st.CopyTo($ms); $st.Dispose()
        if ($ms.Length -gt 0) { $art = "data:image/jpeg;base64," + [Convert]::ToBase64String($ms.ToArray()) }
      }
    }
    $tl = $s.GetTimelineProperties()
    $out = [ordered]@{
      active   = $true
      title    = $p.Title
      artist   = $p.Artist
      playing  = ($s.GetPlaybackInfo().PlaybackStatus -eq 4)
      position = $tl.Position.TotalSeconds
      duration = $tl.EndTime.TotalSeconds
      updated  = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
      art      = $art
      source   = $s.SourceAppUserModelId
    }
    Write-Output ($out | ConvertTo-Json -Compress)
  }
  Start-Sleep -Milliseconds 1000
}
