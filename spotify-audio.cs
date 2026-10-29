// Captures only Spotify's audio (Windows process loopback) and prints
// 24 log-spaced frequency levels (0-255, comma separated) ~30 times a second.
using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;

public static class SpotifyAudio
{
    const int Bands = 24, N = 1024, Rate = 44100;

    [MTAThread]
    public static void Main()
    {
        // stdin commands: "vol <delta>" (e.g. vol 0.05) -> prints "VOL <0..1>"
        var cmds = new Thread(() =>
        {
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                var parts = line.Trim().Split(' ');
                float d;
                if (parts.Length == 2 && parts[0] == "vol" && float.TryParse(parts[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d))
                {
                    try { float v = ChangeVolume(d); if (v >= 0) lock (Console.Out) Console.Out.WriteLine("VOL " + v.ToString(System.Globalization.CultureInfo.InvariantCulture)); }
                    catch (Exception e) { Console.Error.WriteLine(e.Message); }
                }
            }
        });
        cmds.IsBackground = true;
        cmds.Start();
        while (true)
        {
            int pid = FindSpotify();
            if (pid == 0) { Thread.Sleep(2000); continue; }
            try { Capture(pid); } catch (Exception e) { Console.Error.WriteLine(e.Message); }
            Thread.Sleep(1000);
        }
    }

    // root Spotify process; its child processes are included via the process tree flag
    static int FindSpotify()
    {
        var procs = Process.GetProcessesByName("Spotify");
        if (procs.Length == 0) return 0;
        return procs.OrderBy(p => { try { return p.StartTime; } catch { return DateTime.MaxValue; } }).First().Id;
    }

    static void Capture(int pid)
    {
        var client = Activate(pid);
        var fmt = new WAVEFORMATEX { wFormatTag = 1, nChannels = 2, nSamplesPerSec = Rate, wBitsPerSample = 16, nBlockAlign = 4, nAvgBytesPerSec = Rate * 4 };
        IntPtr pFmt = Marshal.AllocHGlobal(Marshal.SizeOf(fmt));
        Marshal.StructureToPtr(fmt, pFmt, false);
        const uint LOOPBACK = 0x20000, AUTOCONVERT = 0x80000000, SRC_DEFAULT_QUALITY = 0x08000000;
        client.Initialize(0, LOOPBACK | AUTOCONVERT | SRC_DEFAULT_QUALITY, 2000000, 0, pFmt, Guid.Empty);
        Guid iidCapture = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317");
        var capture = (IAudioCaptureClient)client.GetService(ref iidCapture);
        client.Start();

        var ring = new float[N];
        int ringPos = 0;
        bool gotAudio = false;
        var proc = Process.GetProcessById(pid);
        var sw = Stopwatch.StartNew();
        while (!proc.HasExited)
        {
            uint packet;
            capture.GetNextPacketSize(out packet);
            while (packet > 0)
            {
                IntPtr data; uint frames, flags; ulong dev, qpc;
                capture.GetBuffer(out data, out frames, out flags, out dev, out qpc);
                bool silent = (flags & 2) != 0;
                for (int i = 0; i < frames; i++)
                {
                    float v = 0;
                    if (!silent)
                    {
                        short l = Marshal.ReadInt16(data, i * 4), r = Marshal.ReadInt16(data, i * 4 + 2);
                        v = (l + r) / 65536f;
                    }
                    ring[ringPos] = v; ringPos = (ringPos + 1) % N;
                }
                capture.ReleaseBuffer(frames);
                gotAudio = true;
                capture.GetNextPacketSize(out packet);
            }
            if (sw.ElapsedMilliseconds >= 33)
            {
                sw.Restart();
                // no packets while Spotify is paused: let the levels fall to zero
                if (!gotAudio) Array.Clear(ring, 0, N);
                gotAudio = false;
                lock (Console.Out) { Console.Out.WriteLine(string.Join(",", Spectrum(ring, ringPos))); Console.Out.Flush(); }
            }
            Thread.Sleep(10);
        }
        client.Stop();
        Marshal.FreeHGlobal(pFmt);
    }

