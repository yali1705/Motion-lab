import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import beats from '../plan/beats.json';
import { loadFonts } from './fonts';
import { C, Pt, ease, jagged, k, pathOf, rng, tornRect } from './lib';

loadFonts();

const E = beats.events;
const W = beats.width;
const H = beats.height;
const FREEZE = E.freeze;

// ---------------------------------------------------------------------------
// Camera: a slow push while the sentence runs, a hard stop on "רגע",
// then a slow creep toward the redacted line. Every layer gets a depth
// factor so the push produces parallax rather than a flat zoom.
// ---------------------------------------------------------------------------
const FOCUS: Pt = [560, 1010];

const cameraScale = (f: number) => {
  if (f < FREEZE) return k(f, [8, FREEZE], [1, 1.055], ease.outCubic);
  return k(f, E.cameraCreep as [number, number], [1.055, 1.115], ease.inSine);
};

const shake = (f: number): Pt => {
  const t = f - FREEZE;
  if (t < 0 || t > 9) return [0, 0];
  const decay = Math.exp(-t / 1.7);
  return [-7 * decay * Math.sin(t * 2.3), 15 * decay * Math.cos(t * 2.6)];
};

const layer = (f: number, depth: number) => {
  const s = 1 + (cameraScale(f) - 1) * depth;
  const [sx, sy] = shake(f);
  const driftX = k(f, [0, 120], [10, -14]) * depth;
  return `translate(${(sx * depth + driftX).toFixed(2)} ${(sy * depth).toFixed(2)}) translate(${FOCUS[0]} ${FOCUS[1]}) scale(${s.toFixed(5)}) translate(${-FOCUS[0]} ${-FOCUS[1]})`;
};

// ---------------------------------------------------------------------------
// Static geometry (seeded, built once)
// ---------------------------------------------------------------------------
const SHEET = { x: 58, y: 470, w: 1090, h: 940, cx: 590, cy: 940 };
const KICKER = { x: 168, y: 326, w: 790, h: 150, cx: 560, cy: 400 };
const LINES = [990, 1060, 1130, 1200];
const BARS: Array<{ line: number; right: number; left: number; ev: number; delay?: number }> = [
  { line: 0, right: 1046, left: 512, ev: 0 },
  { line: 1, right: 884, left: 232, ev: 1 },
  { line: 2, right: 1046, left: 700, ev: 2 },
  { line: 3, right: 1046, left: 640, ev: 3 },
];
const KEY_BAR = BARS[1];
const HERO = { size: 286, baseline: 868, x: 578 };
const SLICES = 6;
const HERO_TOP = HERO.baseline - HERO.size * 0.78;
const HERO_BOTTOM = HERO.baseline + HERO.size * 0.08;

const OPEN_TEAR: Pt[] = jagged([1200, 610], [-120, 1110], 26, 16, 11);
const OUT_TEAR: Pt[] = jagged([1160, 700], [-80, 812], 24, 15, 29);

const halftone = (seed: number) => {
  const r = rng(seed);
  const dots: Array<[number, number, number]> = [];
  for (let row = 0, y = 860; y < H + 40; row++, y += 22) {
    for (let x = row % 2 ? 11 : 0; x < W + 22; x += 22) {
      const v = Math.min(1, Math.max(0, ((y - 860) / 1060) * 0.85 + (1 - x / W) * 0.55 - 0.32));
      const rad = v * 10.5 * (0.92 + r() * 0.16);
      if (rad > 0.8) dots.push([x, y, rad]);
    }
  }
  return dots;
};

const greek = (seed: number) => {
  const r = rng(seed);
  return LINES.map((y, i) => {
    const words: Array<[number, number]> = [];
    let x = 1046;
    const stop = i === 3 ? 420 : 150;
    while (x > stop) {
      const w = 22 + r() * 96;
      if (x - w < stop) break;
      words.push([x - w, w]);
      x -= w + 12;
    }
    return { y, words };
  });
};

