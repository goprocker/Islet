"""Synthesizes the Apple edit's original score and foley. No samples, so nothing to license.

Run from launch-film/: python scripts/make_score_apple.py
Writes public/score-apple.wav, timed from src/apple/cues.json.
"""
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parent.parent
C = json.loads((ROOT / "src/apple/cues.json").read_text())
SR = 48000
N = int(SR * C["length"])
BEAT = 60 / C["bpm"]
rng = np.random.default_rng(2638)


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def lp(x, f):
    return sosfilt(butter(2, f, "low", fs=SR, output="sos"), x)


def hp(x, f):
    return sosfilt(butter(2, f, "high", fs=SR, output="sos"), x)


def t_(d):
    return np.arange(int(d * SR)) / SR


def place(bus, at, snd, gain=1.0):
    i = int(at * SR)
    if i >= len(bus) or i < 0:
        return
    e = min(len(bus), i + len(snd))
    bus[i:e] += snd[: e - i] * gain


def kick(g=1.0):
    t = t_(0.42)
    return g * np.sin(2 * np.pi * (46 * t + 13 * (1 - np.exp(-t * 28)))) * np.exp(-t * 8.5)


def impact():
    t = t_(2.8)
    boom = np.sin(2 * np.pi * (34 * t + 9 * (1 - np.exp(-t * 16)))) * np.exp(-t * 2.1)
    air = lp(rng.standard_normal(len(t)), 2600) * np.exp(-t * 3.5) * 0.28
    return boom + air


def clap():
    t = t_(0.24)
    return hp(rng.standard_normal(len(t)), 1300) * (np.exp(-t * 26) + 0.5 * np.exp(-np.maximum(t - 0.018, 0) * 90)) * 0.6


def hat(d=0.05):
    t = t_(d)
    return hp(rng.standard_normal(len(t)), 7500) * np.exp(-t * 90) * 0.32


def click():
    t = t_(0.035)
    return hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 240) * 0.6


def whoosh(d=0.45, rising=True):
    n = int(d * SR)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 2
    src = rng.standard_normal(n)
    sweep = sosfilt(butter(2, [500, 6500], "band", fs=SR, output="sos"), src)
    return sweep * shape * 0.5


def riser(d):
    n = int(d * SR)
    u = np.linspace(0, 1, n)
    tone = np.sin(2 * np.pi * np.cumsum(180 + 1500 * u ** 3) / SR) * 0.1
    return (hp(rng.standard_normal(n), 2200) * 0.32 + tone) * u ** 3


def pluck(m, d=0.3, g=1.0):
    t = t_(d)
    f = hz(m)
    x = sum(np.sin(2 * np.pi * f * k * t + k) / k ** 1.3 for k in (1, 2, 3, 4))
    return g * x * np.exp(-t * 9)


def pad(chord, d):
    t = t_(d)
    a = np.minimum(t / 0.05, 1) * np.minimum((d - t) / 0.12, 1)
    x = np.zeros(len(t))
    for m in chord:
        for det in (-0.07, 0.07):
            x += np.sign(np.sin(2 * np.pi * hz(m + det) * t)) * 0.5 + np.sin(2 * np.pi * hz(m + det) * t)
    return lp(x, 1900) * a / len(chord) / 2


def bass(m, d):
    t = t_(d)
    w = np.sin(2 * np.pi * hz(m) * t)
    return (w + 0.35 * np.sin(4 * np.pi * hz(m) * t) + 0.18 * np.sin(6 * np.pi * hz(m) * t)) * np.minimum(t / 0.006, 1) * np.minimum((d - t) / 0.03, 1)


def ding(m=88, g=1.0):
    t = t_(1.0)
    return g * (np.sin(2 * np.pi * hz(m) * t) + 0.4 * np.sin(2 * np.pi * hz(m) * 2.76 * t) * np.exp(-t * 12)) * np.exp(-t * 5.5)


# F minor: Fm, Db, Ab, Eb, one chord per bar
CHORDS = [[53, 60, 65, 68], [49, 56, 61, 65], [56, 60, 63, 68], [51, 58, 63, 67]]
ROOTS = [29, 25, 32, 27]
ARP = [[77, 80, 84, 89], [73, 77, 80, 85], [75, 80, 84, 87], [75, 79, 82, 87]]

drums, sub, music, foley = (np.zeros(N) for _ in range(4))


def bars(start, end):
    return np.arange(start, end, 2.0)


def groove(start, end, full=True, chord_gain=1.0, arp_gain=0.14):
    for b in bars(start, end):
        i = int(b / 2) % 4
        place(music, b, pad(CHORDS[i], min(2.0, end - b)), 0.34 * chord_gain)
        for k in range(16):
            at = b + k * BEAT / 2
            if at >= end:
                break
            place(music, at, pluck(ARP[i][(k * 3) % 4] + (12 if k % 7 == 6 else 0)), arp_gain)
            if full:
                if k % 2 == 0:
                    place(drums, at, kick(), 0.95)
                    place(sub, at + BEAT / 2, bass(ROOTS[i] + 12, BEAT / 2 - 0.02), 0.34)
                if k % 4 == 2:
                    place(drums, at, clap(), 0.55)
                place(drums, at + BEAT / 4, hat(), 0.5)
                place(drums, at, hat(0.03), 0.22)


# hook: a heartbeat under the dot, then the pill and a tight filter-closed loop
for b in (0, 1, 2, 3):
    place(drums, b, kick(0.8), 0.6)
