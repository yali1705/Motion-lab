import { EMBEDDED_FONT_FACES } from './fonts.generated.js';

export const FONT_FAMILY = "'Heebo', 'Helvetica Neue', Arial, sans-serif";

/** CSS @font-face declarations for the embedded fonts (for <style> injection). */
export function fontFaceCss(): string {
  return EMBEDDED_FONT_FACES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};font-display:block;unicode-range:${f.unicodeRange};src:url(${f.src}) format('woff2');}`,
  ).join('\n');
}

let loadPromise: Promise<void> | null = null;

/**
 * Loads the embedded font faces into `document.fonts` and resolves once they
 * are ready. Safe to call multiple times. No-op outside a browser.
 */
export function loadFonts(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    loadPromise = Promise.resolve();
    return loadPromise;
  }
  loadPromise = (async () => {
    const faces = EMBEDDED_FONT_FACES.map(
      (f) => new FontFace(f.family, `url(${f.src}) format('woff2')`, { weight: f.weight, style: f.style, unicodeRange: f.unicodeRange }),
    );
    await Promise.all(
      faces.map(async (face) => {
        await face.load();
        document.fonts.add(face);
      }),
    );
    await document.fonts.ready;
  })();
  return loadPromise;
}
