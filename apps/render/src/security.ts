import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Security for the render API.
 *
 * - Bearer-token auth (MOTION_LAB_RENDER_TOKEN). The token is only ever read
 *   from the server environment; the editor asks the user for it once and
 *   keeps it in localStorage on their device. It is never embedded in the
 *   client bundle.
 * - Per-job download tokens so <a download> links work without a header and
 *   the API key never appears in a URL.
 * - In-memory per-IP rate limiting (sliding window) — fine for a single
 *   process, which is what this service is.
 * - Conservative response headers.
 */

export const RENDER_TOKEN = process.env.MOTION_LAB_RENDER_TOKEN ?? '';
export const AUTH_REQUIRED = RENDER_TOKEN.length > 0;

export function assertAuthConfigured() {
  if (!AUTH_REQUIRED) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[security] MOTION_LAB_RENDER_TOKEN is not set. Refusing to start in production without API authentication.');
      process.exit(1);
    }
    console.warn('[security] MOTION_LAB_RENDER_TOKEN is not set — the render API is OPEN (development only).');
  } else if (RENDER_TOKEN.length < 16) {
    console.error('[security] MOTION_LAB_RENDER_TOKEN must be at least 16 characters.');
    process.exit(1);
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function newDownloadToken(): string {
  return randomBytes(24).toString('base64url');
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

export function isAuthorized(req: Request): boolean {
  if (!AUTH_REQUIRED) return true;
  const t = bearer(req);
  return t !== null && safeEqual(t, RENDER_TOKEN);
}

/** Require the API key (unless auth is disabled in development). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthorized(req)) return next();
  res.setHeader('WWW-Authenticate', 'Bearer realm="motion-lab"');
  return res.status(401).json({ error: 'Unauthorized: a valid render access key is required' });
}

interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [k, b] of buckets) {
    b.hits = b.hits.filter((t) => t > cutoff);
    if (b.hits.length === 0) buckets.delete(k);
  }
}, 60 * 1000).unref();

/** Sliding-window limiter: at most `max` requests per `windowMs` per client IP (per `name`). */
export function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) {
      b = { hits: [] };
      buckets.set(key, b);
    }
    b.hits = b.hits.filter((t) => t > now - windowMs);
    if (b.hits.length >= max) {
      const retry = Math.ceil((b.hits[0]! + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retry)));
      return res.status(429).json({ error: `Too many requests — try again in ${Math.max(1, retry)}s` });
    }
    b.hits.push(now);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - b.hits.length));
    return next();
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

// ---- resource limits -------------------------------------------------------
const num = (name: string, def: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
};
export const LIMITS = {
  /** Max frames per render (default 30 s at 60 fps). */
  maxFrames: num('MOTION_LAB_MAX_FRAMES', 1800),
  /** Max width*height per render (default 1080×1920). */
  maxPixels: num('MOTION_LAB_MAX_PIXELS', 1080 * 1920),
  maxFps: num('MOTION_LAB_MAX_FPS', 60),
  maxLayers: num('MOTION_LAB_MAX_LAYERS', 20),
  maxTextLength: num('MOTION_LAB_MAX_TEXT', 2000),
  maxKeyframesPerProperty: num('MOTION_LAB_MAX_KEYFRAMES', 500),
  /** Max jobs waiting or rendering before new submissions get 429. */
  maxPending: num('MOTION_LAB_MAX_PENDING', 4),
  /** Hard per-job timeout. */
  jobTimeoutMs: num('MOTION_LAB_JOB_TIMEOUT_MS', 10 * 60 * 1000),
  /** Delete finished jobs and their MP4s after this many days. */
  retentionDays: num('MOTION_LAB_RETENTION_DAYS', 7),
};

/** Validate a (schema-valid) project against the server's resource limits. Returns an error message or null. */
export function checkProjectLimits(p: { width: number; height: number; fps: number; durationFrames: number; layers: Array<{ text: string; transform: Record<string, { keyframes: unknown[] }> }> }): string | null {
  if (p.durationFrames > LIMITS.maxFrames) return `durationFrames ${p.durationFrames} exceeds limit ${LIMITS.maxFrames}`;
  if (p.width * p.height > LIMITS.maxPixels) return `${p.width}×${p.height} exceeds pixel limit ${LIMITS.maxPixels}`;
  if (p.fps > LIMITS.maxFps) return `fps ${p.fps} exceeds limit ${LIMITS.maxFps}`;
  if (p.layers.length > LIMITS.maxLayers) return `${p.layers.length} layers exceeds limit ${LIMITS.maxLayers}`;
  for (const l of p.layers) {
    if (l.text.length > LIMITS.maxTextLength) return `layer text longer than ${LIMITS.maxTextLength} characters`;
    for (const prop of Object.values(l.transform)) if (prop.keyframes.length > LIMITS.maxKeyframesPerProperty) return `more than ${LIMITS.maxKeyframesPerProperty} keyframes on one property`;
  }
  return null;
}
