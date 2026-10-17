import { describe, expect, it } from 'vitest';
import {
  LINEAR,
  ProjectSchema,
  createTestComposition,
  cubicBezier,
  evaluateProject,
  evaluateProperty,
  resolveDirection,
  type AnimatableProperty,
} from '../index.js';

describe('cubicBezier', () => {
  it('is identity for linear', () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) expect(cubicBezier(LINEAR, x)).toBeCloseTo(x, 12);
  });
  it('clamps endpoints', () => {
    const e = { x1: 0.16, y1: 1, x2: 0.3, y2: 1 };
    expect(cubicBezier(e, 0)).toBe(0);
    expect(cubicBezier(e, 1)).toBe(1);
    expect(cubicBezier(e, -1)).toBe(0);
    expect(cubicBezier(e, 2)).toBe(1);
  });
  it('matches CSS ease-in-out at midpoint and is monotonic', () => {
    const easeInOut = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
    expect(cubicBezier(easeInOut, 0.5)).toBeCloseTo(0.5, 6);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = cubicBezier(easeInOut, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('can overshoot above 1 when y control points exceed 1', () => {
    const over = { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 };
    expect(cubicBezier(over, 0.6)).toBeGreaterThan(1);
  });
  it('is deterministic', () => {
    const e = { x1: 0.2, y1: 0.8, x2: 0.4, y2: 1.2 };
    const a = Array.from({ length: 50 }, (_, i) => cubicBezier(e, i / 49));
    const b = Array.from({ length: 50 }, (_, i) => cubicBezier(e, i / 49));
    expect(a).toEqual(b);
  });
});

describe('evaluateProperty', () => {
  const prop: AnimatableProperty = {
    value: 999,
    keyframes: [
      { id: 'b', frame: 60, value: 100, easing: LINEAR },
      { id: 'a', frame: 0, value: 0, easing: LINEAR },
    ],
  };
  it('uses the static value without keyframes', () => {
    expect(evaluateProperty({ value: 7, keyframes: [] }, 123)).toBe(7);
  });
  it('holds before first and after last keyframe', () => {
    expect(evaluateProperty(prop, -10)).toBe(0);
    expect(evaluateProperty(prop, 0)).toBe(0);
    expect(evaluateProperty(prop, 60)).toBe(100);
    expect(evaluateProperty(prop, 299)).toBe(100);
  });
  it('interpolates frame-accurately regardless of keyframe order', () => {
    expect(evaluateProperty(prop, 30)).toBeCloseTo(50, 10);
    expect(evaluateProperty(prop, 15)).toBeCloseTo(25, 10);
    expect(evaluateProperty(prop, 59)).toBeCloseTo((59 / 60) * 100, 10);
  });
  it('applies the easing of the earlier keyframe', () => {
    const eased: AnimatableProperty = {
      value: 0,
      keyframes: [
        { id: 'a', frame: 0, value: 0, easing: { x1: 0.42, y1: 0, x2: 1, y2: 1 } }, // ease-in
        { id: 'b', frame: 100, value: 100, easing: LINEAR },
      ],
    };
    expect(evaluateProperty(eased, 50)).toBeLessThan(50);
    const easeOut: AnimatableProperty = {
      value: 0,
      keyframes: [
        { id: 'a', frame: 0, value: 0, easing: { x1: 0, y1: 0, x2: 0.58, y2: 1 } },
        { id: 'b', frame: 100, value: 100, easing: LINEAR },
      ],
    };
    expect(evaluateProperty(easeOut, 50)).toBeGreaterThan(50);
  });
});

describe('test composition', () => {
  const project = createTestComposition();
  it('validates against the schema', () => {
    expect(() => ProjectSchema.parse(project)).not.toThrow();
    expect(project.width).toBe(1080);
    expect(project.height).toBe(1920);
    expect(project.fps).toBe(60);
    expect(project.durationFrames).toBe(300);
    expect(project.background).toBe('#111111');
  });
  it('animates the headline upward with a reveal and overshoot, then holds', () => {
    const at = (f: number) => evaluateProject(project, f).layers[0]!;
    expect(at(0).opacity).toBe(0);
    expect(at(0).y).toBeGreaterThan(at(30).y);
    expect(at(30).y).toBeGreaterThan(at(60).y);
    expect(at(48).scale).toBeGreaterThan(1);
    expect(at(120).scale).toBe(1);
    expect(at(120).opacity).toBe(1);
    expect(at(120)).toMatchObject({ x: 540, y: 940, scale: 1, rotation: 0, opacity: 1 });
    expect(at(299)).toMatchObject({ x: 540, y: 940, scale: 1, rotation: 0, opacity: 1 });
  });
  it('resolves Hebrew text to RTL automatically', () => {
    expect(resolveDirection('תנועה היא עיצוב', 'auto')).toBe('rtl');
    expect(resolveDirection('MOTION IS\nDESIGN', 'auto')).toBe('ltr');
    expect(resolveDirection('123 תנועה', 'auto')).toBe('rtl');
    expect(resolveDirection('תנועה', 'ltr')).toBe('ltr');
    expect(evaluateProject(project, 100).layers[1]!.direction).toBe('rtl');
  });
  it('is deterministic across evaluations', () => {
    const a = JSON.stringify(Array.from({ length: 300 }, (_, f) => evaluateProject(project, f).layers.map((l) => [l.x, l.y, l.scale, l.rotation, l.opacity])));
    const b = JSON.stringify(Array.from({ length: 300 }, (_, f) => evaluateProject(project, f).layers.map((l) => [l.x, l.y, l.scale, l.rotation, l.opacity])));
    expect(a).toBe(b);
  });
});
