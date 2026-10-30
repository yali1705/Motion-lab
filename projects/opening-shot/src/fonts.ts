import { continueRender, delayRender, staticFile } from 'remotion';

// Fontsource subsets carry Hebrew and Latin (punctuation) in separate files,
// so each family is registered twice with explicit unicode ranges.
const HEBREW = 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F';
const LATIN = 'U+0000-00FF, U+2013-2014, U+2018-201E, U+2026';

const FACES: Array<[family: string, file: string, weight: string, range: string]> = [
  ['Karantina', 'karantina-hebrew-700-normal.woff2', '700', HEBREW],
  ['Karantina', 'karantina-latin-700-normal.woff2', '700', LATIN],
  ['Heebo', 'heebo-hebrew-900-normal.woff2', '900', HEBREW],
  ['Heebo', 'heebo-latin-900-normal.woff2', '900', LATIN],
  ['Heebo', 'heebo-hebrew-800-normal.woff2', '800', HEBREW],
  ['Heebo', 'heebo-latin-800-normal.woff2', '800', LATIN],
];

let loaded = false;

export const loadFonts = () => {
  if (loaded) return;
  loaded = true;
  const handle = delayRender('Loading Hebrew fonts');
  Promise.all(
    FACES.map(async ([family, file, weight, unicodeRange]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, {
        weight,
        unicodeRange,
      });
      await face.load();
      document.fonts.add(face);
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
};
