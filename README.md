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

## Security

The render API is protected; the editor itself is a static page.

* **Authentication** — every `/api/*` route except `/api/health`, `/api/test-composition` and the
  tokenised download requires `Authorization: Bearer <MOTION_LAB_RENDER_TOKEN>`. The token is
  read only from the server environment (16+ characters; the server refuses to start in
  production without it). The editor asks for it once in the Export sheet and keeps it in
  `localStorage` on that device — it is never embedded in the client bundle.
* **Downloads** — each job gets its own random download token, so `<a download>` links work
  without headers and the API key never appears in a URL or a log.
* **Validation** — projects are Zod-validated and then checked against resource limits
  (`MOTION_LAB_MAX_FRAMES` 1800, `MOTION_LAB_MAX_PIXELS` 1080×1920, `MOTION_LAB_MAX_FPS` 60,
  `MOTION_LAB_MAX_LAYERS` 20, text ≤ 2000 chars, ≤ 500 keyframes per property); request
  bodies are capped at 1 MB.
* **Resource limits** — at most `MOTION_LAB_MAX_PENDING` (4) jobs queued or rendering (429
  otherwise), a hard per-job timeout (`MOTION_LAB_JOB_TIMEOUT_MS`, 10 min), and finished jobs
  plus their MP4s are pruned after `MOTION_LAB_RETENTION_DAYS` (7).
* **Rate limiting** — per client IP: 240 API requests/min, 6 render submissions per 10 min,
  30 stills per 10 min, 60 downloads/min (in-memory; `trust proxy` is on for Fly.io).
* Conservative headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS in
  production).

## Deployment (HTTPS)

Target: **Fly.io** — a persistent Node.js machine with a mounted volume for render jobs,
automatic HTTPS, and enough memory for Chromium. Everything ships as one Docker image
(`Dockerfile`): editor, API and Remotion renderer (its own FFmpeg and chrome-headless-shell
are downloaded at image build time).

### One-time setup (can be done from a phone)

1. Create a Fly.io account and add a payment method (required for machines + volumes).
2. In the Fly dashboard create an **API token** (Account → Tokens).
3. In this GitHub repository go to *Settings → Secrets and variables → Actions* and add:
   * `FLY_API_TOKEN` — the token from step 2
   * `MOTION_LAB_RENDER_TOKEN` — any secret of 16+ characters; this is the access key you
     will type into the editor's Export sheet on your iPhone
   * optional variables: `FLY_APP` (default `motion-lab-<github owner>`), `FLY_ORG`
     (`personal`), `FLY_REGION` (`fra`)
4. Run the **Deploy to Fly.io** workflow (Actions tab → Deploy to Fly.io → *Run workflow*),
   or push to the deployment branch. The workflow creates the app and volume, sets the
   secret, deploys, and then runs the full QA suite against the public URL.

The app is then at `https://<FLY_APP>.fly.dev`.

### Manual deploy

```bash
export FLY_API_TOKEN=…  MOTION_LAB_RENDER_TOKEN=…  FLY_APP=motion-lab-yourname
scripts/deploy-fly.sh
```

### Any other Docker host

```bash
docker build -t motion-lab .
docker run -p 3001:3001 -e MOTION_LAB_RENDER_TOKEN=change-me-0123456789 -v motion-lab-data:/data motion-lab
```

The container needs ~2 GB RAM while rendering. CI (`.github/workflows/ci.yml`) builds this
exact image on every push and runs the QA suite against it.
