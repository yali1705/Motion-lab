import { TRANSFORM_PROPERTIES, evaluateProperty, sortedKeyframes, type Easing, type Layer, type TextAlign, type TextDirection, type TransformProperty } from '@motion-lab/engine';
import { keyframeAt, selectSelectedLayer, useEditor, type InspectorTab } from '../store';
import { clamp, round } from '../lib/format';
import { EasingEditor } from './EasingEditor';
import { IconChevron, IconCopy, IconDiamond, IconDown, IconEye, IconPlus, IconTrash, IconUp } from './Icons';

const PROP_META: Record<TransformProperty, { label: string; min: number; max: number; step: number; unit?: string }> = {
  x: { label: 'X', min: -540, max: 1620, step: 1, unit: 'px' },
  y: { label: 'Y', min: -960, max: 2880, step: 1, unit: 'px' },
  scale: { label: 'Scale', min: 0, max: 3, step: 0.01, unit: '×' },
  rotation: { label: 'Rotation', min: -180, max: 180, step: 1, unit: '°' },
  opacity: { label: 'Opacity', min: 0, max: 1, step: 0.01 },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted min-w-0">
      {label}
      {children}
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ v: T; l: string }>; onChange: (v: T) => void }) {
  return (
    <div className="grid rounded-lg border border-line overflow-hidden" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.v} className={`h-9 text-[13px] font-semibold ${o.v === value ? 'bg-accent text-white' : 'bg-panel-2 text-muted'}`} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** Property inspector: layer list + tabs for layer, transform and the selected keyframe. */
export function Inspector() {
  const layers = useEditor((s) => s.project.layers);
  const layer = useEditor(selectSelectedLayer);
  const tab = useEditor((s) => s.inspectorTab);
  const setTab = useEditor((s) => s.setInspectorTab);
  const selectLayer = useEditor((s) => s.selectLayer);
  const addTextLayer = useEditor((s) => s.addTextLayer);
  const selectedKeyframe = useEditor((s) => s.selectedKeyframe);
  const open = useEditor((s) => s.inspectorOpen);
  const setOpen = useEditor((s) => s.setInspectorOpen);

  return (
    <section data-testid="inspector" className="flex flex-col shrink-0 bg-bg" style={{ height: open ? 300 : 84 }}>
      {/* layer strip */}
      <div className="flex items-center gap-2 px-3 h-11 shrink-0 overflow-x-auto scrollbar-none border-b border-line">
        <button className="btn btn-sm btn-icon shrink-0" aria-label="Add text layer" onClick={addTextLayer}>
          <IconPlus />
        </button>
        {layers.map((l) => (
          <button
            key={l.id}
            className={`btn btn-sm shrink-0 max-w-[40vw] ${l.id === layer?.id ? '!bg-fg !text-bg !border-fg' : ''}`}
            onClick={() => selectLayer(l.id)}
          >
            <span className="truncate">{l.name}</span>
          </button>
        ))}
        {layers.length === 0 ? <span className="text-[12px] text-muted">No layers — add a text layer</span> : null}
      </div>
      {/* tabs */}
      <div className="grid shrink-0 border-b border-line" style={{ gridTemplateColumns: '1fr 1fr 1fr 44px' }}>
        {(['layer', 'transform', 'keyframe'] as InspectorTab[]).map((t) => (
          <button
            key={t}
            disabled={t === 'keyframe' && !selectedKeyframe}
            className={`h-10 text-[13px] font-semibold capitalize disabled:opacity-30 ${tab === t ? 'text-fg border-b-2 border-accent' : 'text-muted'}`}
            onClick={() => setTab(t)}
          >
            {t === 'layer' ? 'Text' : t}
          </button>
        ))}
        <button className="h-10 flex items-center justify-center text-muted" aria-label={open ? 'Collapse inspector' : 'Expand inspector'} onClick={() => setOpen(!open)}>
          <IconChevron open={!open} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3" style={{ WebkitOverflowScrolling: 'touch', display: open ? undefined : 'none' }}>
        {!layer ? <p className="text-muted text-[13px]">Select a layer on the canvas or in the timeline.</p> : tab === 'layer' ? <LayerPanel layer={layer} /> : tab === 'transform' ? <TransformPanel layer={layer} /> : <KeyframePanel layer={layer} />}
      </div>
    </section>
  );
}

function LayerPanel({ layer }: { layer: Layer }) {
  const updateLayer = useEditor((s) => s.updateLayer);
  const deleteLayer = useEditor((s) => s.deleteLayer);
  const duplicateLayer = useEditor((s) => s.duplicateLayer);
  const moveLayer = useEditor((s) => s.moveLayer);
  const duration = useEditor((s) => s.project.durationFrames);
  const set = (patch: Partial<Layer>) => updateLayer(layer.id, patch);
  const numField = (label: string, key: 'fontSize' | 'letterSpacing' | 'lineHeight' | 'width', step: number, min: number, max: number) => (
    <Field label={label}>
      <input type="number" step={step} min={min} max={max} value={layer[key]} className="px-2 py-2 w-full" onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set({ [key]: clamp(v, min, max) } as Partial<Layer>); }} />
    </Field>
  );
  return (
    <div className="flex flex-col gap-3">
      <Field label="Text">
        <textarea
          value={layer.text}
          rows={2}
          dir="auto"
          className="px-2 py-2 w-full resize-y"
          onChange={(e) => set({ text: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Layer name">
          <input type="text" value={layer.name} className="px-2 py-2 w-full" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Color">
          <div className="flex gap-2 items-center">
            <input type="color" value={layer.color} className="w-10 h-10 shrink-0" onChange={(e) => set({ color: e.target.value })} />
            <input type="text" value={layer.color} className="px-2 py-2 w-full font-mono" onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) set({ color: e.target.value.toLowerCase() }); }} />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {numField('Size', 'fontSize', 1, 1, 1000)}
        <Field label="Weight">
          <select value={layer.fontWeight} className="px-2 py-2 w-full h-[42px]" onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </Field>
        {numField('Box width', 'width', 10, 10, 4000)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {numField('Letter spacing', 'letterSpacing', 0.5, -50, 200)}
        {numField('Line height', 'lineHeight', 0.05, 0.5, 4)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Align">
          <Segmented<TextAlign> value={layer.textAlign} options={[{ v: 'left', l: 'L' }, { v: 'center', l: 'C' }, { v: 'right', l: 'R' }]} onChange={(v) => set({ textAlign: v })} />
        </Field>
        <Field label="Direction">
          <Segmented<TextDirection> value={layer.direction} options={[{ v: 'auto', l: 'Auto' }, { v: 'ltr', l: 'LTR' }, { v: 'rtl', l: 'RTL' }]} onChange={(v) => set({ direction: v })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="In (frame)">
          <input type="number" step={1} min={0} max={duration - 1} value={layer.inFrame} className="px-2 py-2 w-full font-mono" onChange={(e) => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) set({ inFrame: clamp(v, 0, Math.max(0, layer.outFrame - 1)) }); }} />
        </Field>
        <Field label="Out (frame)">
          <input type="number" step={1} min={1} max={duration} value={layer.outFrame} className="px-2 py-2 w-full font-mono" onChange={(e) => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) set({ outFrame: clamp(v, layer.inFrame + 1, duration) }); }} />
        </Field>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn btn-sm btn-icon" aria-label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={() => set({ visible: !layer.visible })}>
          <IconEye off={!layer.visible} />
        </button>
        <button className="btn btn-sm btn-icon" aria-label="Move layer down (behind)" onClick={() => moveLayer(layer.id, -1)}>
          <IconDown />
        </button>
        <button className="btn btn-sm btn-icon" aria-label="Move layer up (in front)" onClick={() => moveLayer(layer.id, 1)}>
          <IconUp />
        </button>
        <button className="btn btn-sm btn-icon" aria-label="Duplicate layer" onClick={() => duplicateLayer(layer.id)}>
          <IconCopy />
        </button>
        <div className="flex-1" />
        <button className="btn btn-sm text-red-400" onClick={() => deleteLayer(layer.id)}>
          <IconTrash /> Delete
        </button>
      </div>
    </div>
  );
}

