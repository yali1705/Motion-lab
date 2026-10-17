# Motion Lab — QA Report

Date: 2026-10-17 · Branch: `claude/motion-lab-mvp-build-m56418` · Run: `node scripts/qa.mjs` against `npm start` on http://localhost:3001

Environment: Linux x64 (4 vCPU, 15 GB), Node 22.22, Remotion 4.0.536, chrome-headless-shell 141 (render), Chromium 141 (preview screenshots), ffmpeg 6.1.1.

## Update 2026-10-17 (deployment hardening): 23 / 23 PASS in production mode

Re-run with the server started as in production (`NODE_ENV=production`, `MOTION_LAB_RENDER_TOKEN` set):
authentication, per-job download tokens, resource limits (422), rate limiting (429 on the 7th render
submission within 10 minutes — verified manually), security headers, and a new access-key prompt in the
editor (UI-0). Full table: `qa/results-local-production-mode.md`. The server also refuses to start in
production without a token or with a token shorter than 16 characters (verified).

**Production deployment status: BLOCKED on hosting credentials** — see "Deployment" at the end of this report.

## Result (initial build): 21 / 21 PASS

| ID | Check | Result | Detail |
|---|---|---|---|
| ENG-1 | Engine unit tests (vitest) | PASS | 13 tests passed |
| SRV-1 | Render service health | PASS | browser=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell concurrency=2 |
| SRV-2 | Test composition validates (Zod) | PASS | 2 layers; invalid project rejected with 400 |
| REN-1 | Render job completes (persistent job with progress) | PASS | job_20261017141802_pgdw39 in 29s, 143839 bytes, intermediate progress observed |
| REN-2 | MP4 downloads over HTTP | PASS | 143839 bytes -> qa/output/export.mp4 |
| REN-3 | MP4 is H.264 1080×1920 @ 60 fps, 300 frames, 5.000 s | PASS | h264 1080x1920 60/1 300 frames yuv420p |
| REN-4 | Exported motion matches the engine (frame 0 blank, headline rises, final hold) | PASS | YAVG f0=31.00 f40=35.91 f150=35.70 f299=35.70; centroid row f20=105.0 f60=92.6 |
| PAR-1 | Preview frames match exported frames (SSIM/PSNR within tolerance) | PASS | worst SSIM vs MP4 0.9997 (≥0.97), worst PSNR 51.4 dB (≥32), worst SSIM vs lossless still 1.0000 (≥0.99) |
| UI-1 | Editor loads on iPhone viewport with the test composition | PASS | two layers rendered; Hebrew layer resolved to RTL; no horizontal overflow |
| UI-2 | Scrubbing the timeline by touch changes the frame and the preview | PASS | frame 0 -> 150; headline y 1130 -> 940 |
| UI-3 | Dragging the headline on the canvas repositions it (writes a Y keyframe at the current frame) | PASS | x +391.8px (static), new Y keyframe @150 = 352.2 (scale 0.102) |
| UI-4 | Undo / redo restore the drag | PASS | undo restored x=540 and 2 keyframes; redo reapplied; undone again |
| UI-5 | Editing text (Hebrew) updates the canvas and switches to RTL | PASS | canvas shows Hebrew with dir=rtl; persisted; restored to original |
| UI-6 | Keyframes: toggle a rotation keyframe, add a second via the inspector, animation interpolates | PASS | rotation keyframes @120=0 and @240=45 → frame 180 renders rotate(22.50deg) |
| UI-7 | Easing editor changes the interpolated value | PASS | frame 180: linear 22.50° → ease-in 5.98°; handle touch-drag set x1≈0.3 |
| UI-8 | Keyframe drag in the timeline moves it to a new frame; delete removes it | PASS | dragged 240 → 200; deleted; 1 rotation keyframe remains |
| UI-9 | Playback advances frames at project fps and pauses | PASS | ~1 s of playback advanced to frame 63 (60 fps clock), paused cleanly |
| UI-10 | Timeline collapses and expands | PASS | height 220 → 36 → 220 |
| UI-11 | Add a text layer, select it, reorder and delete it | PASS | added 3rd layer, moved behind, deleted |
| UI-12 | Project persists across reload (edits + current frame) | PASS | text, keyframes and current frame (90) survived reload |
| UI-13 | Export from the editor: job progress shown, MP4 downloadable | PASS | rendered via UI in 29s; /api/jobs/job_20261017141901_47wjq2/download → 200 video/mp4 |

### Manual / scripted checks outside the suite

| Check | Result | Detail |
|---|---|---|
| Render job recovery after process crash | PASS | Server killed at 14/300 frames; on restart the job was re-queued (attempt 2) and finished with 300 frames, identical size |
| Invalid project rejected | PASS | Zod validation returns 400 (covered in SRV-2) |
| Typecheck all workspaces | PASS | `npm run typecheck` |
| HTTPS deployment | NOT DONE | No hosting credentials are available in this environment (see Known limitations). Dockerfile provided. |

## Verified MP4

`qa/motion-is-design_1080x1920_60fps.mp4` (sha256 ff9b11b778ebbaad…, 143,839 bytes)

