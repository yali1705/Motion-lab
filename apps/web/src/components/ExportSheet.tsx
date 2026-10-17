import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { api, type PublicJob } from '../lib/api';
import { IconClose } from './Icons';

const LAST_JOB_KEY = 'motion-lab:lastJob:v1';

function fmtBytes(b: number | null) {
  if (b == null) return '';
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;
}

/** Bottom sheet that submits the project to the render service and tracks the persistent job. */
export function ExportSheet() {
  const open = useEditor((s) => s.exportOpen);
  const setOpen = useEditor((s) => s.setExportOpen);
  const project = useEditor((s) => s.project);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resume tracking the last job after a reload.
  useEffect(() => {
    if (!open) return;
    const id = localStorage.getItem(LAST_JOB_KEY);
    if (id && !job) api.getJob(id).then(setJob).catch(() => localStorage.removeItem(LAST_JOB_KEY));
  }, [open, job]);

  // Poll while active.
  useEffect(() => {
    if (!open || !job || (job.status !== 'queued' && job.status !== 'rendering')) return;
    timer.current = setTimeout(() => {
      api.getJob(job.id).then(setJob).catch((e) => setError((e as Error).message));
    }, 750);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, job]);

  if (!open) return null;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const j = await api.startRender(project);
      localStorage.setItem(LAST_JOB_KEY, j.id);
      setJob(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const active = job && (job.status === 'queued' || job.status === 'rendering');
  const pct = job ? Math.round(job.progress * 100) : 0;
  const seconds = (project.durationFrames / project.fps).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => !active && setOpen(false)}>
      <div
        className="w-full bg-panel rounded-t-2xl border-t border-line px-4 pt-3 flex flex-col gap-3"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <div className="text-[15px] font-semibold flex-1">Export MP4</div>
          <button className="btn btn-icon" aria-label="Close" onClick={() => setOpen(false)}>
            <IconClose />
          </button>
        </div>
        <div className="text-[13px] text-muted">
          {project.width}×{project.height} · {project.fps} fps · {seconds}s ({project.durationFrames} frames) · H.264 · {project.layers.length} layer{project.layers.length === 1 ? '' : 's'}
        </div>

        {job ? (
          <div className="flex flex-col gap-2 rounded-xl bg-panel-2 border border-line p-3">
            <div className="flex items-center text-[13px]">
              <span className="font-semibold capitalize">{job.status === 'done' ? 'Rendered' : job.status}</span>
              <span className="text-muted ml-2">{job.stage}</span>
              <span className="flex-1" />
              <span className="font-mono text-muted">{active ? `${job.renderedFrames}/${job.totalFrames}` : job.status === 'done' ? fmtBytes(job.outputBytes) : ''}</span>
            </div>
            <div className="h-2 rounded-full bg-line overflow-hidden">
              <div className={`h-full ${job.status === 'failed' ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${job.status === 'done' ? 100 : pct}%`, transition: 'width 300ms' }} />
            </div>
            {job.error ? <div className="text-[12px] text-red-400 break-words">{job.error}</div> : null}
            {job.status === 'done' ? (
              <div className="flex gap-2 pt-1">
                <a className="btn btn-primary flex-1" href={api.downloadUrl(job.id)} download>
                  Download MP4
                </a>
                <a className="btn" href={api.downloadUrl(job.id, true)} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
            ) : null}
            {active ? (
              <button className="btn btn-sm self-start" onClick={() => api.cancel(job.id).then(() => api.getJob(job.id).then(setJob))}>
                Cancel
              </button>
            ) : null}
            <div className="text-[11px] text-muted font-mono">{job.id}</div>
          </div>
        ) : null}

        {error ? <div className="text-[12px] text-red-400 break-words">{error}</div> : null}

        <button className="btn btn-primary h-12 text-[15px]" disabled={busy || !!active || project.layers.length === 0} onClick={start}>
          {busy ? 'Submitting…' : job && !active ? 'Render again' : 'Render 1080×1920 MP4'}
        </button>
        <p className="text-[11px] text-muted">
          Rendering happens on the server with Remotion + FFmpeg using the same animation engine as this preview. Jobs are persisted; you can close this sheet and come back.
        </p>
      </div>
    </div>
  );
}