place(foley, 0.75, click(), 0.5)
place(foley, C["pill"], whoosh(0.4), 0.55)
place(music, C["pill"], lp(pad(CHORDS[0], C["stopA"] - C["pill"]), 700), 0.5)
place(foley, C["stopA"] - 1.25, riser(1.25), 0.65)
# first silence: stopA to drop holds only room tone

# drop and the spine
place(drums, C["drop"], impact(), 1.1)
place(foley, C["drop"], whoosh(0.5), 0.5)
groove(C["drop"], C["burst"])
for t, g in ((C["music"] - 0.1, 0.8), (C["agents"] - 0.1, 0.8), (C["toast"] - 0.05, 0.5)):
    place(foley, t, whoosh(0.42), g)
place(foley, C["needsYou"] + 0.1, ding(81, 0.5), 0.4)
place(foley, C["allow"], click(), 1.3)
place(foley, C["allow"] + 0.02, ding(89, 0.6), 0.5)
place(foley, C["toast"] + 0.12, ding(84, 0.8), 0.45)
place(foley, C["toast"] + 0.26, ding(91, 0.6), 0.32)

# burst: a hit and a chord stab on every cut
for k in range(8):
    at = C["burst"] + k * 0.5
    i = k // 4 % 4
    place(drums, at, kick(), 1.0)
    place(drums, at, clap(), 0.5)
    place(music, at, pad(CHORDS[(i + k) % 4], 0.42), 0.55)
    place(sub, at, bass(ROOTS[(i + k) % 4] + 12, 0.42), 0.42)
    place(music, at, pluck(ARP[(i + k) % 4][k % 4] + 12, 0.45), 0.34)
place(foley, C["altF4"] - 2, riser(2.0), 0.5)

# Alt+F4 gag: stripped to bass and key thocks, and nothing else happens
place(drums, C["altF4"], kick(), 1.0)
for b in (C["altF4"], C["altF4"] + 1):
    place(sub, b, bass(ROOTS[0] + 12, 0.8), 0.4)
place(foley, C["keyPress"], lp(click(), 3000), 2.2)
place(foley, C["keyPress"] + 0.25, lp(click(), 3000), 2.2)
place(foley, C["keyPress"] + 0.46, ding(77, 0.5), 0.3)

# second silence, then the plug; first real sound after it is the film's biggest
place(music, C["stopB"], lp(pad(CHORDS[0], 1.7), 500), 0.22)
place(foley, C["plug"], lp(click(), 2000), 3.0)
place(foley, C["plug"] - 0.05, riser(0.3), 0.4)
place(drums, C["hole"], impact(), 1.35)
place(drums, C["hole"] + 0.02, impact(), 0.5)
d = C["implode"] - C["hole"]
t = t_(d)
rumble = lp(rng.standard_normal(len(t)), 240) * 0.6 + np.sin(2 * np.pi * 43 * t) * 0.5
place(sub, C["hole"], rumble * np.minimum(t / 0.2, 1), 0.65)
choir = pad([41, 53, 60, 65, 72, 77], d)
place(music, C["hole"], choir, 0.7)
for k in range(int(d / BEAT)):
    place(drums, C["hole"] + k * BEAT, kick(), 0.75)
place(foley, C["implode"] - 0.6, riser(0.6), 0.9)
place(foley, C["implode"], whoosh(0.45), 1.0)

# release, then the last chord rings out on the wordmark
place(drums, C["open"], impact(), 0.9)
groove(C["open"], C["end"], arp_gain=0.17)
place(drums, C["end"], impact(), 1.15)
place(music, C["end"], pad([41, 53, 60, 65, 68, 72], C["length"] - C["end"]) * np.exp(-t_(C["length"] - C["end"]) * 0.9)[: int((C["length"] - C["end"]) * SR)], 0.9)
place(foley, C["end"], ding(89, 0.9), 0.5)
place(foley, C["end"] + 0.5, ding(84, 0.6), 0.28)

# side-chain: everything melodic breathes off the kick
env = np.abs(drums)
win = int(0.008 * SR)
env = np.convolve(env, np.ones(win) / win, "same")
rel = np.exp(-1 / (0.14 * SR))
smooth = np.zeros(N)
level = 0.0
for i in np.arange(N):
    level = max(env[i], level * rel)
    smooth[i] = level
duck = 1 - 0.62 * np.clip(smooth / (np.percentile(smooth, 99) + 1e-9), 0, 1)

# short room reverb, kept off the sub
ir_t = t_(1.1)
ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 5.5)
ir /= np.sqrt((ir ** 2).sum())
wet = fftconvolve(music * duck + foley, ir)[:N]

dry = music * duck * 0.8 + sub * duck * 0.85 + drums * 0.82 + foley * 0.85
left = dry + 0.22 * wet + 0.02 * np.roll(music, int(0.011 * SR))
right = dry + 0.22 * np.roll(wet, int(0.017 * SR)) + 0.02 * np.roll(music, int(0.007 * SR))
# room tone so the silences aren't digital
room = lp(rng.standard_normal(N), 900) * 0.0035
stereo = np.stack([left + room, right + room], 1)
stereo = np.tanh(stereo * 0.9)
stereo /= np.abs(stereo).max() / 0.95

out = ROOT / "public/score-apple.wav"
wavfile.write(out, SR, (stereo * 32767).astype(np.int16))
print("wrote", out)