    static int[] Spectrum(float[] ring, int pos)
    {
        var re = new double[N]; var im = new double[N];
        for (int i = 0; i < N; i++)
            re[i] = ring[(pos + i) % N] * (0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (N - 1)));
        Fft(re, im);
        var outp = new int[Bands];
        double lo = 40, hi = 16000;
        for (int b = 0; b < Bands; b++)
        {
            double f0 = lo * Math.Pow(hi / lo, (double)b / Bands), f1 = lo * Math.Pow(hi / lo, (double)(b + 1) / Bands);
            int k0 = Math.Max(1, (int)(f0 * N / Rate)), k1 = Math.Max(k0 + 1, (int)(f1 * N / Rate));
            double m = 0;
            for (int k = k0; k < k1 && k < N / 2; k++) m = Math.Max(m, Math.Sqrt(re[k] * re[k] + im[k] * im[k]));
            double db = 20 * Math.Log10(m / (N / 4) + 1e-9);   // ~ -90..0
            outp[b] = (int)Math.Max(0, Math.Min(255, (db + 70) / 60 * 255));
        }
        return outp;
    }

    static void Fft(double[] re, double[] im)
    {
        int n = re.Length;
        for (int i = 1, j = 0; i < n; i++)
        {
            int bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { double t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (int len = 2; len <= n; len <<= 1)
        {
            double ang = -2 * Math.PI / len, wr = Math.Cos(ang), wi = Math.Sin(ang);
            for (int i = 0; i < n; i += len)
            {
                double cr = 1, ci = 0;
                for (int k = 0; k < len / 2; k++)
                {
                    int a = i + k, b = a + len / 2;
                    double xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
                    double t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
                }
            }
        }
    }

    // ---- Spotify's own volume (its audio sessions in the mixer) ----

    static float ChangeVolume(float delta)
    {
        var pids = Process.GetProcessesByName("Spotify").Select(p => (uint)p.Id).ToArray();
        var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        IMMDevice dev;
        en.GetDefaultAudioEndpoint(0, 1, out dev);
        Guid iid = typeof(IAudioSessionManager2).GUID;
        object o;
        dev.Activate(ref iid, 23, IntPtr.Zero, out o);
        IAudioSessionEnumerator sessions;
        ((IAudioSessionManager2)o).GetSessionEnumerator(out sessions);
        int count; sessions.GetCount(out count);
        float result = -1;
        for (int i = 0; i < count; i++)
        {
            IAudioSessionControl2 ctl;
            sessions.GetSession(i, out ctl);
            uint pid; ctl.GetProcessId(out pid);
            if (!pids.Contains(pid)) continue;
            var vol = (ISimpleAudioVolume)ctl;
            float v; vol.GetMasterVolume(out v);
            v = Math.Max(0, Math.Min(1, v + delta));
            Guid ctx = Guid.Empty;
            vol.SetMasterVolume(v, ref ctx);
            result = v;
        }
        return result;
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        void EnumAudioEndpoints(int flow, int mask, out IntPtr devices);
        void GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        void Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        void GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
        void GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
        void GetSessionEnumerator(out IAudioSessionEnumerator e);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        void GetCount(out int n);
        void GetSession(int i, out IAudioSessionControl2 s);
    }

    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        void GetState(out int s);
        void GetDisplayName(out IntPtr s);
        void SetDisplayName(IntPtr s, IntPtr g);
        void GetIconPath(out IntPtr s);
        void SetIconPath(IntPtr s, IntPtr g);
        void GetGroupingParam(out Guid g);
        void SetGroupingParam(IntPtr g, IntPtr c);
        void RegisterAudioSessionNotification(IntPtr n);
        void UnregisterAudioSessionNotification(IntPtr n);
        void GetSessionIdentifier(out IntPtr s);
        void GetSessionInstanceIdentifier(out IntPtr s);
        void GetProcessId(out uint pid);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        void SetMasterVolume(float v, ref Guid ctx);
        void GetMasterVolume(out float v);
    }

    // ---- process loopback activation ----

    static IAudioClient Activate(int pid)
    {
        var p = new AUDIOCLIENT_ACTIVATION_PARAMS { ActivationType = 1, TargetProcessId = (uint)pid, ProcessLoopbackMode = 0 };
        IntPtr pParams = Marshal.AllocHGlobal(Marshal.SizeOf(p));
        Marshal.StructureToPtr(p, pParams, false);
        var pv = new PROPVARIANT { vt = 65 /* VT_BLOB */, cbSize = (uint)Marshal.SizeOf(p), pBlobData = pParams };
        IntPtr pPv = Marshal.AllocHGlobal(Marshal.SizeOf(pv));
        Marshal.StructureToPtr(pv, pPv, false);

        var handler = new Handler();
        IActivateAudioInterfaceAsyncOperation op;
        ActivateAudioInterfaceAsync("VAD\\Process_Loopback", new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), pPv, handler, out op);
        handler.Done.WaitOne();
        int hr; object iface;
        op.GetActivateResult(out hr, out iface);
        if (hr != 0) Marshal.ThrowExceptionForHR(hr);
        return (IAudioClient)iface;
    }

    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
    static extern void ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid, IntPtr activationParams,
        IActivateAudioInterfaceCompletionHandler handler, out IActivateAudioInterfaceAsyncOperation op);

    [StructLayout(LayoutKind.Sequential)]
    struct AUDIOCLIENT_ACTIVATION_PARAMS { public int ActivationType; public uint TargetProcessId; public int ProcessLoopbackMode; }

    [StructLayout(LayoutKind.Explicit)]
    struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public uint cbSize;
        [FieldOffset(16)] public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    struct WAVEFORMATEX
    {
        public ushort wFormatTag, nChannels;
        public int nSamplesPerSec, nAvgBytesPerSec;
        public ushort nBlockAlign, wBitsPerSample, cbSize;
    }

    class Handler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op) { Done.Set(); }
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler { void ActivateCompleted(IActivateAudioInterfaceAsyncOperation op); }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation { void GetActivateResult(out int hr, [MarshalAs(UnmanagedType.IUnknown)] out object iface); }

    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        void Initialize(int shareMode, uint flags, long bufferDuration, long periodicity, IntPtr format, [MarshalAs(UnmanagedType.LPStruct)] Guid session);
        void GetBufferSize(out uint frames);
        void GetStreamLatency(out long latency);
        void GetCurrentPadding(out uint padding);
        void IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
        void GetMixFormat(out IntPtr format);
        void GetDevicePeriod(out long def, out long min);
        void Start();
        void Stop();
        void Reset();
        void SetEventHandle(IntPtr h);
        [return: MarshalAs(UnmanagedType.IUnknown)] object GetService(ref Guid iid);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        void GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpc);
        void ReleaseBuffer(uint frames);
        void GetNextPacketSize(out uint frames);
    }
}
