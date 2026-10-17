import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { TRANSFORM_PROPERTIES, sortedKeyframes, type Layer, type TransformProperty } from '@motion-lab/engine';
import { keyframeAt, useEditor } from '../store';
import { IconDiamond } from './Icons';

const LABEL_W = 92;
const ROW_H = 30;
const RULER_H = 28;
const PROP_LABEL: Record<TransformProperty, string> = { x: 'X', y: 'Y', scale: 'Scale', rotation: 'Rotate', opacity: 'Opacity' };

/**
 * Collapsible multilayer timeline. The ruler and empty track areas scrub;
 * keyframe diamonds select on tap and move on drag (snapped to whole frames).
 */
export function Timeline() {
  const project = useEditor((s) => s.project);
  const frame = useEditor((s) => s.currentFrame);
  const open = useEditor((s) => s.timelineOpen);
  const selectedLayerId = useEditor((s) => s.selectedLayerId);
  const selectedKeyframe = useEditor((s) => s.selectedKeyframe);
  const setFrame = useEditor((s) => s.setFrame);
  const setPlaying = useEditor((s) => s.setPlaying);
  const selectLayer = useEditor((s) => s.selectLayer);
  const selectKeyframe = useEditor((s) => s.selectKeyframe);
  const moveKeyframe = useEditor((s) => s.moveKeyframe);
  const toggleKeyframe = useEditor((s) => s.toggleKeyframe);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);

  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(300);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackW(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dur = project.durationFrames;
  const pxPerFrame = trackW / dur;
  const frameAtClientX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.round(((clientX - r.left) / r.width) * dur);
  };

  // --- scrubbing ---------------------------------------------------------
  const scrub = useRef<number | null>(null);
  const onScrubDown = (e: RPointerEvent<HTMLDivElement>) => {
    scrub.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
    setFrame(frameAtClientX(e.clientX));
  };
  const onScrubMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (scrub.current !== e.pointerId) return;
    setFrame(frameAtClientX(e.clientX));
  };
  const onScrubUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (scrub.current === e.pointerId) scrub.current = null;
  };

  // --- keyframe drag -----------------------------------------------------
  const kfDrag = useRef<{ pointerId: number; layerId: string; property: TransformProperty; keyframeId: string; startClientX: number; startFrame: number; moved: boolean } | null>(null);
  const onKfDown = (e: RPointerEvent<HTMLButtonElement>, layerId: string, property: TransformProperty, keyframeId: string, kfFrame: number) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
    kfDrag.current = { pointerId: e.pointerId, layerId, property, keyframeId, startClientX: e.clientX, startFrame: kfFrame, moved: false };
    selectKeyframe({ layerId, property, keyframeId });
    beginGesture();
  };
  const onKfMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = kfDrag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startClientX;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    const f = Math.round(d.startFrame + dx / pxPerFrame);
    moveKeyframe({ layerId: d.layerId, property: d.property, keyframeId: d.keyframeId }, f, 'none');
    setFrame(f);
  };
  const onKfUp = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = kfDrag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    kfDrag.current = null;
    endGesture();
  };

  const seconds = Math.ceil(dur / project.fps);
  const ticks = Array.from({ length: seconds + 1 }, (_, i) => i * project.fps).filter((f) => f <= dur);
  const playheadX = frame * pxPerFrame;

  const rows: Array<{ kind: 'layer'; layer: Layer } | { kind: 'prop'; layer: Layer; property: TransformProperty }> = [];
  for (const layer of project.layers) {
    rows.push({ kind: 'layer', layer });
    if (open && layer.id === selectedLayerId) for (const p of TRANSFORM_PROPERTIES) rows.push({ kind: 'prop', layer, property: p });
  }

  return (
    <section data-testid="timeline" className="shrink-0 border-b border-line bg-panel no-select" style={{ maxHeight: open ? 220 : RULER_H + 8, transition: 'max-height 180ms ease' }}>
      <div className="flex" style={{ height: open ? undefined : RULER_H + 8 }}>
        {/* label column */}
        <div className="shrink-0 overflow-hidden" style={{ width: LABEL_W, maxHeight: 220 }}>
          <div className="text-[10px] uppercase tracking-wider text-muted flex items-end pb-1 px-2" style={{ height: RULER_H }}>
            Timeline
          </div>
          {open ? (
            <div className="overflow-y-auto scrollbar-none" style={{ maxHeight: 220 - RULER_H }}>
              {rows.map((r) =>
                r.kind === 'layer' ? (
                  <button
                    key={r.layer.id}
                    className={`w-full text-left px-2 text-[12px] font-semibold truncate flex items-center ${r.layer.id === selectedLayerId ? 'text-fg bg-panel-2' : 'text-muted'}`}
                    style={{ height: ROW_H }}
                    onClick={() => selectLayer(r.layer.id)}
                  >
                    {r.layer.name}
                  </button>
                ) : (
                  <div key={r.layer.id + r.property} className="flex items-center gap-1 pl-2 pr-1 text-[11px] text-muted" style={{ height: ROW_H }}>
                    <button
                      className={`shrink-0 flex items-center justify-center w-7 h-7 rounded ${keyframeAt(r.layer, r.property, frame) ? 'text-key' : r.layer.transform[r.property].keyframes.length ? 'text-key/70' : 'text-muted'}`}
                      aria-label={`Toggle ${r.property} keyframe at frame ${frame}`}
                      onClick={() => toggleKeyframe(r.layer.id, r.property)}
                    >
                      <IconDiamond width={14} height={14} filled={!!keyframeAt(r.layer, r.property, frame)} animated={r.layer.transform[r.property].keyframes.length > 0} />
                    </button>
                    <span className="truncate">{PROP_LABEL[r.property]}</span>
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>

        {/* tracks */}
        <div className="relative flex-1 min-w-0 overflow-hidden" ref={trackRef}>
          <div data-testid="timeline-ruler" className="relative touch-none" style={{ height: RULER_H }} onPointerDown={onScrubDown} onPointerMove={onScrubMove} onPointerUp={onScrubUp} onPointerCancel={onScrubUp}>
            {ticks.map((f) => (
              <div key={f} className="absolute bottom-0 text-[10px] text-muted font-mono" style={{ left: f * pxPerFrame, transform: f === 0 ? undefined : f >= dur ? 'translateX(-100%)' : 'translateX(-50%)' }}>
                <div className="w-px h-2 bg-line mx-auto" />
                {f / project.fps}s
              </div>
            ))}
            <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
          </div>
          {open ? (
            <div className="relative overflow-y-auto scrollbar-none touch-none" style={{ maxHeight: 220 - RULER_H }} onPointerDown={onScrubDown} onPointerMove={onScrubMove} onPointerUp={onScrubUp} onPointerCancel={onScrubUp}>
              {rows.map((r) =>
                r.kind === 'layer' ? (
                  <div key={r.layer.id} className="relative border-b border-line/60" style={{ height: ROW_H }}>
                    <div
                      className={`absolute top-[7px] h-4 rounded-sm ${r.layer.id === selectedLayerId ? 'bg-accent/50' : 'bg-line'}`}
                      style={{ left: r.layer.inFrame * pxPerFrame, width: Math.max(2, (r.layer.outFrame - r.layer.inFrame) * pxPerFrame) }}
                    />
                  </div>
                ) : (
                  <div key={r.layer.id + r.property} className="relative border-b border-line/40" style={{ height: ROW_H }}>
                    {sortedKeyframes(r.layer.transform[r.property].keyframes).map((k, i, arr) => {
                      const next = arr[i + 1];
                      const sel = selectedKeyframe?.keyframeId === k.id;
                      return (
                        <span key={k.id}>
                          {next ? <div className="absolute top-1/2 h-px bg-key/40" style={{ left: k.frame * pxPerFrame, width: (next.frame - k.frame) * pxPerFrame }} /> : null}
                          <button
                            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 touch-none ${sel ? 'text-fg' : 'text-key'}`}
                            style={{ left: k.frame * pxPerFrame }}
                            aria-label={`${r.property} keyframe at frame ${k.frame}`}
                            onPointerDown={(e) => onKfDown(e, r.layer.id, r.property, k.id, k.frame)}
                            onPointerMove={onKfMove}
                            onPointerUp={onKfUp}
                            onPointerCancel={onKfUp}
                          >
                            <IconDiamond width={sel ? 16 : 13} height={sel ? 16 : 13} filled />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ),
              )}
            </div>
          ) : null}
          {/* playhead */}
          <div className="absolute top-0 bottom-0 w-px bg-accent pointer-events-none" style={{ left: playheadX }}>
            <div className="absolute -top-0 -left-[5px] w-[11px] h-[11px] bg-accent" style={{ clipPath: 'polygon(0 0,100% 0,50% 100%)' }} />
          </div>
        </div>
      </div>
    </section>
  );
}
