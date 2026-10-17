import { z } from 'zod';

/**
 * Cubic Bézier easing. (x1, y1) and (x2, y2) are the two control points of
 * the curve from (0,0) to (1,1). x is clamped to [0,1] (time must be
 * monotonic); y may overshoot outside [0,1] (e.g. for a bounce/overshoot).
 */
export const EasingSchema = z.object({
  x1: z.number().min(0).max(1),
  y1: z.number().min(-2).max(3),
  x2: z.number().min(0).max(1),
  y2: z.number().min(-2).max(3),
});
export type Easing = z.infer<typeof EasingSchema>;

export const LINEAR: Easing = { x1: 0, y1: 0, x2: 1, y2: 1 };

/**
 * A keyframe on a numeric property. `frame` is an absolute, integer project
 * frame. `easing` describes the curve from this keyframe to the NEXT one.
 */
export const KeyframeSchema = z.object({
  id: z.string().min(1),
  frame: z.number().int().min(0),
  value: z.number(),
  easing: EasingSchema,
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

/**
 * A numeric property that may be animated. When `keyframes` is empty the
 * static `value` is used for every frame.
 */
export const AnimatablePropertySchema = z.object({
  value: z.number(),
  keyframes: z.array(KeyframeSchema),
});
export type AnimatableProperty = z.infer<typeof AnimatablePropertySchema>;

export const TransformSchema = z.object({
  x: AnimatablePropertySchema,
  y: AnimatablePropertySchema,
  scale: AnimatablePropertySchema,
  rotation: AnimatablePropertySchema,
  opacity: AnimatablePropertySchema,
});
export type Transform = z.infer<typeof TransformSchema>;
export type TransformProperty = keyof Transform;
export const TRANSFORM_PROPERTIES: TransformProperty[] = ['x', 'y', 'scale', 'rotation', 'opacity'];

export const TextDirectionSchema = z.enum(['auto', 'ltr', 'rtl']);
export type TextDirection = z.infer<typeof TextDirectionSchema>;

export const TextAlignSchema = z.enum(['left', 'center', 'right']);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const TextLayerSchema = z.object({
  id: z.string().min(1),
  type: z.literal('text'),
  name: z.string(),
  visible: z.boolean(),
  /** First frame (inclusive) on which the layer is rendered. */
  inFrame: z.number().int().min(0),
  /** Last frame (exclusive) on which the layer is rendered. */
  outFrame: z.number().int().min(1),
  text: z.string(),
  fontSize: z.number().min(1).max(1000),
  fontWeight: z.number().int().min(100).max(900),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  letterSpacing: z.number().min(-50).max(200),
  lineHeight: z.number().min(0.5).max(4),
  textAlign: TextAlignSchema,
  direction: TextDirectionSchema,
  /** Width of the text box in composition pixels (text wraps inside it). */
  width: z.number().min(10).max(4000),
  transform: TransformSchema,
});
export type TextLayer = z.infer<typeof TextLayerSchema>;

export const LayerSchema = TextLayerSchema;
export type Layer = z.infer<typeof LayerSchema>;

export const ProjectSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string(),
  width: z.number().int().min(16).max(8192),
  height: z.number().int().min(16).max(8192),
  fps: z.number().int().min(1).max(120),
  durationFrames: z.number().int().min(1).max(60 * 60 * 10),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  layers: z.array(LayerSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export function parseProject(input: unknown): Project {
  return ProjectSchema.parse(input);
}

export function safeParseProject(input: unknown): { success: true; data: Project } | { success: false; error: string } {
  const r = ProjectSchema.safeParse(input);
  if (r.success) return { success: true, data: r.data };
  return { success: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
