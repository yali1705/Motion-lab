import { create } from 'zustand';
import {
  LINEAR,
  clampFrame,
  createTestComposition,
  createTextLayer,
  evaluateProperty,
  safeParseProject,
  sortedKeyframes,
  uid,
  type Easing,
  type Keyframe,
  type Layer,
  type Project,
  type TransformProperty,
} from '@motion-lab/engine';

const STORAGE_KEY = 'motion-lab:project:v1';
const UI_KEY = 'motion-lab:ui:v1';
const HISTORY_LIMIT = 100;

export interface KeyframeRef {
  layerId: string;
  property: TransformProperty;
  keyframeId: string;
}

export type InspectorTab = 'layer' | 'transform' | 'keyframe';

interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  gestureBase: Project | null;
  currentFrame: number;
  playing: boolean;
  selectedLayerId: string | null;
  selectedKeyframe: KeyframeRef | null;
  timelineOpen: boolean;
  inspectorTab: InspectorTab;
  inspectorOpen: boolean;
  exportOpen: boolean;
  persistedAt: number | null;

  // project edits
  update: (fn: (p: Project) => Project, history?: 'push' | 'none') => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  loadProject: (p: Project) => void;
  resetToTestComposition: () => void;
  newEmptyProject: () => void;

  // playback
  setFrame: (f: number) => void;
  setPlaying: (p: boolean) => void;
  togglePlaying: () => void;

  // selection / ui
  selectLayer: (id: string | null) => void;
  selectKeyframe: (ref: KeyframeRef | null) => void;
  setTimelineOpen: (open: boolean) => void;
  setInspectorTab: (t: InspectorTab) => void;
  setInspectorOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;

  // layers
  addTextLayer: () => void;
  deleteLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  moveLayer: (id: string, dir: 1 | -1) => void;
  updateLayer: (id: string, patch: Partial<Layer>, history?: 'push' | 'none') => void;

  // properties & keyframes
  /** Set a transform property at the current frame: writes a keyframe if the property is animated, else the static value. */
  setPropertyValue: (layerId: string, property: TransformProperty, value: number, history?: 'push' | 'none') => void;
  toggleKeyframe: (layerId: string, property: TransformProperty) => void;
  addKeyframe: (layerId: string, property: TransformProperty, frame: number, value?: number) => void;
  deleteKeyframe: (ref: KeyframeRef) => void;
  moveKeyframe: (ref: KeyframeRef, frame: number, history?: 'push' | 'none') => void;
  setKeyframeValue: (ref: KeyframeRef, value: number, history?: 'push' | 'none') => void;
  setKeyframeEasing: (ref: KeyframeRef, easing: Easing, history?: 'push' | 'none') => void;
  clearAnimation: (layerId: string, property: TransformProperty) => void;
}

function loadPersisted(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const r = safeParseProject(JSON.parse(raw));
      if (r.success) return r.data;
      console.warn('[persist] stored project invalid, falling back:', r.error);
    }
  } catch (e) {
    console.warn('[persist] load failed', e);
  }
  return createTestComposition();
}

