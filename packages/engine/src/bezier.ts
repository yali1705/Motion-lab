import type { Easing } from './schema.js';

/**
 * Deterministic cubic Bézier easing solver (same algorithm as CSS
 * `cubic-bezier()`): Newton–Raphson with a bisection fallback. Pure math,
 * no platform dependencies, so the editor preview and the headless render
 * produce bit-identical results.
 */
const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 1e-7;
const SUBDIVISION_MAX_ITERATIONS = 32;

const A = (a1: number, a2: number) => 1.0 - 3.0 * a2 + 3.0 * a1;
const B = (a1: number, a2: number) => 3.0 * a2 - 6.0 * a1;
const C = (a1: number) => 3.0 * a1;

/** Returns x(t) or y(t) for the given control values. */
const calcBezier = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
/** d/dt of calcBezier. */
const getSlope = (t: number, a1: number, a2: number) => 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1);

function binarySubdivide(x: number, a: number, b: number, x1: number, x2: number): number {
  let currentX = 0;
  let currentT = 0;
  let i = 0;
  do {
    currentT = a + (b - a) / 2.0;
    currentX = calcBezier(currentT, x1, x2) - x;
    if (currentX > 0.0) b = currentT;
    else a = currentT;
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT;
}

function newtonRaphson(x: number, guessT: number, x1: number, x2: number): number {
  for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
    const slope = getSlope(guessT, x1, x2);
    if (slope === 0.0) return guessT;
    const currentX = calcBezier(guessT, x1, x2) - x;
    guessT -= currentX / slope;
  }
  return guessT;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Evaluate the easing curve at progress x ∈ [0,1]. Returns eased progress (may overshoot). */
export function cubicBezier(easing: Easing, x: number): number {
  const x1 = clamp01(easing.x1);
  const x2 = clamp01(easing.x2);
  const { y1, y2 } = easing;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x1 === y1 && x2 === y2) return x; // linear
  const guess = newtonRaphson(x, x, x1, x2);
  let t: number;
  const slope = getSlope(guess, x1, x2);
  if (slope >= NEWTON_MIN_SLOPE && guess >= 0 && guess <= 1 && Math.abs(calcBezier(guess, x1, x2) - x) < 1e-6) {
    t = guess;
  } else {
    t = binarySubdivide(x, 0, 1, x1, x2);
  }
  return calcBezier(t, y1, y2);
}

export function isLinear(e: Easing): boolean {
  return e.x1 === e.y1 && e.x2 === e.y2;
}
