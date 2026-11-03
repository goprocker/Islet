"""Synthesizes the film's original score and equalizer data. No samples, so nothing to license.

Run from launch-film/: python scripts/make_score.py
Writes public/score-cinematic.wav and src/cinematic/eq.json, timed from src/cinematic/cues.json.
"""
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt, sosfiltfilt

ROOT = Path(__file__).resolve().parent.parent
CUES = json.loads((ROOT / "src/cinematic/cues.json").read_text())
SR, LENGTH = 48000, 40.0
N = int(SR * LENGTH)
T = np.arange(N) / SR
rng = np.random.default_rng(2638)
BEAT = 60 / CUES["bpm"]


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def env(points):
    """Piecewise envelope with smooth (cosine) segments over [(seconds, level), ...]."""
    xs, ys = zip(*points)
    i = np.clip(np.searchsorted(xs, T, side="right") - 1, 0, len(xs) - 2)
    x0, x1 = np.array(xs)[i], np.array(xs)[i + 1]
    y0, y1 = np.array(ys)[i], np.array(ys)[i + 1]
    u = np.clip((T - x0) / np.maximum(x1 - x0, 1e-6), 0, 1)
    return y0 + (y1 - y0) * (0.5 - 0.5 * np.cos(np.pi * u))


def lowpass(x, hz):
    return sosfiltfilt(butter(2, hz, "low", fs=SR, output="sos"), x)


def highpass(x, hz):
    return sosfiltfilt(butter(2, hz, "high", fs=SR, output="sos"), x)


def place(bus, at, sound):
    start = int(at * SR)
    end = min(N, start + len(sound))
    if start < N:
        bus[start:end] += sound[: end - start]


def tail(seconds):
    return np.arange(int(seconds * SR)) / SR


def pad(notes, level):
    """Detuned, slowly drifting partials, kept warm with a low-pass."""
    out = np.zeros(N)
    for n in notes:
        for detune, phase in ((-0.06, 0.3), (0.0, 1.7), (0.07, 4.1)):
            f = midi(n + detune)
            drift = 0.25 * np.sin(2 * np.pi * 0.07 * T + phase)
            out += sum(np.sin(2 * np.pi * f * h * T + drift * h) / h**1.6 for h in (1, 2, 3))
    return lowpass(out, 1400) * level / (len(notes) * 3)


def bell(note, seconds=2.2):
    t = tail(seconds)
    f = midi(note)
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in ((1, 1, 3.2), (2.01, 0.34, 5), (3.02, 0.12, 8)))
    return s * np.minimum(t / 0.002, 1)


def tick(seconds=0.09, hz=3200):
    """A short filtered click, the digital texture under each morph."""
    t = tail(seconds)
    s = np.sin(2 * np.pi * hz * t * (1 - 0.3 * t / seconds)) * np.exp(-t * 60)
    return s + 0.3 * highpass(rng.normal(size=len(t)), 5000) * np.exp(-t * 120)


def swell(seconds=0.55):
    """Airy rise that leads into a shape change."""
    t = tail(seconds)
    return lowpass(rng.normal(size=len(t)), 2600) * np.sin(np.pi * t / seconds) ** 2


def kick():
    t = tail(0.5)
    return np.sin(2 * np.pi * (46 * t + 40 * (1 - np.exp(-t * 28)) / 28)) * np.exp(-t * 8)


def pluck(note):
    t = tail(0.9)
    f = midi(note)
    s = sum(np.sin(2 * np.pi * f * h * t) * np.exp(-t * (5 + 3 * h)) / h for h in (1, 2, 3, 4))
    return s * np.minimum(t / 0.003, 1)


score = np.zeros(N)  # pad, drones and groove, these go to the reverb in full
sfx = np.zeros(N)

