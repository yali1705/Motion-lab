import { bundle } from '@remotion/bundler';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE_DIR, REMOTION_ENTRY } from './paths.js';

/** Builds the Remotion webpack bundle (the "site") into BUNDLE_DIR. */
export async function buildBundle(force = false): Promise<string> {
  const marker = join(BUNDLE_DIR, 'index.html');
  if (!force && existsSync(marker)) return BUNDLE_DIR;
  if (existsSync(BUNDLE_DIR)) rmSync(BUNDLE_DIR, { recursive: true, force: true });
  mkdirSync(BUNDLE_DIR, { recursive: true });
  const t0 = Date.now();
  const out = await bundle({
    entryPoint: REMOTION_ENTRY,
    outDir: BUNDLE_DIR,
    onProgress: (p) => {
      if (p % 25 === 0) console.log(`[bundle] ${p}%`);
    },
  });
  console.log(`[bundle] ready at ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return out;
}

// CLI usage: node dist/bundle.js
const invokedDirectly = process.argv[1] && /bundle\.(js|ts)$/.test(process.argv[1]);
if (invokedDirectly) {
  buildBundle(true).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
