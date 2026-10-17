import { makeCancelSignal, renderMedia, renderStill, selectComposition, type ChromiumOptions } from '@remotion/renderer';
import { statSync } from 'node:fs';
import { cpus } from 'node:os';
import type { Project } from '@motion-lab/engine';
import { buildBundle } from './bundle.js';
import { findBrowser } from './paths.js';
import { listJobs, loadJob, outputPath, saveJob, type RenderJob } from './jobs.js';
import { LIMITS } from './security.js';

const COMPOSITION_ID = 'MotionLab';
const MAX_ATTEMPTS = 2;

const chromiumOptions: ChromiumOptions = {
  gl: 'swangle',
  headless: true,
  // Make sure text rasterises deterministically in the headless render.
  disableWebSecurity: false,
};

const browserExecutable = findBrowser();
const concurrency = Number(process.env.MOTION_LAB_CONCURRENCY ?? Math.max(1, Math.min(4, Math.floor(cpus().length / 2))));

let serveUrlPromise: Promise<string> | null = null;
export function getServeUrl(): Promise<string> {
  if (!serveUrlPromise) serveUrlPromise = buildBundle(false);
  return serveUrlPromise;
}

const cancels = new Map<string, () => void>();
let running = false;
const queue: string[] = [];

/** Jobs waiting plus the one rendering. */
export function pendingCount(): number {
  return queue.length + (running ? 1 : 0);
}

export function enqueue(jobId: string) {
  if (!queue.includes(jobId)) queue.push(jobId);
  void pump();
}

export function cancelJob(jobId: string): boolean {
  const idx = queue.indexOf(jobId);
  if (idx >= 0) {
    queue.splice(idx, 1);
    const job = loadJob(jobId);
    if (job) {
      job.status = 'cancelled';
      job.stage = 'cancelled';
      job.finishedAt = new Date().toISOString();
      saveJob(job);
    }
    return true;
  }
  const c = cancels.get(jobId);
  if (c) {
    c();
    return true;
  }
  return false;
}

/** Re-queue jobs that were interrupted by a previous process exit. */
export function recoverJobs() {
  for (const job of listJobs()) {
    if (job.status === 'queued' || job.status === 'rendering') {
      if (job.attempts >= MAX_ATTEMPTS) {
        job.status = 'failed';
        job.error = 'Render interrupted too many times';
        job.finishedAt = new Date().toISOString();
        saveJob(job);
        continue;
      }
      job.status = 'queued';
      job.stage = 'queued (recovered)';
      saveJob(job);
      enqueue(job.id);
    }
  }
}

async function pump() {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  running = true;
  try {
    await runJob(id);
  } finally {
    running = false;
    void pump();
  }
}

async function runJob(id: string) {
  const job = loadJob(id);
  if (!job || job.status === 'cancelled') return;
  job.status = 'rendering';
  job.stage = 'bundling';
  job.attempts += 1;
  job.startedAt = new Date().toISOString();
  saveJob(job);

  const { cancelSignal, cancel } = makeCancelSignal();
  cancels.set(id, cancel);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    cancel();
  }, LIMITS.jobTimeoutMs);
  let lastSave = 0;
  const persist = (force = false) => {
    const now = Date.now();
    if (force || now - lastSave > 400) {
      lastSave = now;
      saveJob(job);
    }
  };

  try {
    const serveUrl = await getServeUrl();
    job.stage = 'preparing';
    persist(true);
    const inputProps = { project: job.project };
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
      browserExecutable: browserExecutable ?? undefined,
      chromiumOptions,
    });
    job.totalFrames = composition.durationInFrames;
    job.stage = 'rendering';
    persist(true);
    const out = outputPath(id);
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: out,
      inputProps,
      cancelSignal,
      browserExecutable: browserExecutable ?? undefined,
      chromiumOptions,
      concurrency,
      // 60 fps, visually lossless-ish H.264 suitable for iPhone playback.
      crf: 18,
      pixelFormat: 'yuv420p',
      x264Preset: 'medium',
      colorSpace: 'bt709',
      imageFormat: 'png',
      scale: 1,
      logLevel: 'warn',
      onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
        job.progress = progress;
        job.renderedFrames = renderedFrames;
        job.encodedFrames = encodedFrames;
        job.stage = stitchStage === 'muxing' ? 'muxing' : 'rendering';
        persist();
      },
    });
    job.status = 'done';
    job.stage = 'done';
    job.progress = 1;
    job.outputFile = out;
    job.outputBytes = statSync(out).size;
    job.finishedAt = new Date().toISOString();
    persist(true);
    console.log(`[render] ${id} done (${job.outputBytes} bytes)`);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const wasCancelled = /cancel/i.test(msg) && !timedOut;
    job.status = wasCancelled ? 'cancelled' : 'failed';
    job.stage = job.status;
    job.error = wasCancelled ? null : timedOut ? `Render exceeded the ${Math.round(LIMITS.jobTimeoutMs / 60000)} minute limit` : msg;
    job.finishedAt = new Date().toISOString();
    persist(true);
    console.error(`[render] ${id} ${job.status}: ${msg}`);
  } finally {
    clearTimeout(timeout);
    cancels.delete(id);
  }
}

/** Render a single frame to PNG (used for preview/export parity checks). */
export async function renderFrameStill(project: Project, frame: number, output: string) {
  const serveUrl = await getServeUrl();
  const inputProps = { project };
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
    browserExecutable: browserExecutable ?? undefined,
    chromiumOptions,
  });
  await renderStill({
    composition,
    serveUrl,
    inputProps,
    frame,
    output,
    imageFormat: 'png',
    browserExecutable: browserExecutable ?? undefined,
    chromiumOptions,
    logLevel: 'warn',
  });
}

export const rendererInfo = () => ({ browserExecutable, concurrency });
export type { RenderJob };
