"""Procedural sound design + narration mix for the opening shot.

Every event time comes from plan/beats.json (the same file the Remotion
composition reads), so picture and sound cannot drift apart.

Output: out/audio/mix.wav (48 kHz, stereo) plus stems in out/audio/stems/.
Requires: numpy, scipy, ffmpeg on PATH.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
B = json.loads((ROOT / "plan/beats.json").read_text())
FPS = B["fps"]
DUR = B["durationInFrames"] / FPS
N = int(round(DUR * SR))
EV = B["events"]
OUT = ROOT / "out/audio"
(OUT / "stems").mkdir(parents=True, exist_ok=True)


def fr(frame):
    return frame / FPS


def db(x):
    return 10 ** (x / 20)


rs = np.random.default_rng(1705)


def noise(sec):
    return rs.standard_normal(int(sec * SR))


def bp(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def lp(x, f, order=4):
    return sosfilt(butter(order, f, "lowpass", fs=SR, output="sos"), x)


def hp(x, f, order=4):
    return sosfilt(butter(order, f, "highpass", fs=SR, output="sos"), x)


def norm(x, peak_db):
    m = np.max(np.abs(x)) or 1.0
    return x / m * db(peak_db)


def env_ar(n, a, r, curve=4.0):
    """Attack/release envelope (seconds) over n samples, exponential release."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    rel_start = n / SR - r
    e *= np.where(t > rel_start, np.exp(-curve * (t - rel_start) / max(r, 1e-4)), 1)
    return e


def rough(n, rate, depth, seed):
    """Low-passed random modulation: the 'grain' of paper and felt tips."""
    g = np.random.default_rng(seed).standard_normal(n)
    g = lp(g, rate, 2)
    g /= np.max(np.abs(g)) + 1e-9
    return np.clip(1 + depth * g, 0, None)


class Bus:
    def __init__(self):
        self.l = np.zeros(N)
        self.r = np.zeros(N)

    def add(self, sig, t, pan=0.0):
        """pan: -1 (left) .. +1 (right); constant-power. pan may be an array."""
        i = int(round(t * SR))
        if i >= N:
            return
        pan = np.asarray(pan, dtype=float)
        if pan.ndim:
            pan = pan[: N - i]
        sig = sig[: N - i]
        pan = np.broadcast_to(pan, sig.shape)
        th = (pan + 1) * np.pi / 4
        self.l[i : i + len(sig)] += sig * np.cos(th)
        self.r[i : i + len(sig)] += sig * np.sin(th)

    @property
    def st(self):
        return np.stack([self.l, self.r], 1)


# ---------------------------------------------------------------- generators
def crackle(sec, density_curve, lo=1800, hi=9000, seed=0):
    """Sparse paper-fiber crackles; density_curve(t01) -> events per second."""
    g = np.random.default_rng(seed)
    n = int(sec * SR)
    out = np.zeros(n)
    t = 0.0
    while t < sec:
        d = max(density_curve(t / sec), 1.0)
        t += g.exponential(1 / d)
        i = int(t * SR)
        L = int(SR * g.uniform(0.0015, 0.006))
        if i + L >= n:
            break
        out[i : i + L] += g.standard_normal(L) * np.hanning(L) * g.uniform(0.2, 1.0)
    return bp(out, lo, hi, 2)


def rip(sec, shape, seed):
    """Paper rip = crackle layer + rough mid-band body, shaped by shape(t01)."""
    n = int(sec * SR)
    t01 = np.arange(n) / n
    sh = shape(t01)
    cr = crackle(sec, lambda u: 120 + 2400 * shape(np.array([u]))[0], 1500, 9500, seed)
    body = bp(noise(sec), 280, 2400, 2) * rough(n, 55, 0.9, seed + 1)
    return cr * sh * 1.0 + body * sh * 0.35


def thump(sec, f0, f1, tau, click=0.25):
    t = np.arange(int(sec * SR)) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.09)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / tau) * np.minimum(1, t / 0.002)
    c = hp(noise(0.006), 1500) * np.hanning(int(0.006 * SR)) * click
    s[: len(c)] += c
    return s


def whoosh(sec, f_lo, f_hi, seed):
    """Band-limited noise whose band sweeps upward; rises into a contact."""
    n = int(sec * SR)
    x = noise(sec)
    out = np.zeros(n)
    seg = 8
    for k in range(seg):
        a, b = k * n // seg, (k + 1) * n // seg
        fc = f_lo * (f_hi / f_lo) ** (k / (seg - 1))
        y = bp(x, fc * 0.6, min(fc * 1.6, 20000), 2)
        w = np.zeros(n)
        w[a:b] = 1
        out += y * lp(w, 40, 1)
    e = (np.arange(n) / n) ** 2.2
    return out * e * rough(n, 25, 0.4, seed)