function loadUi(): { timelineOpen: boolean; currentFrame: number; selectedLayerId: string | null } {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { timelineOpen: true, currentFrame: 0, selectedLayerId: null, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { timelineOpen: true, currentFrame: 0, selectedLayerId: null };
}

const layerById = (p: Project, id: string) => p.layers.find((l) => l.id === id);

function mapLayer(p: Project, id: string, fn: (l: Layer) => Layer): Project {
  return { ...p, layers: p.layers.map((l) => (l.id === id ? fn(l) : l)) };
}

function mapProperty(p: Project, layerId: string, property: TransformProperty, fn: (prop: Layer['transform'][TransformProperty]) => Layer['transform'][TransformProperty]): Project {
  return mapLayer(p, layerId, (l) => ({ ...l, transform: { ...l.transform, [property]: fn(l.transform[property]) } }));
}

export function keyframeAt(layer: Layer, property: TransformProperty, frame: number): Keyframe | undefined {
  return layer.transform[property].keyframes.find((k) => k.frame === frame);
}

const initialUi = loadUi();
const initialProject = loadPersisted();

export const useEditor = create<EditorState>((set, get) => ({
  project: initialProject,
  past: [],
  future: [],
  gestureBase: null,
  currentFrame: clampFrame(initialProject, initialUi.currentFrame),
  playing: false,
  selectedLayerId: initialUi.selectedLayerId && layerById(initialProject, initialUi.selectedLayerId) ? initialUi.selectedLayerId : (initialProject.layers[0]?.id ?? null),
  selectedKeyframe: null,
  timelineOpen: initialUi.timelineOpen,
  inspectorTab: 'transform',
  inspectorOpen: true,
  exportOpen: false,
  persistedAt: null,

  update: (fn, history = 'push') =>
    set((s) => {
      const next = fn(s.project);
      if (next === s.project) return {};
      if (history === 'none' || s.gestureBase) return { project: next };
      return { project: next, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.project], future: [] };
    }),
  beginGesture: () => set((s) => (s.gestureBase ? {} : { gestureBase: s.project })),
  endGesture: () =>
    set((s) => {
      if (!s.gestureBase) return {};
      if (s.gestureBase === s.project) return { gestureBase: null };
      return { gestureBase: null, past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.gestureBase], future: [] };
    }),
  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev) return {};
      return { project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], gestureBase: null, selectedKeyframe: null, currentFrame: clampFrame(prev, s.currentFrame) };
    }),
  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return {};
      return { project: next, past: [...s.past, s.project], future: s.future.slice(1), gestureBase: null, selectedKeyframe: null, currentFrame: clampFrame(next, s.currentFrame) };
    }),
  loadProject: (p) => set((s) => ({ project: p, past: [...s.past, s.project], future: [], selectedLayerId: p.layers[0]?.id ?? null, selectedKeyframe: null, currentFrame: 0, playing: false })),
  resetToTestComposition: () => get().loadProject(createTestComposition()),
  newEmptyProject: () => {
    const base = createTestComposition();
    get().loadProject({ ...base, id: uid('project'), name: 'Untitled', layers: [] });
  },

  setFrame: (f) => set((s) => ({ currentFrame: clampFrame(s.project, f) })),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),

  selectLayer: (id) => set((s) => ({ selectedLayerId: id, selectedKeyframe: s.selectedKeyframe?.layerId === id ? s.selectedKeyframe : null, inspectorTab: s.inspectorTab === 'keyframe' ? 'transform' : s.inspectorTab })),
  selectKeyframe: (ref) =>
    set((s) => {
      if (!ref) return { selectedKeyframe: null, inspectorTab: s.inspectorTab === 'keyframe' ? 'transform' : s.inspectorTab };
      const layer = layerById(s.project, ref.layerId);
      const kf = layer?.transform[ref.property].keyframes.find((k) => k.id === ref.keyframeId);
      if (!kf) return {};
      return { selectedKeyframe: ref, selectedLayerId: ref.layerId, currentFrame: kf.frame, inspectorTab: 'keyframe', inspectorOpen: true, playing: false };
    }),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab, inspectorOpen: true }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen, playing: exportOpen ? false : get().playing }),

  addTextLayer: () => {
    const p = get().project;
    const id = uid('layer');
    const layer = createTextLayer({
      id,
      name: `Text ${p.layers.length + 1}`,
      text: 'New text',
      outFrame: p.durationFrames,
      transform: {
        x: { value: p.width / 2, keyframes: [] },
        y: { value: p.height / 2, keyframes: [] },
        scale: { value: 1, keyframes: [] },
        rotation: { value: 0, keyframes: [] },
        opacity: { value: 1, keyframes: [] },
      },
    });
    get().update((pr) => ({ ...pr, layers: [...pr.layers, layer] }));
    set({ selectedLayerId: id, selectedKeyframe: null, inspectorTab: 'layer' });
  },
  deleteLayer: (id) => {
    get().update((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
    set((s) => ({ selectedLayerId: s.selectedLayerId === id ? (s.project.layers[0]?.id ?? null) : s.selectedLayerId, selectedKeyframe: s.selectedKeyframe?.layerId === id ? null : s.selectedKeyframe }));
  },
  duplicateLayer: (id) => {
    const src = layerById(get().project, id);
    if (!src) return;
    const copy: Layer = {
      ...structuredClone(src),
      id: uid('layer'),
      name: `${src.name} copy`,
    };
    for (const prop of Object.values(copy.transform)) for (const k of prop.keyframes) k.id = uid('kf');
    get().update((p) => {
      const idx = p.layers.findIndex((l) => l.id === id);
      const layers = [...p.layers];
      layers.splice(idx + 1, 0, copy);
      return { ...p, layers };
    });
    set({ selectedLayerId: copy.id, selectedKeyframe: null });
  },
  moveLayer: (id, dir) =>
    get().update((p) => {
      const idx = p.layers.findIndex((l) => l.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= p.layers.length) return p;
      const layers = [...p.layers];
      const [l] = layers.splice(idx, 1);
      layers.splice(to, 0, l!);
      return { ...p, layers };
    }),
  updateLayer: (id, patch, history) => get().update((p) => mapLayer(p, id, (l) => ({ ...l, ...patch })), history),

  setPropertyValue: (layerId, property, value, history) => {
    const frame = get().currentFrame;
    get().update(
      (p) =>
        mapProperty(p, layerId, property, (prop) => {
          if (prop.keyframes.length === 0) return { ...prop, value };
          const existing = prop.keyframes.find((k) => k.frame === frame);
          if (existing) return { ...prop, keyframes: prop.keyframes.map((k) => (k === existing ? { ...k, value } : k)) };
          // Inherit easing from the previous keyframe so the curve stays continuous.
          const sorted = sortedKeyframes(prop.keyframes);
          const prev = [...sorted].reverse().find((k) => k.frame < frame);
          const kf: Keyframe = { id: uid('kf'), frame, value, easing: prev ? { ...prev.easing } : { ...LINEAR } };
          return { ...prop, keyframes: [...prop.keyframes, kf] };
        }),
      history,
    );
  },
  toggleKeyframe: (layerId, property) => {
    const s = get();
    const layer = layerById(s.project, layerId);
    if (!layer) return;
    const frame = s.currentFrame;
    const existing = keyframeAt(layer, property, frame);
    if (existing) {
      s.deleteKeyframe({ layerId, property, keyframeId: existing.id });
    } else {
      
      s.addKeyframe(layerId, property, frame, evaluateProperty(layer.transform[property], frame));
    }
  },
  addKeyframe: (layerId, property, frame, value) => {
    const layer = layerById(get().project, layerId);
    if (!layer) return;
    const v = value ?? evaluateProperty(layer.transform[property], frame);
    const sorted = sortedKeyframes(layer.transform[property].keyframes);
    const prev = [...sorted].reverse().find((k) => k.frame < frame);
    const kf: Keyframe = { id: uid('kf'), frame, value: v, easing: prev ? { ...prev.easing } : { ...LINEAR } };
    get().update((p) => mapProperty(p, layerId, property, (prop) => ({ ...prop, keyframes: [...prop.keyframes.filter((k) => k.frame !== frame), kf] })));
    set({ selectedKeyframe: { layerId, property, keyframeId: kf.id }, selectedLayerId: layerId });
  },
  deleteKeyframe: (ref) => {
    get().update((p) =>
      mapProperty(p, ref.layerId, ref.property, (prop) => {
        const remaining = prop.keyframes.filter((k) => k.id !== ref.keyframeId);
        // When the last keyframe is removed keep the current look as the static value.
        const value = remaining.length === 0 ? evaluateProperty(prop, get().currentFrame) : prop.value;
        return { ...prop, value, keyframes: remaining };
      }),
    );
    set((s) => ({ selectedKeyframe: s.selectedKeyframe?.keyframeId === ref.keyframeId ? null : s.selectedKeyframe, inspectorTab: s.inspectorTab === 'keyframe' ? 'transform' : s.inspectorTab }));
  },
  moveKeyframe: (ref, frame, history) => {
    const dur = get().project.durationFrames;
    const f = Math.round(Math.max(0, Math.min(dur - 1, frame)));
    get().update(
      (p) =>
        mapProperty(p, ref.layerId, ref.property, (prop) => {
          const me = prop.keyframes.find((k) => k.id === ref.keyframeId);
          if (!me || me.frame === f) return prop;
          // Moving onto another keyframe replaces it (frames are unique per property).
          return { ...prop, keyframes: prop.keyframes.filter((k) => k.id === ref.keyframeId || k.frame !== f).map((k) => (k.id === ref.keyframeId ? { ...k, frame: f } : k)) };
        }),
      history,
    );
  },
  setKeyframeValue: (ref, value, history) =>
    get().update((p) => mapProperty(p, ref.layerId, ref.property, (prop) => ({ ...prop, keyframes: prop.keyframes.map((k) => (k.id === ref.keyframeId ? { ...k, value } : k)) })), history),
  setKeyframeEasing: (ref, easing, history) =>
    get().update((p) => mapProperty(p, ref.layerId, ref.property, (prop) => ({ ...prop, keyframes: prop.keyframes.map((k) => (k.id === ref.keyframeId ? { ...k, easing } : k)) })), history),
  clearAnimation: (layerId, property) => {
    const frame = get().currentFrame;
    get().update((p) => mapProperty(p, layerId, property, (prop) => ({ value: evaluateProperty(prop, frame), keyframes: [] })));
    set((s) => ({ selectedKeyframe: s.selectedKeyframe?.layerId === layerId && s.selectedKeyframe.property === property ? null : s.selectedKeyframe }));
  },
}));





// ---- persistence -----------------------------------------------------------
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useEditor.subscribe((s, prev) => {
  if (s.project !== prev.project) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s.project));
        useEditor.setState({ persistedAt: Date.now() });
      } catch (e) {
        console.warn('[persist] save failed', e);
      }
    }, 250);
  }
  if (s.timelineOpen !== prev.timelineOpen || s.selectedLayerId !== prev.selectedLayerId || (!s.playing && s.currentFrame !== prev.currentFrame)) {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ timelineOpen: s.timelineOpen, currentFrame: s.currentFrame, selectedLayerId: s.selectedLayerId }));
    } catch {
      /* ignore */
    }
  }
});

/** Flush pending save synchronously (used on pagehide so nothing is lost when iOS kills the tab). */
export function flushPersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useEditor.getState().project));
  } catch {
    /* ignore */
  }
}

export const selectSelectedLayer = (s: EditorState) => (s.selectedLayerId ? s.project.layers.find((l) => l.id === s.selectedLayerId) ?? null : null);