# opening ambience: a low, nearly static air
score += pad([38, 45], 0.11) * env([(0, 0), (1.6, 1), (8.8, 0.85), (9.5, 0.2), (17, 0.1), (17.5, 0)])
score += pad([50, 57, 62, 64], 0.085) * env([(2.4, 0), (4.2, 1), (8.4, 1), (9.4, 0)])

# charging: bass drop, sub drone and a deep rise, the one big gesture of the film
ig = CUES["chargeIgnite"]
t = tail(5.0)
hit = np.sin(2 * np.pi * (34 * t + 60 * (1 - np.exp(-t * 7)) / 7)) * np.exp(-t * 0.95)
place(sfx, ig, hit * 0.5)
place(sfx, ig - 0.7, swell(0.75) * 0.08)
score += np.sin(2 * np.pi * midi(26) * T + 0.6 * np.sin(2 * np.pi * 0.3 * T)) * 0.2 * env([(ig, 0), (ig + 1.5, 1), (CUES["chargeImplode"], 1), (CUES["chargeCompact"], 0)])
score += pad([38, 45, 52, 57, 61, 64], 0.1) * env([(ig + 0.3, 0), (ig + 3, 1), (CUES["chargeImplode"], 1), (CUES["chargeCompact"] + 0.2, 0)])
t = tail(1.0)
place(sfx, CUES["chargeImplode"], lowpass(rng.normal(size=len(t)), 900) * (t / 1.0) ** 3 * 0.12)
place(sfx, CUES["chargeCompact"], kick() * 0.3)
place(sfx, CUES["chargeCount"], bell(81, 3) * 0.018)

# permission: suspended and patient, it waits for the press
score += pad([45, 52, 59, 64], 0.07) * env([(16.9, 0), (18.2, 1), (CUES["permissionPress"], 1), (CUES["musicDot"] + 0.6, 0.4), (23.7, 0)])
score += pad([41, 48, 57, 60, 64], 0.07) * env([(CUES["permissionPress"], 0), (CUES["permissionPress"] + 0.7, 1), (23.8, 0)])

# music: a soft groove locked to the beat grid, this is what the equalizer reads
groove_start, groove_end = CUES["musicOpen"], CUES["desktop"]
chords = [[45, 60, 64, 69], [41, 57, 60, 65], [48, 60, 64, 67], [43, 59, 62, 67]]
kick_bus, bass_bus, pluck_bus, hat_bus = (np.zeros(N) for _ in range(4))
step = BEAT / 2
for i in range(int((groove_end - groove_start) / step)):
    at = groove_start + i * step
    bar = int(i / 8) % len(chords)
    chord = chords[bar]
    if i % 2 == 0:
        place(kick_bus, at, kick())
    if i % 8 in (0, 3, 6):
        t = tail(BEAT * 0.9)
        place(bass_bus, at, np.sin(2 * np.pi * midi(chord[0] - 12) * t) * np.exp(-t * 2.4) * np.minimum(t / 0.01, 1))
    pattern = chord[1:][[0, 2, 1, 2, 0, 1, 2, 1][i % 8]] + 12
    place(pluck_bus, at, pluck(pattern) * (1 if i % 2 == 0 else 0.62))
    t = tail(0.08)
    place(hat_bus, at + step / 2, highpass(rng.normal(size=len(t)), 7500) * np.exp(-t * 70))
fade = env([(groove_start - 0.2, 0), (groove_start + 0.8, 1), (CUES["micCompact"], 1), (CUES["micCompact"] + 0.8, 0.6), (groove_end, 0.45), (groove_end + 0.5, 0)])
kick_bus, bass_bus, pluck_bus, hat_bus = kick_bus * 0.3 * fade, bass_bus * 0.2 * fade, pluck_bus * 0.11 * fade, hat_bus * 0.022 * fade
score += kick_bus + bass_bus + pluck_bus + hat_bus
score += pad([45, 57, 64, 69], 0.05) * env([(groove_start, 0), (groove_start + 1.5, 1), (groove_end, 1), (groove_end + 0.7, 0)])

