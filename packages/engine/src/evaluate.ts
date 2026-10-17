import { evaluateProperty } from './interpolate.js';
import type { Layer, Project, TextDirection } from './schema.js';

export interface LayerState {
  layer: Layer;
  /** Whether the layer is rendered on this frame (visible and within in/out range). */
  active: boolean;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  direction: 'ltr' | 'rtl';
}

export interface FrameState {
  frame: number;
  layers: LayerState[];
}

const HEBREW_RE = /[֐-׿יִ-ﭏ]/;
const STRONG_LTR_RE = /[A-Za-zÀ-ɏ]/;

/** Resolve the rendered text direction. `auto` picks RTL if the first strong character is Hebrew. */
export function resolveDirection(text: string, direction: TextDirection): 'ltr' | 'rtl' {
  if (direction !== 'auto') return direction;
  for (const ch of text) {
    if (HEBREW_RE.test(ch)) return 'rtl';
    if (STRONG_LTR_RE.test(ch)) return 'ltr';
  }
  return 'ltr';
}

export function clampFrame(project: Pick<Project, 'durationFrames'>, frame: number): number {
  const f = Math.round(frame);
  if (!Number.isFinite(f) || f < 0) return 0;
  if (f > project.durationFrames - 1) return project.durationFrames - 1;
  return f;
}

export function evaluateLayer(layer: Layer, frame: number): LayerState {
  const t = layer.transform;
  const opacity = evaluateProperty(t.opacity, frame);
  return {
    layer,
    active: layer.visible && frame >= layer.inFrame && frame < layer.outFrame,
    x: evaluateProperty(t.x, frame),
    y: evaluateProperty(t.y, frame),
    scale: evaluateProperty(t.scale, frame),
    rotation: evaluateProperty(t.rotation, frame),
    opacity: opacity < 0 ? 0 : opacity > 1 ? 1 : opacity,
    direction: resolveDirection(layer.text, layer.direction),
  };
}

/** Evaluate every layer of the project at the given frame. Pure and deterministic. */
export function evaluateProject(project: Project, frame: number): FrameState {
  return { frame, layers: project.layers.map((l) => evaluateLayer(l, frame)) };
}