def marker(sec, seed, center=3200):
    """Felt marker on paper: rough band noise with a slight resonant rub."""
    n = int(sec * SR)
    x = bp(noise(sec), center * 0.45, center * 1.6, 2) * rough(n, 70, 0.85, seed)
    rub = bp(noise(sec), center * 0.68, center * 0.76, 2) * 2.2 * rough(n, 9, 0.6, seed + 7)
    return (x + rub) * env_ar(n, 0.012, 0.05)


def tape_slap():
    s = lp(noise(0.035), 2800) * env_ar(int(0.035 * SR), 0.0008, 0.03, 6)
    body = thump(0.09, 190, 140, 0.03, 0)
    tack = hp(noise(0.008), 3500) * np.hanning(int(0.008 * SR)) * 0.6
    out = np.zeros(int(0.09 * SR))
    out[: len(s)] += s
    out += body * 0.9
    out[: len(tack)] += tack
    return out


def paper_land():
    s = lp(noise(0.05), 1500) * env_ar(int(0.05 * SR), 0.002, 0.045, 5)
    out = thump(0.1, 120, 85, 0.035, 0) * 0.7
    out[: len(s)] += s
    return out


def stamp_hit():
    n = int(0.16 * SR)
    out = thump(0.16, 150, 95, 0.045, 0.1)
    knock = bp(noise(0.04), 380, 620, 2) * env_ar(int(0.04 * SR), 0.0005, 0.035, 6) * 1.6
    rubber = lp(noise(0.03), 900) * env_ar(int(0.03 * SR), 0.001, 0.028) * 0.8
    out[: len(knock)] += knock
    out[: len(rubber)] += rubber
    return out[:n]


def freeze_impact():
    sec = 1.6
    t = np.arange(int(sec * SR)) / SR
    boom = thump(sec, 62, 31, 0.5, 0.0)
    punch = lp(noise(0.07), 1800) * env_ar(int(0.07 * SR), 0.0005, 0.06, 6)
    clack = sum(
        np.sin(2 * np.pi * f * t[: int(0.09 * SR)] + p) * a
        for f, a, p in [(1817, 1, 0), (2731, 0.7, 1), (4109, 0.45, 2), (5290, 0.3, 3)]
    ) * np.exp(-t[: int(0.09 * SR)] / 0.018)
    out = boom * 1.0
    out[: len(punch)] += punch * 0.3
    out[: len(clack)] += clack * 0.08
    return out


def drone(sec):
    """Felt-not-heard tension under the held frame: beating sub pair + air."""
    n = int(sec * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * 41 * t) + np.sin(2 * np.pi * 41.7 * t) * 0.8 + np.sin(2 * np.pi * 82.3 * t) * 0.25
    air = hp(noise(sec), 2500, 2) * 0.05 * rough(n, 3, 0.5, 99)
    rise = (t / sec) ** 1.4
    return (sub * (0.35 + 0.65 * rise) + air * rise) * np.minimum(1, t / 0.35)


def bed(sec):
    """Quiet paper-room tone; it stops dead on the freeze."""
    x = lp(hp(np.cumsum(noise(sec)) * 0.02, 90, 2), 1400, 2)
    x = x - lp(x, 5, 1)
    return x * rough(len(x), 4, 0.35, 5)


# ---------------------------------------------------------------- narration
vo_path = OUT / "vo_trim.wav"
vo = B["vo"]
subprocess.run(
    [
        "ffmpeg", "-v", "error", "-y", "-ss", str(vo["sourceIn"]), "-t", str(vo["sourceOut"] - vo["sourceIn"]),
        "-i", str(ROOT / vo["source"]),
        "-af", f"highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=80:makeup=2dB,"
               f"afade=t=out:st={vo['sourceOut'] - vo['sourceIn'] - vo['fadeOutSec']:.3f}:d={vo['fadeOutSec']}",
        "-ar", str(SR), "-ac", "1", str(vo_path),
    ],
    check=True,
)
_, v = wavfile.read(vo_path)
v = v.astype(np.float64) / (32768 if v.dtype == np.int16 else 1)
voice = Bus()
voice.add(v, vo["offsetSec"], 0)

# Ducking key from the voice envelope (fast attack, slower release).
venv = np.abs(voice.l + voice.r)
venv = lp(venv, 12, 2)
venv /= venv.max()
duck = 1 - 0.45 * np.clip(venv * 2.2, 0, 1)  # up to ~-5 dB under speech

# ---------------------------------------------------------------- events
pre = Bus()   # everything that lives before the freeze (hard-gated at the freeze)
post = Bus()  # the frozen moment and what follows

freeze_t = fr(EV["freeze"])

pre.add(norm(bed(freeze_t), -44), 0)

c0, c1 = EV["crackDraw"]
cs = fr(c1 - c0) + 0.05
pre.add(norm(crackle(cs, lambda u: 60 + 900 * u, seed=3), -30), fr(c0), np.linspace(0.8, -0.2, int(cs * SR)))

