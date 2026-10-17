import { cubicBezier } from './bezier.js';
import type { AnimatableProperty, Keyframe } from './schema.js';

/** Keyframes sorted by frame ascending (stable). */
export function sortedKeyframes(keyframes: readonly Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.frame - b.frame);
}

/**
 * Evaluate an animatable property at an (integer or fractional) frame.
 * - no keyframes → static value
 * - before first keyframe → first keyframe value
 * - after last keyframe → last keyframe value (clean hold)
 * - between → cubic-bezier eased interpolation using the easing of the
 *   earlier keyframe.
 */
export function evaluateProperty(prop: AnimatableProperty, frame: number): number {
  const kfs = prop.keyframes;
  if (kfs.length === 0) return prop.value;
  const sorted = kfs.length === 1 ? kfs : sortedKeyframes(kfs);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  // Find the segment [k0, k1) that contains `frame`.
  let i = 0;
  while (i < sorted.length - 1 && sorted[i + 1]!.frame <= frame) i++;
  const k0 = sorted[i]!;
  const k1 = sorted[i + 1]!;
  if (k1.frame === k0.frame) return k1.value;
  const t = (frame - k0.frame) / (k1.frame - k0.frame);
  const eased = cubicBezier(k0.easing, t);
  return k0.value + (k1.value - k0.value) * eased;
}
