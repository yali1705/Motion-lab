"""Objective QA for a render: format, loudness, and picture/sound sync.

Usage: python3 scripts/qa.py out/opening_shot.mp4
Writes analysis/qa/contact_sheet.png and analysis/qa/timeline.txt.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
video = Path(sys.argv[1])
B = json.loads((ROOT / "plan/beats.json").read_text())
FPS, NF = B["fps"], B["durationInFrames"]
qa = ROOT / "analysis/qa"
qa.mkdir(parents=True, exist_ok=True)

probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)],
                                  capture_output=True, text=True).stdout)
vs = next(s for s in probe["streams"] if s["codec_type"] == "video")
print(f"video  {vs['width']}x{vs['height']} {vs['r_frame_rate']} frames={vs['nb_frames']} {vs['pix_fmt']} {vs.get('color_space')}")

# Per-frame motion energy (mean abs diff on a 135x240 luma proxy).
w, h = 135, 240
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"scale={w}:{h},format=gray", "-f", "rawvideo", "-"],
                     capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(float)
motion = np.r_[0, np.abs(np.diff(fr, axis=0)).mean((1, 2))]

# Per-frame audio energy and onset strength.
sr = 48000
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                     capture_output=True).stdout
a = np.frombuffer(pcm, np.float32)
spf = sr // FPS
nfa = min(NF, len(a) // spf)
rms = np.array([np.sqrt((a[i * spf:(i + 1) * spf] ** 2).mean()) for i in range(nfa)])
rdb = 20 * np.log10(rms + 1e-9)
onset = np.r_[0, np.maximum(0, np.diff(rdb))]

loud = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-af", "ebur128=peak=true", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
I = loud.split("Integrated loudness:")[1].split("I:")[1].split("LUFS")[0].strip()
TP = loud.split("True peak:")[1].split("Peak:")[1].split("dBFS")[0].strip()
print(f"audio  integrated {I} LUFS, true peak {TP} dBTP, samples={len(a)} ({len(a)/sr:.3f}s)")

E = B["events"]
checks = [
    ("tear open (rip)", E["tearOpen"][0]),
    ("kicker tape contact", E["kickerContact"]),
    ("sheet contact", E["sheetContact"]),
    ("stamp contact", E["stampContact"]),
    ("freeze / panel slam", E["freeze"]),
    ("tear-out split", E["tearOutOpen"][0]),
]
print("\nsync: strongest audio onset and motion peak within ±3 frames of each designed event")
for name, f0 in checks:
    lo, hi = max(0, f0 - 3), min(nfa - 1, f0 + 3)
    fa = lo + int(np.argmax(onset[lo:hi + 1]))
    fm = lo + int(np.argmax(motion[lo:hi + 1]))
    print(f"  {name:22s} designed f{f0:<3d} audio onset f{fa:<3d} ({fa - f0:+d})  motion peak f{fm:<3d} ({fm - f0:+d})")

held = motion[E["freeze"] + 10:E["markerCircle"][0]]
print(f"\nfreeze hold (f{E['freeze'] + 10}-f{E['markerCircle'][0]}): mean motion {held.mean():.2f} vs sentence f10-f49 {motion[10:50].mean():.2f}")

with open(qa / "timeline.txt", "w") as fh:
    fh.write("frame  motion  audio_dB  onset\n")
    for i in range(min(len(motion), nfa)):
        fh.write(f"{i:5d} {motion[i]:7.2f} {rdb[i]:8.1f} {onset[i]:6.1f}  {'#' * int(motion[i] / 2)}\n")

sel = "+".join(f"eq(n,{n})" for n in [2, 6, 10, 14, 20, 26, 30, 36, 44, 47, 51, 56, 66, 78, 90, 102, 110, 114, 117, 119])
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", f"select='{sel}',scale=216:-1,tile=10x2",
                "-vsync", "0", "-frames:v", "1", str(qa / "contact_sheet.png")], check=True)
print(f"\nwrote {qa / 'contact_sheet.png'} and {qa / 'timeline.txt'}")
