import express from 'express';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ProjectSchema, createTestComposition, safeParseProject } from '@motion-lab/engine';
import { createJob, ensureDirs, listJobs, loadJob, outputPath, toPublic } from './jobs.js';
import { cancelJob, enqueue, getServeUrl, recoverJobs, renderFrameStill, rendererInfo } from './renderer.js';
import { WEB_DIST } from './paths.js';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ...rendererInfo(), jobs: listJobs().length });
});

app.get('/api/test-composition', (_req, res) => {
  res.json(createTestComposition());
});

const RenderRequest = z.object({ project: z.unknown() });

app.post('/api/render', (req, res) => {
  const body = RenderRequest.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Body must be { project }' });
  const parsed = safeParseProject(body.data.project);
  if (!parsed.success) return res.status(400).json({ error: `Invalid project: ${parsed.error}` });
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

app.get('/api/jobs/:id/download', (req, res) => {
  const id = String(req.params.id);
  const job = loadJob(id);
  if (!job || job.status !== 'done') return res.status(404).json({ error: 'Not ready' });
  const file = outputPath(id);
  if (!existsSync(file)) return res.status(404).json({ error: 'File missing' });
  const name = `${job.projectName.replace(/[^\w֐-׿-]+/g, '_') || 'motion-lab'}_${job.width}x${job.height}_${job.fps}fps.mp4`;
  const inline = req.query.inline === '1';
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  return res.sendFile(file);
});

/** Render one frame to PNG with the exact export pipeline (for parity checks). */
app.post('/api/still', async (req, res) => {
  const body = z.object({ project: z.unknown(), frame: z.number().int().min(0) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Body must be { project, frame }' });
  const parsed = ProjectSchema.safeParse(body.data.project);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid project' });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ml-still-'));
    const out = join(dir, `frame-${body.data.frame}.png`);
    await renderFrameStill(parsed.data, body.data.frame, out);
    res.setHeader('Content-Type', 'image/png');
    return res.send(readFileSync(out));
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// Serve the built editor (single HTTPS-deployable unit) when present.
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
  console.log(`[web] serving ${WEB_DIST}`);
} else {
  console.log('[web] apps/web/dist not found — run `npm run build -w @motion-lab/web` to serve the editor from this server');
}

ensureDirs();
app.listen(PORT, () => {
  console.log(`[render] Motion Lab render service on http://localhost:${PORT} (browser: ${rendererInfo().browserExecutable ?? 'remotion default'}, concurrency: ${rendererInfo().concurrency})`);
  recoverJobs();
  // Warm the bundle so the first render doesn't pay the webpack cost.
  getServeUrl().catch((e) => console.error('[bundle] failed:', e));
});
