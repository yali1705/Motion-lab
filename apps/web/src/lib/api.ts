export interface PublicJob {
  id: string;
  status: 'queued' | 'rendering' | 'done' | 'failed' | 'cancelled';
  progress: number;
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
  stage: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  outputBytes: number | null;
  projectName: string;
  width: number;
  height: number;
  fps: number;
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  startRender: (project: unknown) =>
    fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) }).then((r) => json<PublicJob>(r)),
  getJob: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}`).then((r) => json<PublicJob>(r)),
  listJobs: () => fetch('/api/jobs').then((r) => json<PublicJob[]>(r)),
  cancel: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).then((r) => json<{ ok: boolean }>(r)),
  downloadUrl: (id: string, inline = false) => `/api/jobs/${encodeURIComponent(id)}/download${inline ? '?inline=1' : ''}`,
  health: () => fetch('/api/health').then((r) => json<{ ok: boolean }>(r)),
};