function TransformPanel({ layer }: { layer: Layer }) {
  const frame = useEditor((s) => s.currentFrame);
  const setPropertyValue = useEditor((s) => s.setPropertyValue);
  const toggleKeyframe = useEditor((s) => s.toggleKeyframe);
  const clearAnimation = useEditor((s) => s.clearAnimation);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  return (
    <div className="flex flex-col gap-2">
      {TRANSFORM_PROPERTIES.map((prop) => {
        const meta = PROP_META[prop];
        const p = layer.transform[prop];
        const value = evaluateProperty(p, frame);
        const kfHere = keyframeAt(layer, prop, frame);
        const animated = p.keyframes.length > 0;
        return (
          <div key={prop} className="flex items-center gap-2">
            <button
              className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-line ${kfHere ? 'text-key bg-panel-2' : animated ? 'text-key/70' : 'text-muted'}`}
              aria-label={`${kfHere ? 'Remove' : 'Add'} ${meta.label} keyframe at frame ${frame}`}
              onClick={() => toggleKeyframe(layer.id, prop)}
            >
              <IconDiamond width={16} height={16} filled={!!kfHere} animated={animated} />
            </button>
            <div className="w-16 shrink-0 text-[12px] text-muted">
              {meta.label}
              {animated ? <button className="block text-[10px] text-muted/70 underline" onClick={() => clearAnimation(layer.id, prop)}>clear</button> : null}
            </div>
            <input
              type="range"
              min={meta.min}
              max={meta.max}
              step={meta.step}
              value={clamp(value, meta.min, meta.max)}
              aria-label={`${meta.label} slider`}
              className="flex-1 min-w-0"
              onPointerDown={beginGesture}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              onChange={(e) => setPropertyValue(layer.id, prop, round(Number(e.target.value), 3))}
            />
            <input
              type="number"
              step={meta.step}
              value={round(value, 3)}
              aria-label={`${meta.label} value`}
              className="w-[74px] shrink-0 px-2 py-1.5 font-mono text-[14px] text-right"
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setPropertyValue(layer.id, prop, v); }}
            />
          </div>
        );
      })}
      <p className="text-[11px] text-muted pt-1">
        ◆ adds or removes a keyframe at frame {frame}. Changing an animated property writes a keyframe at the current frame.
      </p>
    </div>
  );
}

function KeyframePanel({ layer }: { layer: Layer }) {
  const ref = useEditor((s) => s.selectedKeyframe);
  const duration = useEditor((s) => s.project.durationFrames);
  const setKeyframeValue = useEditor((s) => s.setKeyframeValue);
  const moveKeyframe = useEditor((s) => s.moveKeyframe);
  const setKeyframeEasing = useEditor((s) => s.setKeyframeEasing);
  const deleteKeyframe = useEditor((s) => s.deleteKeyframe);
  const selectKeyframe = useEditor((s) => s.selectKeyframe);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  if (!ref || ref.layerId !== layer.id) return <p className="text-muted text-[13px]">Tap a keyframe in the timeline to edit it.</p>;
  const kfs = sortedKeyframes(layer.transform[ref.property].keyframes);
  const idx = kfs.findIndex((k) => k.id === ref.keyframeId);
  const kf = kfs[idx];
  if (!kf) return null;
  const next = kfs[idx + 1];
  const prev = kfs[idx - 1];
  const meta = PROP_META[ref.property];
  const go = (k: typeof kf | undefined) => k && selectKeyframe({ ...ref, keyframeId: k.id });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className="btn btn-sm" disabled={!prev} onClick={() => go(prev)}>‹ prev</button>
        <div className="flex-1 text-center text-[13px]">
          <span className="text-muted">{layer.name} · </span>
          <span className="font-semibold">{meta.label}</span>
          <span className="text-muted"> · {idx + 1}/{kfs.length}</span>
        </div>
        <button className="btn btn-sm" disabled={!next} onClick={() => go(next)}>next ›</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Frame">
          <input
            type="number"
            step={1}
            min={0}
            max={duration - 1}
            value={kf.frame}
            className="px-2 py-2 w-full font-mono"
            onChange={(e) => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) { moveKeyframe(ref, v); useEditor.getState().setFrame(v); } }}
          />
        </Field>
        <Field label={`Value${meta.unit ? ` (${meta.unit})` : ''}`}>
          <input type="number" step={meta.step} value={kf.value} className="px-2 py-2 w-full font-mono" onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setKeyframeValue(ref, v); }} />
        </Field>
      </div>
      <div className="text-[11px] text-muted">
        Easing to next keyframe {next ? <span className="font-mono">(frame {kf.frame} → {next.frame})</span> : <span>— this is the last keyframe; its easing applies if a later keyframe is added</span>}
      </div>
      <EasingEditor easing={kf.easing} onChange={(e: Easing, h) => setKeyframeEasing(ref, e, h)} onGestureStart={beginGesture} onGestureEnd={endGesture} />
      <button className="btn btn-sm text-red-400 self-start" onClick={() => deleteKeyframe(ref)}>
        <IconTrash /> Delete keyframe
      </button>
    </div>
  );
}
