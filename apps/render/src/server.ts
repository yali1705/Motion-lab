import express from 'express';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ProjectSchema, createTestComposition, safeParseProject } from '@motion-lab/engine';
import { createJob, ensureDirs, listJobs, loadJob, outputPath, pruneJobs, toPublic } from './jobs.js';
import { cancelJob, enqueue, getServeUrl, pendingCount, recoverJobs, renderFrameStill, rendererInfo } from './renderer.js';
import { WEB_DIST } from './paths.js';
import { AUTH_REQUIRED, LIMITS, assertAuthConfigured, checkProjectLimits, isAuthorized, rateLimit, requireAuth, safeEqual, securityHeaders } from './security.js';

assertAuthConfigured();

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.disable('x-powered-by');
// Behind Fly.io / any TLS-terminating proxy: use X-Forwarded-For for rate limiting.
app.set('trust proxy', Number(process.env.MOTION_LAB_TRUST_PROXY ?? 1));
app.use(securityHeaders);
app.use('/api', rateLimit('api', 240, 60 * 1000));
app.use(express.json({ limit: '1mb' }));

// ---- public ---------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, authRequired: AUTH_REQUIRED, pending: pendingCount(), limits: { maxFrames: LIMITS.maxFrames, maxPixels: LIMITS.maxPixels, maxFps: LIMITS.maxFps, maxLayers: LIMITS.maxLayers }, ...rendererInfo() });
});

app.get('/api/test-composition', (_req, res) => {
  res.json(createTestComposition());
});

/** The MP4 — authorised by the per-job download token (so plain <a download> links work) or the API key. */
app.get('/api/jobs/:id/download', rateLimit('download', 60, 60 * 1000), (req, res) => {
  const id = String(req.params.id);
  const job = loadJob(id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const t = typeof req.query.t === 'string' ? req.query.t : '';
  const tokenOk = !!job.downloadToken && t.length > 0 && safeEqual(t, job.downloadToken);
  if (!tokenOk && !isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (job.status !== 'done') return res.status(404).json({ error: 'Not ready' });
  const file = outputPath(id);
  if (!existsSync(file)) return res.status(404).json({ error: 'File missing' });
  const name = `${job.projectName.replace(/[^\w֐-׿-]+/g, '_') || 'motion-lab'}_${job.width}x${job.height}_${job.fps}fps.mp4`;
  const inline = req.query.inline === '1';
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.sendFile(file);
});

// ---- authenticated --------------------------------------------------------
app.use('/api', requireAuth);

const RenderRequest = z.object({ project: z.unknown() });

app.post('/api/render', rateLimit('render', 6, 10 * 60 * 1000), (req, res) => {
  const body = RenderRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Body must be { project }' });
  const parsed = safeParseProject(body.data.project);
  if (!parsed.success) return res.status(400).json({ error: `Invalid project: ${parsed.error}` });
  const limit = checkProjectLimits(parsed.data);
  if (limit) return res.status(422).json({ error: `Project exceeds render limits: ${limit}` });
  if (pendingCount() >= LIMITS.maxPending) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Render queue is full — try again in a minute' });
  }
  const job = createJob(parsed.data);
  enqueue(job.id);
  return res.status(202).json(toPublic(job));
});

app.get('/api/jobs', (_req, res) => {
  res.json(listJobs().slice(0, 50).map(toPublic));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = loadJob(String(req.params.id));
  if (!job) return res.status(404).json({ error: 'Not found' });
  return res.json(toPublic(job));
});

app.get('/api/jobs/:id/project', (req, res) => {
  const job = loadJob(String(req.params.id));
  if (!job) return res.status(404).json({ error: 'Not found' });
  return res.json(job.project);
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const ok = cancelJob(String(req.params.id));
  return res.json({ ok });
});

/** Render one frame to PNG with the exact export pipeline (for parity checks). */
app.post('/api/still', rateLimit('still', 30, 10 * 60 * 1000), async (req, res) => {
  const body = z.object({ project: z.unknown(), frame: z.number().int().min(0) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Body must be { project, frame }' });
  const parsed = ProjectSchema.safeParse(body.data.project);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid project' });
  const limit = checkProjectLimits(parsed.data);
  if (limit) return res.status(422).json({ error: `Project exceeds render limits: ${limit}` });
  if (body.data.frame >= parsed.data.durationFrames) return res.status(400).json({ error: 'frame out of range' });
  const dir = mkdtempSync(join(tmpdir(), 'ml-still-'));
  try {
    const out = join(dir, `frame-${body.data.frame}.png`);
    await renderFrameStill(parsed.data, body.data.frame, out);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(readFileSync(out));
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---- static editor ---------------------------------------------------------
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
  console.log(`[web] serving ${WEB_DIST}`);
} else {
  console.log('[web] apps/web/dist not found — run `npm run build -w @motion-lab/web` to serve the editor from this server');
}

ensureDirs();
app.listen(PORT, () => {
  console.log(`[render] Motion Lab render service on http://localhost:${PORT} (auth: ${AUTH_REQUIRED ? 'required' : 'OFF'}, browser: ${rendererInfo().browserExecutable ?? 'remotion default'}, concurrency: ${rendererInfo().concurrency}, limits: ${LIMITS.maxFrames} frames / ${LIMITS.maxPixels} px / ${LIMITS.retentionDays}d retention)`);
  recoverJobs();
  const prune = () => {
    const n = pruneJobs(LIMITS.retentionDays);
    if (n) console.log(`[jobs] pruned ${n} job(s) older than ${LIMITS.retentionDays} days`);
  };
  prune();
  setInterval(prune, 60 * 60 * 1000).unref();
  // Warm the bundle so the first render doesn't pay the webpack cost.
  getServeUrl().catch((e) => console.error('[bundle] failed:', e));
});