# finale: a controlled crescendo that lands on the end card
rise = env([(33.5, 0), (CUES["endCard"], 1), (39.2, 0.45), (40, 0)])
score += pad([33, 45, 52, 57, 61, 64, 69, 76], 0.2) * rise
t = tail(2.0)
place(sfx, CUES["endCard"], np.sin(2 * np.pi * midi(33) * t) * np.exp(-t * 1.8) * 0.3)
for delay, note in ((0, 76), (0.14, 81), (0.28, 88)):
    place(sfx, CUES["endCard"] + delay, bell(note, 1.9) * 0.05)

# notification and UI textures
place(sfx, CUES["notificationPill"], tick(hz=2200) * 0.035)
place(sfx, CUES["notificationOpen"], (bell(88, 1.4) + 0.65 * bell(93, 1.4)) * 0.075)
for at in (CUES["chargeCollapse"], CUES["permissionOpen"], CUES["musicDot"], CUES["musicOpen"], CUES["micCompact"], CUES["micLabel"], CUES["finalOpen"], CUES["finalClose"]):
    place(sfx, at - 0.42, swell() * 0.022)
    place(sfx, at, tick() * 0.04)
place(sfx, CUES["permissionPress"], tick(0.07, 1800) * 0.075)
place(sfx, CUES["micLabel"], bell(84, 0.8) * 0.03)

# one small synthetic hall; the wide stereo comes from two decorrelated tails
ir_t = tail(2.8)
irs = [lowpass(rng.normal(size=len(ir_t)), 5000) * np.exp(-ir_t * 2.2) for _ in range(2)]
irs = [ir / np.sqrt(np.sum(ir**2)) for ir in irs]
dry = score + sfx * 0.9
wet = np.stack([fftconvolve(dry, ir)[:N] for ir in irs], axis=1)
mix = np.stack([dry, dry], axis=1) + wet * 0.32
mix = sosfilt(butter(2, 20, "high", fs=SR, output="sos"), mix, axis=0)
mix *= env([(0, 0), (0.15, 1), (39.2, 1), (40, 0)])[:, None]
mix = np.tanh(mix / np.max(np.abs(mix)) * 2.6)
mix *= 10 ** (-1.5 / 20) / np.max(np.abs(mix))
wavfile.write(ROOT / "public/score-cinematic.wav", SR, (mix * 32767).astype(np.int16))

# per-frame band levels from the real stems, so the equalizer moves with what is heard
FPS, first, last = 60, CUES["musicDot"], CUES["desktop"] + 1
music = kick_bus + bass_bus + pluck_bus + hat_bus
hop = SR // FPS
EDGES = (30, 90, 240, 700, 1800, 12000)
frames = range(int(first * FPS), int(last * FPS))
spectra = []
for f in frames:  # 4096-point window centred on each video frame
    start = max(0, f * hop + hop // 2 - 2048)
    chunk = music[start : start + 4096]
    spectra.append(np.abs(np.fft.rfft(chunk * np.hanning(len(chunk)), 4096)))
freqs = np.fft.rfftfreq(4096, 1 / SR)
levels = []
for lo, hi in zip(EDGES, EDGES[1:]):
    pick = (freqs >= lo) & (freqs < hi)
    rms = np.array([np.sqrt(np.mean(s[pick] ** 2)) for s in spectra])
    held = np.zeros_like(rms)
    level = 0.0
    for i, v in enumerate(rms):  # fast attack, slow release, like a real meter
        level = max(v, level * 0.93)
        held[i] = level
    levels.append([round(float(v), 2) for v in (held / max(held.max(), 1e-9)) ** 0.7])
(ROOT / "src/cinematic/eq.json").write_text(json.dumps({"from": first, "fps": FPS, "bands": levels}, separators=(",", ":")))
print("score written, peak", float(np.max(np.abs(mix))))
