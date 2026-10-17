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
  /** Per-job secret that authorises the download link (not the API key). */
  downloadToken?: string;
  projectName: string;
  width: number;
  height: number;
  fps: number;
}

export interface Health {
  ok: boolean;
  authRequired: boolean;
  pending: number;
  limits: { maxFrames: number; maxPixels: number; maxFps: number; maxLayers: number };
}

const KEY_STORAGE = 'motion-lab:renderKey:v1';

/** The render access key the user typed on this device (never shipped in the bundle). */
export function getRenderKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}
export function setRenderKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const key = getRenderKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
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
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  health: () => fetch('/api/health').then((r) => json<Health>(r)),
  startRender: (project: unknown) =>
    fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ project }) }).then((r) => json<PublicJob>(r)),
  getJob: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}`, { headers: authHeaders() }).then((r) => json<PublicJob>(r)),
  listJobs: () => fetch('/api/jobs', { headers: authHeaders() }).then((r) => json<PublicJob[]>(r)),
  cancel: (id: string) => fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: authHeaders() }).then((r) => json<{ ok: boolean }>(r)),
  downloadUrl: (job: PublicJob, inline = false) => {
    const q = new URLSearchParams();
    if (job.downloadToken) q.set('t', job.downloadToken);
    if (inline) q.set('inline', '1');
    const qs = q.toString();
    return `/api/jobs/${encodeURIComponent(job.id)}/download${qs ? `?${qs}` : ''}`;
  },
};
