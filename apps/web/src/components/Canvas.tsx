import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CompositionView, evaluateProject } from '@motion-lab/engine';
import { useEditor } from '../store';
import { round } from '../lib/format';

interface DragState {
  pointerId: number;
  layerId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * The preview. Renders the exact same <CompositionView> as the export,
 * scaled with a CSS transform to fit the phone screen. Touch-drag moves the
 * selected layer; the position is written back in composition pixels.
 */
export function Canvas() {
  const project = useEditor((s) => s.project);
  const frame = useEditor((s) => s.currentFrame);
  const selectedLayerId = useEditor((s) => s.selectedLayerId);
  const selectLayer = useEditor((s) => s.selectLayer);
  const setPropertyValue = useEditor((s) => s.setPropertyValue);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const playing = useEditor((s) => s.playing);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const drag = useRef<DragState | null>(null);

  // Fit 1080×1920 into the available area.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const pad = 16;
      const s = Math.min((r.width - pad * 2) / project.width, (r.height - pad * 2) / project.height);
      setScale(Math.max(0.01, s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  // Selection outline measured from the real layer DOM box (so it matches text metrics exactly).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !selectedLayerId) {
      setBox(null);
      return;
    }
    const el = stage.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(selectedLayerId)}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    const sr = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setBox({ left: r.left - sr.left, top: r.top - sr.top, width: r.width, height: r.height });
  }, [project, frame, scale, selectedLayerId]);

  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const states = evaluateProject(project, frame).layers;
      // Top-most layer first.
      for (let i = states.length - 1; i >= 0; i--) {
        const s = states[i]!;
        if (!s.active) continue;
        const el = stage.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(s.layer.id)}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const slop = 12;
        if (clientX >= r.left - slop && clientX <= r.right + slop && clientY >= r.top - slop && clientY <= r.bottom + slop) return s.layer.id;
      }
      return null;
    },
    [project, frame],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (playing) return;
    const id = hitTest(e.clientX, e.clientY);
    if (!id) {
      selectLayer(null);
      return;
    }
    if (id !== selectedLayerId) selectLayer(id);
    const st = evaluateProject(project, frame).layers.find((l) => l.layer.id === id)!;
    drag.current = { pointerId: e.pointerId, layerId: id, startClientX: e.clientX, startClientY: e.clientY, startX: st.x, startY: st.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    beginGesture();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = (e.clientX - d.startClientX) / scale;
    const dy = (e.clientY - d.startClientY) / scale;
    if (!d.moved && Math.hypot(dx * scale, dy * scale) < 3) return;
    d.moved = true;
    setPropertyValue(d.layerId, 'x', round(d.startX + dx, 1), 'none');
    setPropertyValue(d.layerId, 'y', round(d.startY + dy, 1), 'none');
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    endGesture();
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-h-0 flex items-center justify-center bg-black overflow-hidden no-select">
      <div
        ref={stageRef}
        data-testid="canvas-stage"
        className="relative touch-none"
        style={{ width: project.width * scale, height: project.height * scale, boxShadow: '0 0 0 1px #2a2a2a' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: '0 0', width: project.width, height: project.height, pointerEvents: 'none' }}>
          <CompositionView project={project} frame={frame} />
        </div>
        {box && !playing ? (
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{ left: box.left - 2, top: box.top - 2, width: box.width + 4, height: box.height + 4, outline: '1.5px solid var(--color-accent)', outlineOffset: 0, borderRadius: 2 }}
          />
        ) : null}
      </div>
    </div>
  );
}
