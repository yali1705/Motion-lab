# Motion Lab

iPhone-first motion graphics editor with cloud rendering. Edit text layers on
a phone, animate position / scale / rotation / opacity with frame-accurate
keyframes and editable cubic-Bézier easing, scrub a live preview, and export a
real 1080×1920 60 fps H.264 MP4 rendered server-side with Remotion + FFmpeg.

The preview and the export run **the same animation engine and the same React
component**, so what you see on the phone is what the MP4 contains.

```
packages/engine   @motion-lab/engine  deterministic engine: Zod schema, Bézier solver,
                                      keyframe interpolation, <CompositionView>, embedded fonts
apps/web          @motion-lab/web     React + TypeScript + Tailwind mobile editor (Vite)
apps/render       @motion-lab/render  Express render service: Remotion bundle, persistent
                                      render jobs with progress, MP4 download, serves the editor
scripts/qa.mjs                        end-to-end QA (render, ffprobe, preview↔export parity, touch UI)
qa/QA_REPORT.md                       latest QA results, tolerances and known limitations
```

## Quick start

Requirements: Node ≥ 20, `ffmpeg`/`ffprobe` on PATH (only for the QA script —
Remotion ships its own FFmpeg for rendering), and a Chromium **headless shell**
for Remotion (it downloads one automatically if none is found; see
`MOTION_LAB_BROWSER` below).

```bash
npm install
npm run build          # engine → web → render (compiles + builds the Remotion bundle)
npm start              # http://localhost:3001  — editor + API in one process
```

Development (Vite dev server on :5173 proxying `/api` to the render service on :3001):

```bash
npm run dev
```

Tests and checks:

```bash
npm test               # engine unit tests (vitest)
npm run typecheck      # all workspaces
npm run qa             # full end-to-end QA against a running server (see below)
```

## How it works

### Engine (`packages/engine`)

* `ProjectSchema` (Zod) — `Project → Layer[] → transform.{x,y,scale,rotation,opacity}` where
  each property is `{ value, keyframes[] }` and each keyframe is `{ frame, value, easing }`.
  Frames are absolute integer project frames; the easing on a keyframe describes the curve
  **to the next keyframe**.
* `cubicBezier(easing, t)` — the same Newton/bisection solver browsers use for
  `cubic-bezier()`. Pure math, so results are identical in the editor and the renderer.
* `evaluateProperty` / `evaluateProject(project, frame)` — holds before the first and after
  the last keyframe, eased interpolation in between. Pure and deterministic.
* `<CompositionView project frame>` — renders a frame as plain absolutely-positioned DOM
  using inline styles only. The editor scales it with a CSS transform; Remotion renders it
  1:1 in headless Chromium.
* Fonts — Heebo (Latin + Hebrew subsets, OFL) is embedded as base64 data URLs and loaded via
  the FontFace API in both environments, so typography never depends on the network or on
  what fonts the device has installed. Hebrew text is detected automatically and rendered
  RTL (`direction: auto | ltr | rtl` per layer).

### Editor (`apps/web`)

Portrait, dark, touch-first: canvas (drag to reposition the selected layer), transport,
collapsible multilayer timeline (touch scrub, tap/drag keyframe diamonds), and a property
inspector with Text / Transform / Keyframe tabs. The Keyframe tab has the Bézier editor
(draggable handles + numeric x1 y1 x2 y2). Undo/redo (100 steps, drags coalesced), autosave
to `localStorage` with Zod validation on load, safe-area insets, `100dvh` layout.

Changing an animated property writes a keyframe at the current frame; the ◆ button toggles
a keyframe at the current frame.

### Render service (`apps/render`)

* `POST /api/render { project }` — validates with Zod, persists a job to
  `apps/render/data/jobs/<id>.json`, queues it. Returns `202` with the job.
* `GET /api/jobs/:id` — status, `progress` (0..1), rendered/encoded frame counts, stage, error.
* `GET /api/jobs/:id/download` — the MP4 (`?inline=1` to play in the browser).
* `POST /api/jobs/:id/cancel`, `GET /api/jobs`, `GET /api/health`, `GET /api/test-composition`.
* `POST /api/still { project, frame }` — one PNG frame through the exact export pipeline
  (used by the parity check).

Jobs are written atomically and survive restarts: anything left `queued`/`rendering` is
re-queued on boot (max 2 attempts). Rendering uses `renderMedia` with H.264, CRF 18,
`yuv420p`, at the project's fps (60) and size (1080×1920).

Environment variables: `PORT` (3001), `MOTION_LAB_DATA_DIR`, `MOTION_LAB_BUNDLE_DIR`,
`MOTION_LAB_WEB_DIST`, `MOTION_LAB_BROWSER` (path to a chrome-headless-shell binary),
`MOTION_LAB_CONCURRENCY` (parallel browser tabs while rendering).

## QA

With the server running on :3001 (`npm start`):

```bash
npm run qa             # or: node scripts/qa.mjs [--skip-ui]
```

It runs the engine tests, submits the test composition, probes the resulting MP4 with
`ffprobe`, checks the motion in the exported pixels, screenshots the preview at several
frames (Playwright Chromium) and compares them with the MP4 frames and with lossless
export stills (SSIM/PSNR), then drives the editor on an emulated iPhone with touch events
(scrub, drag, text edit, keyframes, easing, undo/redo, playback, persistence, export).
Output lands in `qa/output/` (`results.md`, screenshots, `export.mp4`). The latest report
is in `qa/QA_REPORT.md`.

## Deployment (HTTPS)

The whole app is one Node process (editor + API + renderer). Deploy the included
`Dockerfile` to any container host that terminates TLS (Fly.io, Railway, Render, Cloud
Run, …) and mount a volume at `/data` so render jobs and MP4s persist:

```bash
docker build -t motion-lab .
docker run -p 3001:3001 -v motion-lab-data:/data motion-lab
```

The container needs ~2 GB RAM for Chromium while rendering. See `qa/QA_REPORT.md` for the
deployment status of this build.
