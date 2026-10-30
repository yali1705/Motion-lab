# Opening Shot: "תחשבו על הסיטואציה הזאת רגע."

A standalone, isolated Remotion project: one 4-second 1080×1920 / 30fps opening shot for a Hebrew sports-documentary.
It is **not** part of the motion-lab npm workspaces and does not import from them.

| File | What |
|---|---|
| `opening_shot.mp4` | Final deliverable (picture + narration + sound design) |
| `motion_script.md` | Frame-by-frame motion script, layers, easing, sound events (Hebrew) |
| `REPORT.md` | Production report: issues found, fixes, what was not verified (Hebrew) |
| `plan/beats.json` | **Single source of truth** for every picture and sound cue |
| `src/OpeningShot.tsx` | The shot (SVG in Remotion, deterministic, seeded) |
| `src/lib.ts` | PRNG, torn-paper edge generator, easing presets, palette |
| `src/fonts.ts` | Local Karantina + Heebo (OFL, from Fontsource) |
| `scripts/build_audio.py` | Narration trim + procedural sound design + mix → `public/audio/mix.wav` |
| `scripts/qa.py` | Format, loudness and picture/sound sync report + contact sheet |
| `input/narration_full.mp3` | Source ElevenLabs narration (only 0.00–1.74 s is used) |

## Rebuild

```bash
npm install --workspaces=false
pip install numpy scipy                 # for the audio script
npm run audio                           # → public/audio/mix.wav
export CHROME=/path/to/chrome-headless-shell   # optional; omit to let Remotion fetch its own
npm run render                          # → out/opening_shot.mp4
npm run qa                              # → analysis/qa/
npm run studio                          # live preview with sound
```

To retime something, edit `plan/beats.json`, then run `audio` and `render`. Picture and sound stay locked to each other.
