import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ProjectSchema, type Project } from '@motion-lab/engine';
import { JOBS_DIR } from './paths.js';
import { newDownloadToken } from './security.js';

export const JobStatusSchema = z.enum(['queued', 'rendering', 'done', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const RenderJobSchema = z.object({
  id: z.string(),
  status: JobStatusSchema,
  /** 0..1 */
  progress: z.number(),
  renderedFrames: z.number(),
  encodedFrames: z.number(),
  totalFrames: z.number(),
  stage: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  outputFile: z.string().nullable(),
  outputBytes: z.number().nullable(),
  attempts: z.number(),
  /** Per-job secret that authorises GET …/download without the API key (never the API key itself). */
  downloadToken: z.string().optional(),
  projectName: z.string(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  project: ProjectSchema,
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

/** Job as returned by the API (project omitted to keep responses small). */
export type PublicJob = Omit<RenderJob, 'project'>;
export const toPublic = ({ project: _p, ...rest }: RenderJob): PublicJob => rest;

const jobPath = (id: string) => join(JOBS_DIR, `${id}.json`);
export const outputPath = (id: string) => join(JOBS_DIR, `${id}.mp4`);

export function ensureDirs() {
  mkdirSync(JOBS_DIR, { recursive: true });
}

/** Atomic write so a crash mid-write never corrupts a job record. */
export function saveJob(job: RenderJob) {
  ensureDirs();
  const tmp = jobPath(job.id) + '.tmp';
  writeFileSync(tmp, JSON.stringify(job));
  renameSync(tmp, jobPath(job.id));
}

export function loadJob(id: string): RenderJob | null {
  const p = jobPath(id);
  if (!existsSync(p)) return null;
  try {
    return RenderJobSchema.parse(JSON.parse(readFileSync(p, 'utf8')));
  } catch (e) {
    console.warn(`[jobs] could not read job ${id}:`, (e as Error).message);
    return null;
  }
}

export function listJobs(): RenderJob[] {
  ensureDirs();
  return readdirSync(JOBS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => loadJob(f.replace(/\.json$/, '')))
    .filter((j): j is RenderJob => j !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Remove finished jobs (and their MP4s) older than `days`. Returns the number removed. */
export function pruneJobs(days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const job of listJobs()) {
    if (job.status === 'queued' || job.status === 'rendering') continue;
    const t = Date.parse(job.finishedAt ?? job.createdAt);
    if (Number.isFinite(t) && t < cutoff) {
      rmSync(jobPath(job.id), { force: true });
      rmSync(outputPath(job.id), { force: true });
      n++;
    }
  }
  return n;
}

export function newJobId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `job_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createJob(project: Project): RenderJob {
  const job: RenderJob = {
    id: newJobId(),
    status: 'queued',
    progress: 0,
    renderedFrames: 0,
    encodedFrames: 0,
    totalFrames: project.durationFrames,
    stage: 'queued',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
    outputFile: null,
    outputBytes: null,
    attempts: 0,
    downloadToken: newDownloadToken(),
    projectName: project.name,
    width: project.width,
    height: project.height,
    fps: project.fps,
    project,
  };
  saveJob(job);
  return job;
}
