import { useEffect, useRef } from 'react';
import { useEditor } from '../store';
import { formatTime } from '../lib/format';
import { IconChevron, IconPause, IconPlay, IconSkipEnd, IconSkipStart } from './Icons';

/** Play/pause with a time-based clock so playback is frame-accurate at the project fps. */
export function usePlayback() {
  const playing = useEditor((s) => s.playing);
  const fps = useEditor((s) => s.project.fps);
  const duration = useEditor((s) => s.project.durationFrames);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const startFrame = useEditor.getState().currentFrame >= duration - 1 ? 0 : useEditor.getState().currentFrame;
    const t0 = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - t0) / 1000;
      const f = (startFrame + Math.floor(elapsed * fps)) % duration;
      if (f !== useEditor.getState().currentFrame) useEditor.setState({ currentFrame: f });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, fps, duration]);
}

export function Transport() {
  const playing = useEditor((s) => s.playing);
  const toggle = useEditor((s) => s.togglePlaying);
  const frame = useEditor((s) => s.currentFrame);
  const fps = useEditor((s) => s.project.fps);
  const duration = useEditor((s) => s.project.durationFrames);
  const setFrame = useEditor((s) => s.setFrame);
  const setPlaying = useEditor((s) => s.setPlaying);
  const timelineOpen = useEditor((s) => s.timelineOpen);
  const setTimelineOpen = useEditor((s) => s.setTimelineOpen);

  return (
    <div className="flex items-center gap-1 px-2 h-12 shrink-0 border-t border-b border-line bg-panel">
      <button className="btn btn-icon" aria-label="Go to start" onClick={() => { setPlaying(false); setFrame(0); }}>
        <IconSkipStart />
      </button>
      <button className="btn btn-icon btn-primary" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button className="btn btn-icon" aria-label="Go to end" onClick={() => { setPlaying(false); setFrame(duration - 1); }}>
        <IconSkipEnd />
      </button>
      <div className="flex-1 text-center font-mono text-[13px] tabular-nums text-muted">
        <span className="text-fg" data-testid="frame">{frame}</span>/{duration - 1} · {formatTime(frame, fps)} · {fps}fps
      </div>
      <button className="btn btn-icon" aria-label={timelineOpen ? 'Collapse timeline' : 'Expand timeline'} onClick={() => setTimelineOpen(!timelineOpen)}>
        <IconChevron open={!timelineOpen} />
      </button>
    </div>
  );
}