// Hand-drawn marker loop around the key redaction: ~1.15 turns, slight spiral and wobble.
const markerLoop = () => {
  const cx = (KEY_BAR.left + KEY_BAR.right) / 2;
  const cy = LINES[KEY_BAR.line] + 2;
  const r = rng(77);
  const pts: Pt[] = [];
  const turns = 1.16;
  const n = 120;
  const tilt = (-3 * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = -2.2 - t * turns * Math.PI * 2;
    const grow = 1 + t * 0.07;
    const wob = 1 + 0.025 * Math.sin(th * 3 + 1.3) + (r() - 0.5) * 0.008;
    const x = Math.cos(th) * 372 * grow * wob;
    const y = Math.sin(th) * 64 * grow * wob;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return pathOf(pts);
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
const Defs: React.FC<{ grainSeed: number }> = ({ grainSeed }) => (
  <defs>
    <filter id="paper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.07" numOctaves="4" seed="4" />
      <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
    </filter>
    <filter id="tooth" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="9" />
      <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="1" seed={grainSeed} />
      <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
    </filter>
    {/* ink: wobbly, bleeding edges for marker, redaction and stamp */}
    <filter id="ink" x="-10%" y="-30%" width="120%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    {/* distress: punches tiny holes into printed type, like worn letterpress */}
    <filter id="distress" x="-5%" y="-10%" width="110%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="4" seed="21" result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -40 0 0 0 29.6" result="holes" />
      <feComposite in="SourceGraphic" in2="holes" operator="in" result="worn" />
      <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="1" seed="5" result="w" />
      <feDisplacementMap in="worn" in2="w" scale="4" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#000" floodOpacity="0.5" />
    </filter>
    <filter id="shadowTight" x="-10%" y="-20%" width="120%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000" floodOpacity="0.45" />
    </filter>
    <radialGradient id="vignette" cx="50%" cy="46%" r="75%">
      <stop offset="55%" stopColor="#000" stopOpacity="0" />
      <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
    </radialGradient>
    <clipPath id="sheetClip">
      <path d={tornRect(SHEET.x, SHEET.y, SHEET.w, SHEET.h, { t: 7, b: 7, l: 6 }, 40, 12)} />
    </clipPath>
    {Array.from({ length: SLICES }, (_, i) => {
      const h = (HERO_BOTTOM - HERO_TOP) / SLICES;
      return (
        <clipPath id={`slice${i}`} key={i}>
          <rect x={-300} y={HERO_TOP + i * h - (i === 0 ? 60 : 0)} width={1700} height={h + (i === 0 || i === SLICES - 1 ? 60 : 0.6)} />
        </clipPath>
      );
    })}
  </defs>
);

const Background: React.FC<{ f: number }> = ({ f }) => {
  const dots = useMemo(() => halftone(5), []);
  return (
    <g transform={layer(f, 0.45)}>
      <rect x={-200} y={-200} width={W + 400} height={H + 400} fill={C.red} />
      <rect x={-200} y={-200} width={W + 400} height={H + 400} filter="url(#paper)" opacity={0.16} style={{ mixBlendMode: 'multiply' }} />
      <g fill={C.redDeep} opacity={0.55}>
        {dots.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
      </g>
      {/* black scrap, top right — deepest collage layer */}
      <g transform="rotate(9 900 120)">
        <path d={tornRect(790, -80, 420, 290, { b: 12, l: 10 }, 61)} fill={C.black} />
      </g>
    </g>
  );
};

const Kicker: React.FC<{ f: number }> = ({ f }) => {
  const [a, b] = E.kickerSlide as [number, number];
  const x = k(f, [a, b], [1100, 0], ease.expoOut);
  const rot = k(f, [a, b + 3], [-15, -6], ease.outCubic);
  const word2 = k(f, [E.kickerWord2, E.kickerWord2 + 2], [0, 1]);
  if (f < a) return null;
  return (
    <g transform={layer(f, 1.25)}>
      <g transform={`translate(${x.toFixed(1)} 0) rotate(${rot.toFixed(2)} ${KICKER.cx} ${KICKER.cy})`}>
        <path d={tornRect(KICKER.x, KICKER.y, KICKER.w, KICKER.h, { t: 2.5, b: 2.5, l: 11, r: 11 }, 12, 9)} fill={C.black} filter="url(#shadowTight)" />
        <text
          x={KICKER.x + KICKER.w - 52}
          y={KICKER.cy + 40}
          direction="rtl"
          textAnchor="start"
          fontFamily="Heebo"
          fontWeight={900}
          fontSize={114}
          fill={C.cream}
          letterSpacing={-1}
        >
          <tspan>תחשבו </tspan>
          <tspan fillOpacity={word2}>על</tspan>
        </text>
      </g>
    </g>
  );
};

const Hero: React.FC<{ f: number }> = ({ f }) => {
  const [a] = E.heroSlices as [number, number];
  const mis = k(f, [a, a + 22], [20, 5], ease.outCubic);
  const text = (fill: string) => (
    <text x={HERO.x} y={HERO.baseline} textAnchor="middle" direction="rtl" fontFamily="Karantina" fontWeight={700} fontSize={HERO.size} fill={fill} letterSpacing={0}>
      הסיטואציה
    </text>
  );
  return (
    <g filter="url(#distress)">
      {Array.from({ length: SLICES }, (_, i) => {
        const start = a + i * 1.5;
        const dir = i % 2 === 0 ? 1 : -1;
        const dx = k(f, [start, start + 8], [dir * 1250, 0], ease.expoOut);
        return (
          <g key={i} clipPath={`url(#slice${i})`}>
            <g transform={`translate(${dx.toFixed(1)} 0)`}>
              <g transform={`translate(${-mis} ${mis * 0.45})`} style={{ mixBlendMode: 'multiply' }} opacity={0.95}>
                {text(C.red)}
              </g>
              {text(C.black)}
            </g>
          </g>
        );
      })}
    </g>
  );
};

const Redactions: React.FC<{ f: number }> = ({ f }) => {
  const g = useMemo(() => greek(14), []);
  return (
    <g>
      {g.map(({ y, words }) =>
        words.map(([x, w], j) => <rect key={`${y}-${j}`} x={x} y={y - 6} width={w} height={12} fill={C.black} opacity={0.26} />),
      )}
      <g filter="url(#ink)">
        {BARS.map((b, i) => {
          const [s, e] = E.redactions[b.ev] as [number, number];
          const p = k(f, [s, e], [0, 1], ease.marker);
          if (p <= 0) return null;
          const y = LINES[b.line];
          const w = (b.right - b.left) * p;
          return <path key={i} d={tornRect(b.right - w, y - 24, w, 48, { t: 2, b: 2 }, 90 + i, 10)} fill={C.black} />;
        })}
      </g>
    </g>
  );
};

const Stamp: React.FC<{ f: number }> = ({ f }) => {
  const [a, b] = E.stamp as [number, number];
  if (f < a) return null;
  const s = k(f, [a, b], [1.4, 1], ease.quartOut);
  const o = k(f, [a, a + 1.5], [0.25, 0.94]);
  const rot = k(f, [a, b], [-2, -8], ease.quartOut);
  const cx = 318;
  const cy = 1214;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s * 1.12})`} opacity={o} style={{ mixBlendMode: 'multiply' }} filter="url(#ink)">
      <g filter="url(#distress)">
        <rect x={-150} y={-66} width={300} height={132} rx={10} fill="none" stroke={C.red} strokeWidth={8} />
        <rect x={-136} y={-52} width={272} height={104} rx={5} fill="none" stroke={C.red} strokeWidth={3} />
        <text x={0} y={31} textAnchor="middle" direction="rtl" fontFamily="Heebo" fontWeight={900} fontSize={88} fill={C.red}>
          הזאת
        </text>
      </g>
    </g>
  );
};

const Marker: React.FC<{ f: number }> = ({ f }) => {
  const d = useMemo(markerLoop, []);
  const [a, b] = E.markerCircle as [number, number];
  const p = k(f, [a, b], [0, 1], ease.marker);
  if (p <= 0) return null;
  return (
    <g filter="url(#ink)" style={{ mixBlendMode: 'multiply' }}>
      <path d={d} pathLength={1} strokeDasharray={`${p} 2`} fill="none" stroke={C.red} strokeWidth={11} strokeLinecap="round" opacity={0.95} />
    </g>
  );
};

const PrintMarks: React.FC = () => (
  <g opacity={0.55} stroke={C.black} strokeWidth={2} fill="none">
    <circle cx={1040} cy={530} r={13} />
    <path d="M1040,505 V555 M1015,530 H1065" />
    <g transform="translate(110 1336)" strokeWidth={0}>
      {[C.red, C.black, C.gray].map((c, i) => (
        <rect key={c} x={i * 30} y={0} width={26} height={26} fill={c} />
      ))}
      <rect x={90} y={0} width={26} height={26} fill="none" stroke={C.black} strokeWidth={2} />
    </g>
  </g>
);

const Sheet: React.FC<{ f: number }> = ({ f }) => {
  const [a, b] = E.sheetSlide as [number, number];
  if (f < a) return null;
  const y = k(f, [a, b], [1500, 0], ease.expoOut);
  const rot = k(f, [a, b + 2], [-10, -2.5], ease.outCubic);
  const sheetPath = tornRect(SHEET.x, SHEET.y, SHEET.w, SHEET.h, { t: 7, b: 7, l: 6 }, 40, 12);
  return (
    <g transform={layer(f, 1)}>
      <g transform={`translate(0 ${y.toFixed(1)}) rotate(${rot.toFixed(2)} ${SHEET.cx} ${SHEET.cy})`}>
        <path d={sheetPath} fill={C.cream} filter="url(#shadow)" />
        <g clipPath="url(#sheetClip)">
          <rect x={SHEET.x} y={SHEET.y} width={SHEET.w} height={SHEET.h} filter="url(#paper)" opacity={0.22} style={{ mixBlendMode: 'multiply' }} />
          <rect x={SHEET.x} y={SHEET.y} width={SHEET.w} height={SHEET.h} filter="url(#tooth)" opacity={0.1} style={{ mixBlendMode: 'multiply' }} />
          <PrintMarks />
          <line x1={130} x2={1046} y1={922} y2={922} stroke={C.black} strokeWidth={3} />
          <Hero f={f} />
          <Redactions f={f} />
          <Stamp f={f} />
          <Marker f={f} />
        </g>
        {/* translucent tape holding the sheet's top-right corner */}
        <g transform="rotate(38 1010 470)" opacity={0.78}>
          <path d={tornRect(930, 440, 190, 62, { l: 6, r: 6 }, 33, 7)} fill="#E9E1CF" />
        </g>
      </g>
    </g>
  );
};

const FreezePanel: React.FC<{ f: number }> = ({ f }) => {
  const [a, b] = E.panelSlam as [number, number];
  if (f < a) return null;
  const y = k(f, [a, b], [720, 0], ease.slam);
  return (
    <g transform={layer(f, 0.8)}>
      <g transform={`translate(0 ${y.toFixed(1)}) rotate(2.5 540 1340)`}>
        <path d={tornRect(-120, 1338, 1320, 760, { t: 15 }, 71, 16)} fill={C.black} filter="url(#shadow)" />
        <rect x={-120} y={1338} width={1320} height={760} filter="url(#tooth)" opacity={0.07} style={{ mixBlendMode: 'screen' }} />
        {f >= E.rega && (
          <text x={944} y={1664} direction="rtl" textAnchor="start" fontFamily="Karantina" fontWeight={700} fontSize={312} fill={C.red} filter="url(#distress)">
            רגע.
          </text>
        )}
      </g>
    </g>
  );
};

// Opening: the frame starts as a black sheet that rips open along a diagonal.
const TearOpen: React.FC<{ f: number }> = ({ f }) => {
  const [o0, o1] = E.tearOpen as [number, number];
  if (f >= o1) return null;
  const [c0, c1] = E.crackDraw as [number, number];
  const crack = k(f, [c0, c1], [0, 1], ease.outCubic);
  const p = k(f, [o0, o1], [0, 1], ease.rip);
  const top = pathOf([[-300, -300], [1400, -300], [1400, OPEN_TEAR[0][1]], ...OPEN_TEAR, [-300, OPEN_TEAR[OPEN_TEAR.length - 1][1]]], true);
  const bottom = pathOf([[-300, 2300], [1400, 2300], [1400, OPEN_TEAR[0][1]], ...OPEN_TEAR, [-300, OPEN_TEAR[OPEN_TEAR.length - 1][1]]], true);
  const edge = pathOf(OPEN_TEAR);
  return (
    <g>
      <g transform={`translate(${180 * p} ${-1500 * p}) rotate(${-9 * p} 540 860)`}>
        <path d={top} fill={C.black} />
        <path d={edge} transform="translate(0 4)" fill="none" stroke={C.cream} strokeWidth={9 * Math.min(1, p * 6)} filter="url(#ink)" />
      </g>
      <g transform={`translate(${-200 * p} ${1600 * p}) rotate(${7 * p} 540 860)`}>
        <path d={bottom} fill={C.black} />
        <path d={edge} transform="translate(0 -4)" fill="none" stroke={C.cream} strokeWidth={7 * Math.min(1, p * 6)} filter="url(#ink)" />
      </g>
      {p === 0 && <path d={edge} pathLength={1} strokeDasharray={`${crack} 2`} fill="none" stroke={C.cream} strokeWidth={3} opacity={0.85} />}
    </g>
  );
};

// ---------------------------------------------------------------------------
export const OpeningShot: React.FC = () => {
  const f = useCurrentFrame();
  // Grain re-seeds every 2 frames while time runs; on "רגע" it freezes with the image.
  const grainSeed = f < FREEZE ? Math.floor(f / 2) + 1 : 101;

  const [t0] = E.tearOutCrack as [number, number];
  const [s0, s1] = E.tearOutOpen as [number, number];
  const crack = k(f, E.tearOutCrack as [number, number], [0, 1], ease.inOutSine);
  const gap = k(f, [s0, s1 - 1], [0, 340], ease.inCubic);
  const outEdge = pathOf(OUT_TEAR);
  const outTop = pathOf([[-300, -300], [1400, -300], [1400, OUT_TEAR[0][1]], ...OUT_TEAR, [-300, OUT_TEAR[OUT_TEAR.length - 1][1]]], true);
  const outBottom = pathOf([[-300, 2300], [1400, 2300], [1400, OUT_TEAR[0][1]], ...OUT_TEAR, [-300, OUT_TEAR[OUT_TEAR.length - 1][1]]], true);

  const scene = (
    <g>
      <Background f={f} />
      <Sheet f={f} />
      <Kicker f={f} />
      <FreezePanel f={f} />
      <TearOpen f={f} />
    </g>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0A0A' }}>
      {/* Narration + sound design, built by scripts/build_audio.py from plan/beats.json */}
      <Audio src={staticFile('audio/mix.wav')} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs grainSeed={grainSeed} />
        <defs>
          <clipPath id="outTop">
            <path d={outTop} />
          </clipPath>
          <clipPath id="outBottom">
            <path d={outBottom} />
          </clipPath>
        </defs>
        {gap <= 0 ? (
          scene
        ) : (
          <>
            <g transform={`translate(${gap * 0.12} ${-gap / 2})`}>
              <g clipPath="url(#outTop)">{scene}</g>
              <path d={outEdge} fill="none" stroke={C.cream} strokeWidth={8} filter="url(#ink)" transform="translate(0 3)" />
            </g>
            <g transform={`translate(${-gap * 0.12} ${gap / 2})`}>
              <g clipPath="url(#outBottom)">{scene}</g>
              <path d={outEdge} fill="none" stroke={C.cream} strokeWidth={6} filter="url(#ink)" transform="translate(0 -3)" />
            </g>
          </>
        )}
        {f >= t0 && gap <= 0 && (
          <path d={outEdge} pathLength={1} strokeDasharray={`${crack} 2`} fill="none" stroke={C.cream} strokeWidth={3.5} opacity={0.9} />
        )}
        <rect width={W} height={H} filter="url(#grain)" opacity={0.3} style={{ mixBlendMode: 'soft-light' }} />
        <rect width={W} height={H} fill="url(#vignette)" />
      </svg>
    </AbsoluteFill>
  );
};
