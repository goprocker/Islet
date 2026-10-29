# Watches the PC once a second and prints a JSON line when something changes:
#   mic / cam / screen : apps using the microphone, camera, or Windows screen capture
#   fullscreen         : the foreground window covers its whole monitor (game, video)
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Fg {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string Fullscreen() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return null;
    var cls = new StringBuilder(64); GetClassName(h, cls, 64);
    string c = cls.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return null; // desktop / taskbar
    RECT r; if (!GetWindowRect(h, out r)) return null;
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return null;
    var m = mi.rcMonitor;
    if (r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      return pid.ToString();
    }
    return null;
  }
}
"@

$base = "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore"
function InUse($cap) {
  $apps = @()
  foreach ($k in @(Get-ChildItem "$base\$cap") + @(Get-ChildItem "$base\$cap\NonPackaged")) {
    if ($k.PSChildName -eq "NonPackaged") { continue }
    $p = Get-ItemProperty $k.PSPath
    if ($p.LastUsedTimeStart -gt 0 -and $p.LastUsedTimeStop -eq 0) {
      # "C:#Program Files#...#chrome.exe" or "Microsoft.WindowsCamera_8wekyb3d8bbwe"
      $name = ($k.PSChildName -split '#')[-1] -replace '\.exe$', '' -replace '_[a-z0-9]{13}$', ''
      $apps += ($name -split '\.')[-1]
    }
  }
  , @($apps | Select-Object -Unique)
}

$last = ""
$fsPrev = $false; $fsStable = $false
while ($true) {
  $fsPid = [Fg]::Fullscreen()
  $own = $fsPid -and ((Get-Process -Id $fsPid).ProcessName -match '^(electron|islet)$')
  # change only after two equal readings, so a focus blip doesn't flash the notch
  $fsNow = [bool]($fsPid -and -not $own)
  if ($fsNow -eq $fsPrev) { $fsStable = $fsNow }
  $fsPrev = $fsNow
  $state = [ordered]@{
    mic        = InUse "microphone"
    cam        = InUse "webcam"
    screen     = [string[]]@(@(InUse "graphicsCaptureProgrammatic") + @(InUse "graphicsCaptureWithoutBorder") | Where-Object { $_ } | Select-Object -Unique)
    fullscreen = $fsStable
  }
  $json = $state | ConvertTo-Json -Compress
  if ($json -ne $last) { $last = $json; Write-Output $json }
  Start-Sleep -Milliseconds 1000
}
