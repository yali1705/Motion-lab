import { Easing, interpolate } from 'remotion';

export type Pt = [number, number];

// Deterministic PRNG: every texture/edge is seeded so frames are reproducible.
export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Torn-paper edge between two points: perpendicular jitter with occasional deeper bites.
export const jagged = (a: Pt, b: Pt, step: number, amp: number, seed: number): Pt[] => {
  const r = rng(seed);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / step));
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let o = i === 0 || i === n ? 0 : (r() - 0.5) * 2 * amp;
    if (r() < 0.12) o *= 2.2;
    pts.push([a[0] + (b[0] - a[0]) * t + nx * o, a[1] + (b[1] - a[1]) * t + ny * o]);
  }
  return pts;
};

export const pathOf = (pts: Pt[], close = false) =>
  'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + (close ? 'Z' : '');

type Edges = { t?: number; r?: number; b?: number; l?: number };

export const tornRect = (x: number, y: number, w: number, h: number, e: Edges, seed: number, step = 14) => {
  const side = (a: Pt, b: Pt, amp = 0, s: number) =>
    amp > 0 ? jagged(a, b, step, amp, s).slice(0, -1) : [a];
  return pathOf(
    [
      ...side([x, y], [x + w, y], e.t, seed),
      ...side([x + w, y], [x + w, y + h], e.r, seed + 1),
      ...side([x + w, y + h], [x, y + h], e.b, seed + 2),
      ...side([x, y + h], [x, y], e.l, seed + 3),
    ],
    true,
  );
};

export const k = (
  frame: number,
  input: [number, number],
  output: [number, number],
  easing: (t: number) => number = (t) => t,
) => interpolate(frame, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

export const ease = {
  expoOut: Easing.bezier(0.16, 1, 0.3, 1),
  quartOut: Easing.bezier(0.25, 1, 0.5, 1),
  rip: Easing.bezier(0.55, 0, 0.1, 1),
  slam: Easing.bezier(0.3, 1.25, 0.4, 1),
  inOutSine: Easing.bezier(0.37, 0, 0.63, 1),
  inSine: Easing.bezier(0.12, 0, 0.39, 0),
  inCubic: Easing.bezier(0.32, 0, 0.67, 0),
  outCubic: Easing.bezier(0.33, 1, 0.68, 1),
  marker: Easing.bezier(0.5, 0, 0.2, 1),
};

export const C = {
  red: '#D71920',
  redDeep: '#7A0B10',
  black: '#111111',
  cream: '#F2EDE3',
  gray: '#8A8A8A',
};
