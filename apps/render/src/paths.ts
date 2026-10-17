import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** apps/render */
export const APP_ROOT = resolve(here, '..');
/** Where persisted jobs and MP4s live. */
export const DATA_DIR = process.env.MOTION_LAB_DATA_DIR ?? join(APP_ROOT, 'data');
export const JOBS_DIR = join(DATA_DIR, 'jobs');
/** Where the Remotion webpack bundle is written. */
export const BUNDLE_DIR = process.env.MOTION_LAB_BUNDLE_DIR ?? join(APP_ROOT, '.bundle');
/** Entry point for the Remotion bundle (TS in dev, compiled JS in prod). */
export const REMOTION_ENTRY = existsSync(join(here, 'remotion', 'index.ts'))
  ? join(here, 'remotion', 'index.ts')
  : join(here, 'remotion', 'index.js');
/** Built editor (apps/web/dist) served statically when present. */
export const WEB_DIST = process.env.MOTION_LAB_WEB_DIST ?? resolve(APP_ROOT, '..', 'web', 'dist');

const BROWSER_CANDIDATES = [
  process.env.MOTION_LAB_BROWSER,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // Remotion needs the "old headless" mode, i.e. chrome-headless-shell.
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

/** A chrome-headless-shell executable for Remotion, or null to let Remotion download its own. */
export function findBrowser(): string | null {
  for (const c of BROWSER_CANDIDATES) if (c && existsSync(c)) return c;
  try {
    // Playwright-managed browsers (any version)
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
    for (const d of readdirSync(root)) {
      if (d.startsWith('chromium_headless_shell-')) {
        const p = join(root, d, 'chrome-linux', 'headless_shell');
        if (existsSync(p)) return p;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
