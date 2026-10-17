import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { LINEAR, type Easing } from '@motion-lab/engine';
import { clamp, round } from '../lib/format';

const Y_MIN = -0.5;
const Y_MAX = 1.5;
const SIZE = 100; // viewBox units

interface Props {
  easing: Easing;
  onChange: (e: Easing, history: 'push' | 'none') => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

/** Editable cubic Bézier curve with two draggable handles plus numeric inputs. */
export function EasingEditor({ easing, onChange, onGestureStart, onGestureEnd }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointerId: number; handle: 1 | 2 } | null>(null);

  const toSvg = (x: number, y: number) => ({ sx: x * SIZE, sy: SIZE - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * SIZE });
  const fromClient = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = clamp((clientX - r.left) / r.width, 0, 1);
    const y = Y_MIN + (1 - (clientY - r.top) / r.height) * (Y_MAX - Y_MIN);
    return { x: round(x, 3), y: round(clamp(y, Y_MIN, Y_MAX), 3) };
  };

  const p0 = toSvg(0, 0);
  const p1 = toSvg(easing.x1, easing.y1);
  const p2 = toSvg(easing.x2, easing.y2);
  const p3 = toSvg(1, 1);

  const onDown = (handle: 1 | 2) => (e: RPointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    drag.current = { pointerId: e.pointerId, handle };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    onGestureStart();
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const { x, y } = fromClient(e.clientX, e.clientY);
    onChange(d.handle === 1 ? { ...easing, x1: x, y1: y } : { ...easing, x2: x, y2: y }, 'none');
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    onGestureEnd();
  };

  const num = (key: keyof Easing, min: number, max: number) => (
    <label className="flex flex-col gap-1 text-[11px] text-muted">
      {key}
      <input
        type="number"
        step={0.01}
        min={min}
        max={max}
        value={easing[key]}
        className="w-full px-2 py-1.5 font-mono"
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange({ ...easing, [key]: clamp(v, min, max) }, 'push');
        }}
      />
    </label>
  );


  return (
    <div className="flex flex-col gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="touch-none rounded-lg bg-panel-2 border border-line block mx-auto"
        style={{ width: 'min(100%, 220px)', aspectRatio: '1 / 1' }}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* unit square (0..1 range) */}
        <rect x={0} y={toSvg(0, 1).sy} width={SIZE} height={toSvg(0, 0).sy - toSvg(0, 1).sy} fill="#1f1f1f" />
        <line x1={0} y1={toSvg(0, 0).sy} x2={SIZE} y2={toSvg(0, 0).sy} stroke="#333" strokeWidth={0.5} />
        <line x1={0} y1={toSvg(0, 1).sy} x2={SIZE} y2={toSvg(0, 1).sy} stroke="#333" strokeWidth={0.5} />
        <line x1={p0.sx} y1={p0.sy} x2={p3.sx} y2={p3.sy} stroke="#2e2e2e" strokeWidth={0.5} strokeDasharray="2 2" />
        <path d={`M ${p0.sx} ${p0.sy} C ${p1.sx} ${p1.sy}, ${p2.sx} ${p2.sy}, ${p3.sx} ${p3.sy}`} fill="none" stroke="#f2f2f2" strokeWidth={1.8} />
        <line x1={p0.sx} y1={p0.sy} x2={p1.sx} y2={p1.sy} stroke="#4f8cff" strokeWidth={1} />
        <line x1={p3.sx} y1={p3.sy} x2={p2.sx} y2={p2.sy} stroke="#ffb84f" strokeWidth={1} />
        <circle cx={p1.sx} cy={p1.sy} r={6} fill="#4f8cff" className="touch-none" onPointerDown={onDown(1)} />
        <circle cx={p2.sx} cy={p2.sy} r={6} fill="#ffb84f" className="touch-none" onPointerDown={onDown(2)} />
      </svg>
      <div className="grid grid-cols-4 gap-2">
        {num('x1', 0, 1)}
        {num('y1', Y_MIN, Y_MAX)}
        {num('x2', 0, 1)}
        {num('y2', Y_MIN, Y_MAX)}
      </div>
      <div className="flex gap-2">
        <button className="btn btn-sm" onClick={() => onChange({ ...LINEAR }, 'push')}>
          Linear
        </button>
        <span className="text-[11px] text-muted self-center font-mono">cubic-bezier({easing.x1}, {easing.y1}, {easing.x2}, {easing.y2})</span>
      </div>
    </div>
  );
}
