# Volume, brightness and live captions for the Quick Settings panel.
#   quickset.ps1 get              -> {"vol":0.42,"mute":false,"bright":55}  (bright is null without a built-in screen)
#   quickset.ps1 vol 0..1         -> sets the speaker volume, then prints the same JSON
#   quickset.ps1 mute on|off      -> mutes or unmutes the speakers
#   quickset.ps1 bright 0..100    -> sets laptop brightness
#   quickset.ps1 captions         -> presses Win+Ctrl+L (Windows Live captions)
param([string]$Mode = "get", [string]$Value = "")
$ErrorActionPreference = "SilentlyContinue"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class QsVolume {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { void EnumAudioEndpoints(int flow, int mask, out IntPtr devices); void GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device); }
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
  static IAudioEndpointVolume Ep() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioEndpointVolume).GUID; object o;
    dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    return (IAudioEndpointVolume)o;
  }
  public static bool Read(out float vol, out bool mute) {
    vol = 0; mute = false;
    try { var e = Ep(); e.GetMasterVolumeLevelScalar(out vol); e.GetMute(out mute); return true; } catch { return false; }
  }
  public static void SetVol(float v) { Guid g = Guid.Empty; Ep().SetMasterVolumeLevelScalar(v, ref g); }
  public static void SetMute(bool m) { Guid g = Guid.Empty; Ep().SetMute(m, ref g); }
}
public static class QsKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void WinCtrlL() {
    keybd_event(0x5B, 0, 0, UIntPtr.Zero); keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x4C, 0, 0, UIntPtr.Zero);
    keybd_event(0x4C, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero); keybd_event(0x5B, 0, 2, UIntPtr.Zero);
  }
}
"@
$inv = [Globalization.CultureInfo]::InvariantCulture
switch ($Mode) {
  "vol" { [QsVolume]::SetVol([single][math]::Min(1.0, [math]::Max(0.0, [double]::Parse($Value, $inv)))) }
  "mute" { [QsVolume]::SetMute($Value -eq "on") }
  "bright" {
    $b = [byte][math]::Min(100, [math]::Max(0, [int]$Value))
    Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $b } | Out-Null }
  }
  "captions" { [QsKeys]::WinCtrlL(); exit 0 }
}
$v = [single]0; $m = $false
$ok = [QsVolume]::Read([ref]$v, [ref]$m)
$cur = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness | Select-Object -First 1
$bright = if ($cur) { [int]$cur.CurrentBrightness } else { 'null' }
'{"vol":' + $(if ($ok) { [math]::Round($v, 3).ToString($inv) } else { 'null' }) + ',"mute":' + $m.ToString().ToLower() + ',"bright":' + $bright + '}'
