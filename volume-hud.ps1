# Watches the system volume, mute and (laptop screens only) brightness and prints a JSON line
# whenever one changes: {"vol":0.42,"mute":false,"bright":55}  (bright is null without a built-in screen).
# Runs inside helpers.ps1 as the "H" watcher.
$ErrorActionPreference = "SilentlyContinue"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SysVolume {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    void EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
    void GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { void Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    void RegisterControlChangeNotify(IntPtr n); void UnregisterControlChangeNotify(IntPtr n);
    void GetChannelCount(out uint c);
    void SetMasterVolumeLevel(float l, ref Guid g); void SetMasterVolumeLevelScalar(float l, ref Guid g);
    void GetMasterVolumeLevel(out float l); void GetMasterVolumeLevelScalar(out float l);
    void SetChannelVolumeLevel(uint c, float l, ref Guid g); void SetChannelVolumeLevelScalar(uint c, float l, ref Guid g);
    void GetChannelVolumeLevel(uint c, out float l); void GetChannelVolumeLevelScalar(uint c, out float l);
    void SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g); void GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
  }
  static IAudioEndpointVolume ep;
  // false when there is no output device right now
  public static bool Read(out float vol, out bool mute) {
    vol = 0; mute = false;
    try {
      if (ep == null) {
        var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
        Guid iid = typeof(IAudioEndpointVolume).GUID; object o;
        dev.Activate(ref iid, 23, IntPtr.Zero, out o);
        ep = (IAudioEndpointVolume)o;
      }
      ep.GetMasterVolumeLevelScalar(out vol); ep.GetMute(out mute);
      return true;
    } catch { ep = null; return false; } // device changed or went away: look it up again next time
  }
}
"@

$last = ""; $tick = 0; $bright = $null; $brightEvery = 15 # polls of ~130 ms: about 2 s
while ($true) {
  if ($tick % $brightEvery -eq 0) {
    $b = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness | Select-Object -First 1
    $bright = if ($b) { [int]$b.CurrentBrightness } else { $null }
    if ($null -eq $bright -and $tick -ge 15) { $brightEvery = 230 } # no built-in screen: check rarely, about 30 s
  }
  $tick++
  $v = [single]0; $m = $false
  if ([SysVolume]::Read([ref]$v, [ref]$m)) {
    $line = '{"vol":' + [math]::Round($v, 3).ToString([Globalization.CultureInfo]::InvariantCulture) + ',"mute":' + $m.ToString().ToLower() + ',"bright":' + $(if ($null -eq $bright) { 'null' } else { $bright }) + '}'
    if ($line -ne $last) { $last = $line; $line }
  }
  Start-Sleep -Milliseconds 130
}