```
codec=h264  1080x1920  r_frame_rate=60/1  nb_frames=300  duration=5.000  pix_fmt=yuv420p
```

Frames 0 / 20 / 40 / 60 / 150 / 299 extracted from the MP4: `qa/screenshots/export-frames-0-20-40-60-150-299.png`.
Frame 0 is background only (opacity 0), the headline rises and settles with the scale overshoot by frame ~84, the Hebrew subtitle fades in RTL, and frames 150 → 299 are a static hold.

## Preview ↔ export parity and tolerances

Both the editor preview and the Remotion composition render the same `<CompositionView>` from `@motion-lab/engine`, fed by the same `evaluateProject(project, frame)`. Fonts (Heebo Latin + Hebrew) are embedded as data URLs in both.

Measured on frames 0, 20, 40, 60, 150, 299 (preview = Chromium screenshot of `/?qa=frame&f=N` at 1080×1920; still = `POST /api/still`, the lossless export pipeline; mp4 = frame extracted from the exported H.264):

| Comparison | Metric | Worst value | Tolerance |
|---|---|---|---|
| preview vs lossless export still | SSIM | 1.0000 | ≥ 0.99 |
| preview vs H.264 MP4 frame | SSIM | 0.9997 | ≥ 0.97 |
| preview vs H.264 MP4 frame | PSNR | 51.4 dB | ≥ 32 dB |

The only differences between preview and MP4 come from H.264 compression (CRF 18, yuv420p chroma subsampling). Numeric animation values are bit-identical by construction (pure engine, unit-tested for determinism).

Documented tolerance for real devices: on an iPhone the preview is drawn by WebKit rather than Chromium, so glyph anti-aliasing and sub-pixel positioning can differ at the pixel level; positions, sizes, timing and easing are identical because they are computed by the shared engine and expressed as absolute CSS pixels. Line wrapping is deterministic for the test composition because the headline break is an explicit newline.

## What was tested in the editor (emulated iPhone 390×844, touch events via CDP)

Text editing (incl. Hebrew → RTL), canvas drag repositioning (writes a keyframe at the current frame when the property is animated), timeline touch scrubbing, keyframe add/toggle/move/delete, Bézier easing via numeric inputs and by dragging a handle, undo/redo, playback at 60 fps, timeline collapse, layer add/reorder/delete, persistence across reload (project + current frame), and export with progress and download.

Screenshots: `qa/screenshots/`.

## Known limitations

1. **Not deployed.** This environment has no hosting credentials (no Vercel/Fly/Railway/Cloudflare tokens) and no Docker daemon, so the app was verified locally only. The repo includes a `Dockerfile` (editor + API + renderer in one container, volume at `/data`) that targets any TLS-terminating container host; the Docker image itself could not be built here.
2. **Real iPhone not available.** Mobile behaviour was verified in Chromium with iPhone viewport, touch emulation and a mobile UA. Safe-area insets (`viewport-fit=cover`, `env(safe-area-inset-*)`) and `100dvh` are implemented but were not observed on a physical device.
3. **Persistence is per-device.** Projects persist in `localStorage` (Zod-validated on load); there is no account or cloud project store. Render jobs persist on the server's disk.
4. **Text layers only.** Shapes, images and audio are out of scope for this MVP. Fonts are fixed to the embedded Heebo family (weights 300–900).
5. **Timeline zoom.** The timeline always fits the full duration to the screen width (≈1.2 px per frame on a 390 px phone); keyframes snap to whole frames and can be set precisely with the Frame field in the Keyframe tab.
6. **Render throughput.** ~30 s for 5 s @ 60 fps on 4 vCPU with concurrency 2; jobs run one at a time per process.
7. **No authentication / rate limiting** on the render API.

## Deployment (added 2026-10-17)

Target provider: **Fly.io** (persistent machine, volume mounted at `/data`, automatic HTTPS, 2 GB RAM for
Chromium). Config: `fly.toml`, `Dockerfile`, `scripts/deploy-fly.sh`, `.github/workflows/deploy.yml`.

| Step | Status | Detail |
|---|---|---|
| Production Node build verified locally | PASS | `npm run build` + server in production mode, 23/23 QA |
| Production Docker image | PASS | Built by `.github/workflows/ci.yml` on GitHub's runner (64 s), container started with `MOTION_LAB_RENDER_TOKEN` and a `/data` volume, health check OK, **23/23 QA checks passed against the container** (MP4 300 frames in 14 s). Run: https://github.com/yali1705/Motion-lab/actions/runs/39041832272 ; artifact `qa-output`. |
| Deploy to Fly.io | BLOCKED | No `FLY_API_TOKEN`; the sandbox's network policy also denies `api.fly.io` / `api.machines.dev`. The deploy workflow skips itself with a warning until the secrets exist. |
| Public HTTPS URL tested | NOT DONE | Will be `https://<FLY_APP>.fly.dev`; the deploy workflow runs this same QA suite against it and publishes the table in the job summary. |

Unblock from a phone: Fly.io account + payment method → create API token → add repository secrets
`FLY_API_TOKEN` and `MOTION_LAB_RENDER_TOKEN` → run the "Deploy to Fly.io" workflow (Actions tab).