o0, o1 = EV["tearOpen"]
rs_sec = fr(o1 - o0) + 0.12
r = rip(rs_sec, lambda u: np.clip(np.sin(np.pi * np.clip(u * 1.15, 0, 1)) ** 0.7, 0, 1), 11)
pre.add(norm(r, -9), fr(o0), np.linspace(0.75, -0.75, len(r)))
pre.add(norm(thump(0.7, 60, 36, 0.2), -8), fr(o0 + 3))

k0, _ = EV["kickerSlide"]
kc = EV["kickerContact"]
w = whoosh(fr(kc - k0), 500, 2600, 21)
pre.add(norm(w, -26), fr(k0), np.linspace(0.85, 0.15, len(w)))
pre.add(norm(tape_slap(), -15), fr(kc), 0.12)

s0, _ = EV["sheetSlide"]
sc = EV["sheetContact"]
w = whoosh(fr(sc - s0), 350, 1900, 22) * rough(int(fr(sc - s0) * SR), 18, 0.5, 23)
pre.add(norm(w, -24), fr(s0), 0)
pre.add(norm(paper_land(), -15), fr(sc), -0.05)

h0, _ = EV["heroSlices"]
for i in range(6):
    tick = hp(noise(0.016), 2400) * np.hanning(int(0.016 * SR))
    pre.add(norm(tick, -31 - (i % 2)), fr(h0 + i * 1.5 + 2), 0.55 if i % 2 == 0 else -0.55)

for i, (a, b) in enumerate(EV["redactions"]):
    sec = fr(b - a)
    m = marker(sec, 40 + i, 2900 + 260 * i)
    pre.add(norm(m, -27), fr(a), np.linspace(0.6, -0.4, len(m)))

pre.add(norm(stamp_hit(), -16), fr(EV["stampContact"]), -0.35)

# The freeze: every pre-freeze sound (and the room tone) stops dead.
gate = np.ones(N)
gi = int(freeze_t * SR)
fade = int(0.012 * SR)
gate[gi : gi + fade] = np.linspace(1, 0, fade)
gate[gi + fade :] = 0

post.add(norm(freeze_impact(), -9), freeze_t, 0)
post.add(norm(drone(DUR - fr(EV["freeze"] + 2)), -23), fr(EV["freeze"] + 2), 0)

m0, m1 = EV["markerCircle"]
sec = fr(m1 - m0)
mk = marker(sec, 60, 2500)
theta = -2.2 - np.linspace(0, 1, len(mk)) * 1.16 * 2 * np.pi
post.add(norm(mk, -24), fr(m0), np.cos(theta) * 0.45)

t0, t1 = EV["tearOutCrack"]
sec = fr(t1 - t0)
post.add(norm(crackle(sec, lambda u: 40 + 600 * u ** 2, seed=8), -26), fr(t0), np.linspace(0.8, -0.6, int(sec * SR)))
u0, u1 = EV["tearOutOpen"]
sec = fr(u1 - u0)
rr = rip(sec + 0.2, lambda u: np.clip(u * 1.1, 0, 1) ** 2.2, 31)
post.add(norm(rr, -4), fr(u0), np.linspace(0.6, -0.6, len(rr)))

# ---------------------------------------------------------------- mix
sfx = pre.st * gate[:, None] + post.st
sfx *= duck[:, None]
mix = voice.st + sfx

# Hard cut at the last frame (4 ms anti-click only) — the cut is part of the design.
tail = int(0.004 * SR)
mix[-tail:] *= np.linspace(1, 0, tail)[:, None]


def write(path, x):
    wavfile.write(path, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


write(OUT / "stems/voice.wav", voice.st)
write(OUT / "stems/sfx.wav", sfx)
write(OUT / "premix.wav", mix * 0.5)

# Loudness: measure, set integrated to -14 LUFS, true-peak limit at -1 dBTP.
meas = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", str(OUT / "premix.wav"), "-af", "ebur128=peak=true", "-f", "null", "-"],
    capture_output=True, text=True,
).stderr
I = float(meas.split("Integrated loudness:")[1].split("I:")[1].split("LUFS")[0])
gain = -14.0 - I
subprocess.run(
    [
        "ffmpeg", "-v", "error", "-y", "-i", str(OUT / "premix.wav"),
        "-af", f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=1:release=40:level=disabled,aresample=48000",
        "-c:a", "pcm_s24le", str(OUT / "mix.wav"),
    ],
    check=True,
)
import shutil
(ROOT / "public/audio").mkdir(parents=True, exist_ok=True)
shutil.copy(OUT / "mix.wav", ROOT / "public/audio/mix.wav")
print(f"premix integrated {I:.1f} LUFS -> gain {gain:+.1f} dB -> out/audio/mix.wav")
