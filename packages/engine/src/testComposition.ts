import type { Easing, Keyframe, Project, TextLayer } from './schema.js';

const kf = (id: string, frame: number, value: number, easing: Easing = { x1: 0, y1: 0, x2: 1, y2: 1 }): Keyframe => ({ id, frame, value, easing });

export const DEFAULT_WIDTH = 1080;
export const DEFAULT_HEIGHT = 1920;
export const DEFAULT_FPS = 60;

/** Fresh static text layer centred on the canvas. */
export function createTextLayer(partial: Partial<TextLayer> & { id: string }): TextLayer {
  return {
    type: 'text',
    name: 'Text',
    visible: true,
    inFrame: 0,
    outFrame: DEFAULT_FPS * 5,
    text: 'Text',
    fontSize: 96,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: 0,
    lineHeight: 1.1,
    textAlign: 'center',
    direction: 'auto',
    width: 960,
    transform: {
      x: { value: DEFAULT_WIDTH / 2, keyframes: [] },
      y: { value: DEFAULT_HEIGHT / 2, keyframes: [] },
      scale: { value: 1, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      opacity: { value: 1, keyframes: [] },
    },
    ...partial,
  };
}

/**
 * The reference composition: "MOTION IS DESIGN", 5 s at 60 fps, 1080×1920.
 * Upward entrance, subtle scale overshoot, opacity reveal, custom Bézier
 * easing, then a clean hold. Every value here is an ordinary editable
 * keyframe — nothing is hard-coded in the renderer.
 */
export function createTestComposition(): Project {
  const enterEase: Easing = { x1: 0.16, y1: 1, x2: 0.3, y2: 1 }; // strong ease-out
  const overshootUp: Easing = { x1: 0.22, y1: 1, x2: 0.36, y2: 1 };
  const settle: Easing = { x1: 0.4, y1: 0, x2: 0.2, y2: 1 };
  const reveal: Easing = { x1: 0.3, y1: 0, x2: 0.1, y2: 1 };

  const headline = createTextLayer({
    id: 'layer_headline',
    name: 'Headline',
    text: 'MOTION IS\nDESIGN',
    fontSize: 118,
    fontWeight: 800,
    letterSpacing: 6,
    lineHeight: 1.02,
    width: 980,
    outFrame: 300,
    transform: {
      x: { value: 540, keyframes: [] },
      y: { value: 960, keyframes: [kf('kf_h_y0', 0, 1130), kf('kf_h_y1', 60, 940, enterEase)] },
      scale: {
        value: 1,
        keyframes: [kf('kf_h_s0', 0, 0.9, overshootUp), kf('kf_h_s1', 48, 1.035, settle), kf('kf_h_s2', 84, 1)],
      },
      rotation: { value: 0, keyframes: [] },
      opacity: { value: 1, keyframes: [kf('kf_h_o0', 0, 0, reveal), kf('kf_h_o1', 40, 1)] },
    },
  });

  const subtitle = createTextLayer({
    id: 'layer_subtitle',
    name: 'Subtitle (Hebrew)',
    text: 'תנועה היא עיצוב',
    fontSize: 54,
    fontWeight: 400,
    color: '#9a9a9a',
    letterSpacing: 1,
    lineHeight: 1.2,
    width: 900,
    inFrame: 0,
    outFrame: 300,
    transform: {
      x: { value: 540, keyframes: [] },
      y: { value: 1090, keyframes: [kf('kf_s_y0', 24, 1140), kf('kf_s_y1', 90, 1090, enterEase)] },
      scale: { value: 1, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      opacity: { value: 1, keyframes: [kf('kf_s_o0', 24, 0, reveal), kf('kf_s_o1', 78, 1)] },
    },
  });

  return {
    version: 1,
    id: 'project_motion_is_design',
    name: 'Motion Is Design',
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    fps: DEFAULT_FPS,
    durationFrames: 300,
    background: '#111111',
    layers: [headline, subtitle],
  };
}
