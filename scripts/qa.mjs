#!/usr/bin/env node
/**
 * Motion Lab end-to-end QA.
 *
 * Prerequisites: the render service is running and serving the built editor
 * (default http://localhost:3001 — override with MOTION_LAB_URL), ffmpeg and
 * ffprobe are on PATH, and a Playwright Chromium is available.
 *
 *   node scripts/qa.mjs            # full run (render + parity + UI)
 *   node scripts/qa.mjs --skip-ui  # render + parity only
 *
 * Writes qa/output/results.{json,md} plus screenshots and extracted frames.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'qa', 'output');
const BASE = (process.env.MOTION_LAB_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const SKIP_UI = process.argv.includes('--skip-ui');
const TOKEN = process.env.MOTION_LAB_RENDER_TOKEN ?? '';
const AUTH = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
const PARITY_FRAMES = [0, 20, 40, 60, 150, 299];
// Tolerances (documented in qa/QA_REPORT.md)
const SSIM_MIN_VS_MP4 = 0.97; // preview screenshot vs H.264 frame (lossy)
const PSNR_MIN_VS_MP4 = 32; // dB
const SSIM_MIN_VS_STILL = 0.99; // preview screenshot vs lossless export still

mkdirSync(OUT, { recursive: true });
const results = [];
const record = (id, name, pass, detail = '') => {
  results.push({ id, name, status: pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${id}  ${name}${detail ? `  — ${detail}` : ''}`);
};
async function step(id, name, fn) {
  try {
    const detail = await fn();
    record(id, name, true, typeof detail === 'string' ? detail : '');
    return true;
  } catch (e) {
    record(id, name, false, (e && e.message) || String(e));
    return false;
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (p, init = {}) => {
  const r = await fetch(BASE + p, { ...init, headers: { ...AUTH, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text()}`);
  return r.json();
};

function findBrowser() {
  const cands = [process.env.MOTION_LAB_QA_BROWSER, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
  for (const c of cands) if (c && existsSync(c)) return c;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  try {
    for (const d of readdirSync(root)) {
      if (d.startsWith('chromium-')) {
        const p = join(root, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}

function ffmpegMetric(a, b, filter) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-lavfi', filter, '-f', 'null', '-'], { encoding: 'utf8' });
  return r.stderr;
}
function ssim(a, b) {
  const m = ffmpegMetric(a, b, 'ssim').match(/All:([\d.]+)/);
  return m ? Number(m[1]) : NaN;
}
function psnr(a, b) {
  const m = ffmpegMetric(a, b, 'psnr').match(/average:([\d.]+|inf)/);
  return m ? (m[1] === 'inf' ? Infinity : Number(m[1])) : NaN;
}

// ---------------------------------------------------------------------------
// 0. Engine unit tests
// ---------------------------------------------------------------------------
await step('ENG-1', 'Engine unit tests (vitest)', () => {
  const r = spawnSync('npm', ['test', '-w', '@motion-lab/engine', '--silent'], { cwd: ROOT, encoding: 'utf8' });
  assert(r.status === 0, `vitest exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  const m = r.stdout.match(/Tests\s+(\d+) passed/);
  return m ? `${m[1]} tests passed` : 'passed';
});

// ---------------------------------------------------------------------------
// 1. Render service + real MP4
// ---------------------------------------------------------------------------
let project = null;
let job = null;
let mp4 = null;
await step('SRV-1', 'Render service health', async () => {
  const h = await getJson('/api/health');
  assert(h.ok, 'health not ok');
  if (h.authRequired) assert(TOKEN, 'server requires a render key but MOTION_LAB_RENDER_TOKEN is not set for the QA run');
  return `authRequired=${h.authRequired} browser=${h.browserExecutable ?? 'default'} concurrency=${h.concurrency}`;
});
await step('SRV-2', 'Test composition validates (Zod)', async () => {
  project = await getJson('/api/test-composition');
  assert(project.width === 1080 && project.height === 1920 && project.fps === 60 && project.durationFrames === 300, 'unexpected composition metadata');
  assert(project.background === '#111111', 'background');
  assert(project.layers.some((l) => l.text.replace('\n', ' ') === 'MOTION IS DESIGN'), 'headline text');
  const bad = await fetch(BASE + '/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ project: { ...project, fps: 'sixty' } }) });
  assert(bad.status === 400, `invalid project should be rejected, got ${bad.status}`);
  const huge = await fetch(BASE + '/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ project: { ...project, durationFrames: 30000 } }) });
  assert(huge.status === 422, `over-limit project should be rejected with 422, got ${huge.status}`);
  return `${project.layers.length} layers; invalid project → 400; over-limit project → 422`;
});
await step('SEC-1', 'Render API requires the access key; download works via per-job token only', async () => {
  const h = await getJson('/api/health');
  if (!h.authRequired) return 'auth disabled on this server (development mode) — skipped';
  const noKey = await fetch(BASE + '/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
  assert(noKey.status === 401, `no key should be 401, got ${noKey.status}`);
  const badKey = await fetch(BASE + '/api/jobs', { headers: { Authorization: 'Bearer definitely-not-the-key' } });
  assert(badKey.status === 401, `bad key should be 401, got ${badKey.status}`);
  const h2 = await fetch(BASE + '/api/health');
  assert(h2.headers.get('x-content-type-options') === 'nosniff', 'security headers missing');
  return 'missing key → 401, wrong key → 401, security headers present';
});
await step('REN-1', 'Render job completes (persistent job with progress)', async () => {
  job = await getJson('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
  assert(job.status === 'queued', `status ${job.status}`);
  const t0 = Date.now();
  let sawProgress = false;
  while (Date.now() - t0 < 10 * 60 * 1000) {
    await sleep(1500);
    job = await getJson(`/api/jobs/${job.id}`);
    if (job.status === 'rendering' && job.progress > 0 && job.progress < 1) sawProgress = true;
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') break;
  }
  assert(job.status === 'done', `job ended ${job.status}: ${job.error}`);
  assert(sawProgress, 'never observed intermediate progress');
  return `${job.id} in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${job.outputBytes} bytes, intermediate progress observed`;
});
await step('REN-2', 'MP4 downloads over HTTP', async () => {
  assert(job.downloadToken, 'job has no download token');
  const noTok = await fetch(`${BASE}/api/jobs/${job.id}/download`);
  if (TOKEN) assert(noTok.status === 401, `download without token should be 401, got ${noTok.status}`);
  const r = await fetch(`${BASE}/api/jobs/${job.id}/download?t=${encodeURIComponent(job.downloadToken)}`);
  assert(r.ok, `download ${r.status}`);
  assert((r.headers.get('content-type') || '').includes('video/mp4'), 'content-type');
  const buf = Buffer.from(await r.arrayBuffer());
  mp4 = join(OUT, 'export.mp4');
  writeFileSync(mp4, buf);
  assert(buf.length === job.outputBytes, 'size mismatch');
  return `${buf.length} bytes -> qa/output/export.mp4`;
});
await step('REN-3', 'MP4 is H.264 1080×1920 @ 60 fps, 300 frames, 5.000 s', () => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt,duration', '-of', 'json', mp4], { encoding: 'utf8' });
  const s = JSON.parse(out).streams[0];
  assert(s.codec_name === 'h264', `codec ${s.codec_name}`);
  assert(s.width === 1080 && s.height === 1920, `size ${s.width}x${s.height}`);
  assert(s.r_frame_rate === '60/1', `fps ${s.r_frame_rate}`);
  assert(Number(s.nb_read_frames) === 300, `frames ${s.nb_read_frames}`);
  assert(Math.abs(Number(s.duration) - 5) < 0.02, `duration ${s.duration}`);
  assert(s.pix_fmt === 'yuv420p', `pix_fmt ${s.pix_fmt}`);
  return `${s.codec_name} ${s.width}x${s.height} ${s.r_frame_rate} ${s.nb_read_frames} frames ${s.pix_fmt}`;
});
await step('REN-4', 'Exported motion matches the engine (frame 0 blank, headline rises, final hold)', () => {
  const lum = (f) => {
    const png = join(OUT, `mp4-${f}.png`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `select=eq(n\\,${f})`, '-vframes', '1', png]);
    const o = spawnSync('ffmpeg', ['-i', png, '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = (o.stdout + o.stderr).match(/YAVG=([\d.]+)/);
    return Number(m[1]);
  };
  const l0 = lum(0), l40 = lum(40), l150 = lum(150), l299 = lum(299);
  // Limited-range luma of the #111111 background is ~31; text raises the average.
  assert(l0 < 33, `frame 0 should be background only (opacity 0), YAVG=${l0}`);
  assert(l40 > l0 + 1, `text should be visible by frame 40 (YAVG ${l40} vs ${l0})`);
  assert(Math.abs(l150 - l299) < 0.2, `final hold should be static (YAVG ${l150} vs ${l299})`);
  // vertical centre of mass of bright pixels should move up between frame 20 and 60
  const centroid = (f) => {
    const png = join(OUT, `mp4-${f}.png`);
    if (!existsSync(png)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `select=eq(n\\,${f})`, '-vframes', '1', png]);
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', 'scale=108:192,format=gray', '-f', 'rawvideo', '-']);
    let sum = 0, n = 0;
    for (let i = 0; i < raw.length; i++) if (raw[i] > 80) { sum += Math.floor(i / 108); n++; }
    return n ? sum / n : NaN;
  };
  const c20 = centroid(20), c60 = centroid(60);
  assert(c20 > c60, `headline should move up (centroid row ${c20.toFixed(1)} -> ${c60.toFixed(1)})`);
  return `YAVG f0=${l0.toFixed(2)} f40=${l40.toFixed(2)} f150=${l150.toFixed(2)} f299=${l299.toFixed(2)}; centroid row f20=${c20.toFixed(1)} f60=${c60.toFixed(1)}`;
});

// ---------------------------------------------------------------------------
// 2. Preview ↔ export parity
// ---------------------------------------------------------------------------
const executablePath = findBrowser();
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] });

await step('PAR-1', 'Preview frames match exported frames (SSIM/PSNR within tolerance)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const lines = [];
  let worstSsimMp4 = 1, worstPsnrMp4 = Infinity, worstSsimStill = 1;
  for (const f of PARITY_FRAMES) {
    await page.goto(`${BASE}/?qa=frame&f=${f}`);
    await page.waitForFunction(() => window.__motionLabReady === true);
    await page.evaluate(() => document.fonts.ready);
    const shot = join(OUT, `preview-${f}.png`);
    await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    const mp4Frame = join(OUT, `mp4-${f}.png`);
    if (!existsSync(mp4Frame)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `select=eq(n\\,${f})`, '-vframes', '1', mp4Frame]);
    const stillRes = await fetch(`${BASE}/api/still`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ project, frame: f }) });
    assert(stillRes.ok, `still ${stillRes.status}`);
    const still = join(OUT, `still-${f}.png`);
    writeFileSync(still, Buffer.from(await stillRes.arrayBuffer()));
    const s1 = ssim(shot, mp4Frame), p1 = psnr(shot, mp4Frame), s2 = ssim(shot, still);
    worstSsimMp4 = Math.min(worstSsimMp4, s1);
    worstPsnrMp4 = Math.min(worstPsnrMp4, p1);
    worstSsimStill = Math.min(worstSsimStill, s2);
    lines.push(`f${f}: ssim(preview,mp4)=${s1.toFixed(4)} psnr=${p1 === Infinity ? 'inf' : p1.toFixed(1)}dB ssim(preview,still)=${s2.toFixed(4)}`);
  }
  await ctx.close();
  console.log(lines.map((l) => '      ' + l).join('\n'));
  assert(worstSsimMp4 >= SSIM_MIN_VS_MP4, `worst SSIM vs MP4 ${worstSsimMp4.toFixed(4)} < ${SSIM_MIN_VS_MP4}`);
  assert(worstPsnrMp4 >= PSNR_MIN_VS_MP4, `worst PSNR vs MP4 ${worstPsnrMp4.toFixed(1)} < ${PSNR_MIN_VS_MP4}`);
  assert(worstSsimStill >= SSIM_MIN_VS_STILL, `worst SSIM vs still ${worstSsimStill.toFixed(4)} < ${SSIM_MIN_VS_STILL}`);
  return `worst SSIM vs MP4 ${worstSsimMp4.toFixed(4)} (≥${SSIM_MIN_VS_MP4}), worst PSNR ${worstPsnrMp4.toFixed(1)} dB (≥${PSNR_MIN_VS_MP4}), worst SSIM vs lossless still ${worstSsimStill.toFixed(4)} (≥${SSIM_MIN_VS_STILL})`;
});

// ---------------------------------------------------------------------------
// 3. Mobile editor UI (iPhone emulation, touch)
// ---------------------------------------------------------------------------
if (!SKIP_UI) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const touchDrag = async (x0, y0, x1, y1, steps = 12) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const tap = async (sel) => page.locator(sel).first().tap();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('motion-lab:project:v1')));
  const frameNow = async () => Number(await page.locator('[data-testid="frame"]').textContent());
  const layerEl = (id) => page.locator(`[data-testid="canvas-stage"] [data-layer-id="${id}"]`);
  const rulerBox = () => page.locator('[data-testid="timeline-ruler"]').boundingBox();
  const scrubTo = async (f) => {
    const r = await rulerBox();
    const x = r.x + (f / 300) * r.width;
    await touchDrag(x, r.y + r.height / 2, x, r.y + r.height / 2, 1);
  };
  const shot = (name) => page.screenshot({ path: join(OUT, `ui-${name}.png`) });

  await step('UI-0', 'Export sheet asks for the render access key and accepts it (key stays on device)', async () => {
    await page.goto(BASE + '/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('[data-testid="canvas-stage"] [data-layer-id="layer_headline"]');
    await tap('button:has-text("Export")');
    const h = await getJson('/api/health');
    if (!h.authRequired) {
      await tap('button[aria-label="Close"]');
      return 'auth disabled on this server (development mode) — key prompt not shown';
    }
    const keyInput = page.locator('input[aria-label="Render access key"]');
    await keyInput.waitFor({ timeout: 10000 });
    assert(await page.locator('button:has-text("Render 1080×1920 MP4")').isDisabled(), 'render button should be disabled without a key');
    await keyInput.fill(TOKEN);
    await tap('button:has-text("Save")');
    await sleep(200);
    assert(!(await page.locator('button:has-text("Render 1080×1920 MP4")').isDisabled()), 'render button should be enabled after saving the key');
    const stored = await page.evaluate(() => localStorage.getItem('motion-lab:renderKey:v1'));
    assert(stored === TOKEN, 'key not stored on device');
    const html = await page.content();
    assert(!html.includes(TOKEN) || html.includes('type="password"'), 'key must not be rendered in page text');
    await shot('00-access-key');
    await tap('button[aria-label="Close"]');
    return 'key prompt shown, render disabled until a key is saved, key kept in localStorage only';
  });

  await step('UI-1', 'Editor loads on iPhone viewport with the test composition', async () => {
    await page.goto(BASE + '/');
    await page.evaluate((t) => { localStorage.clear(); if (t) localStorage.setItem('motion-lab:renderKey:v1', t); }, TOKEN);
    await page.reload();
    await page.waitForSelector('[data-testid="canvas-stage"] [data-layer-id="layer_headline"]');
    const n = await page.locator('[data-testid="canvas-stage"] [data-layer-id]').count();
    assert(n === 2, `expected 2 layers, got ${n}`);
    const dir = await layerEl('layer_subtitle').getAttribute('dir');
    assert(dir === 'rtl', `Hebrew layer dir=${dir}`);
    const hasH = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert(hasH, 'horizontal overflow');
    await shot('01-loaded');
    return 'two layers rendered; Hebrew layer resolved to RTL; no horizontal overflow';
  });

  await step('UI-2', 'Scrubbing the timeline by touch changes the frame and the preview', async () => {
    const r = await rulerBox();
    const y0 = await layerEl('layer_headline').evaluate((el) => parseFloat(el.style.top));
    await touchDrag(r.x + 2, r.y + r.height / 2, r.x + r.width * 0.5, r.y + r.height / 2, 20);
    const f = await frameNow();
    assert(f >= 145 && f <= 155, `expected ~150, got ${f}`);
    const y1 = await layerEl('layer_headline').evaluate((el) => parseFloat(el.style.top));
    assert(Math.abs(y0 - 1130) < 0.01 && Math.abs(y1 - 940) < 0.01, `headline top ${y0} -> ${y1}`);
    await shot('02-scrubbed');
    return `frame 0 -> ${f}; headline y 1130 -> 940`;
  });

  await step('UI-3', 'Dragging the headline on the canvas repositions it (writes a Y keyframe at the current frame)', async () => {
    await scrubTo(150);
    const before = await stored();
    const hb = await layerEl('layer_headline').boundingBox();
    const stage = await page.locator('[data-testid="canvas-stage"]').boundingBox();
    const scale = stage.width / 1080;
    const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
    await touchDrag(cx, cy, cx + 40, cy - 60, 15);
    await sleep(400);
    const after = await stored();
    const h = after.layers.find((l) => l.id === 'layer_headline');
    const dx = h.transform.x.value - 540;
    assert(Math.abs(dx - 40 / scale) < 3, `x moved by ${dx.toFixed(1)} expected ${(40 / scale).toFixed(1)}`);
    const kf = h.transform.y.keyframes.find((k) => k.frame === 150);
    assert(kf, 'no Y keyframe written at frame 150');
    assert(Math.abs(kf.value - (940 - 60 / scale)) < 3, `y keyframe value ${kf.value}`);
    assert(before.layers[0].transform.y.keyframes.length + 1 === h.transform.y.keyframes.length, 'keyframe count');
    await shot('03-dragged');
    return `x +${dx.toFixed(1)}px (static), new Y keyframe @150 = ${kf.value.toFixed(1)} (scale ${scale.toFixed(3)})`;
  });

  await step('UI-4', 'Undo / redo restore the drag', async () => {
    await tap('button[aria-label="Undo"]');
    await sleep(350);
    let h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    assert(h.transform.x.value === 540 && h.transform.y.keyframes.length === 2, 'undo did not restore');
    await tap('button[aria-label="Redo"]');
    await sleep(350);
    h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    assert(h.transform.x.value !== 540 && h.transform.y.keyframes.length === 3, 'redo did not reapply');
    await tap('button[aria-label="Undo"]');
    await sleep(350);
    return 'undo restored x=540 and 2 keyframes; redo reapplied; undone again';
  });

  await step('UI-5', 'Editing text (Hebrew) updates the canvas and switches to RTL', async () => {
    await tap('button:has-text("Text")');
    const ta = page.locator('textarea').first();
    await ta.fill('שלום עולם');
    await sleep(350);
    const txt = await layerEl('layer_headline').evaluate((el) => el.textContent);
    const dir = await layerEl('layer_headline').getAttribute('dir');
    assert(txt === 'שלום עולם', `canvas text "${txt}"`);
    assert(dir === 'rtl', `dir ${dir}`);
    const s = await stored();
    assert(s.layers[0].text === 'שלום עולם', 'not persisted');
    await shot('04-hebrew');
    await ta.fill('MOTION IS\nDESIGN');
    await sleep(350);
    return 'canvas shows Hebrew with dir=rtl; persisted; restored to original';
  });

  await step('UI-6', 'Keyframes: toggle a rotation keyframe, add a second via the inspector, animation interpolates', async () => {
    await tap('button:has-text("Transform")');
    await scrubTo(120);
    await tap('button[aria-label^="Add Rotation keyframe"]');
    await sleep(300);
    let h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    assert(h.transform.rotation.keyframes.length === 1 && h.transform.rotation.keyframes[0].frame === 120, 'first keyframe');
    await scrubTo(240);
    const input = page.locator('input[aria-label="Rotation value"]');
    await input.fill('45');
    await sleep(350);
    h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    assert(h.transform.rotation.keyframes.length === 2, `expected 2 rotation keyframes, got ${h.transform.rotation.keyframes.length}`);
    await scrubTo(180);
    const t = await layerEl('layer_headline').evaluate((el) => el.style.transform);
    const rot = Number(t.match(/rotate\(([-\d.]+)deg\)/)[1]);
    assert(rot > 5 && rot < 40, `rotation at frame 180 = ${rot} (expected between 0 and 45)`);
    await shot('05-keyframes');
    return `rotation keyframes @120=0 and @240=45 → frame 180 renders rotate(${rot.toFixed(2)}deg)`;
  });

  await step('UI-7', 'Easing editor changes the interpolated value', async () => {
    await scrubTo(180);
    const linearRot = Number((await layerEl('layer_headline').evaluate((el) => el.style.transform)).match(/rotate\(([-\d.]+)deg\)/)[1]);
    // select the first rotation keyframe in the timeline
    await tap('button[aria-label="rotation keyframe at frame 120"]');
    await sleep(200);
    assert((await frameNow()) === 120, 'selecting a keyframe should jump to its frame');
    const tabActive = await page.locator('button:has-text("keyframe")').first().evaluate((el) => el.className.includes('border-accent'));
    assert(tabActive, 'keyframe tab not active');
    // ease-in: x1=0.9,y1=0 → value at midpoint is lower than linear
    await page.locator('input[type="number"]').nth(2).fill('0.9'); // x1 (after Frame, Value inputs)
    await page.locator('input[type="number"]').nth(3).fill('0');
    await sleep(300);
    const h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    const kf = h.transform.rotation.keyframes.find((k) => k.frame === 120);
    assert(kf.easing.x1 === 0.9 && kf.easing.y1 === 0, `easing ${JSON.stringify(kf.easing)}`);
    await scrubTo(180);
    const easedRot = Number((await layerEl('layer_headline').evaluate((el) => el.style.transform)).match(/rotate\(([-\d.]+)deg\)/)[1]);
    assert(easedRot < linearRot - 2, `eased ${easedRot} should be well below linear ${linearRot}`);
    await shot('06-easing');
    // drag a handle on the curve by touch, verify it changes
    await tap('button[aria-label="rotation keyframe at frame 120"]');
    await sleep(100);
    const svgLoc = page.locator('svg[viewBox="0 0 100 100"]');
    await svgLoc.scrollIntoViewIfNeeded();
    await sleep(100);
    const svg = await svgLoc.boundingBox();
    assert(svg, 'easing svg');
    const px = svg.x + 0.9 * svg.width, py = svg.y + svg.height * (1 - (0 + 0.5) / 2);
    await touchDrag(px, py, svg.x + 0.3 * svg.width, py, 10);
    await sleep(300);
    const kf2 = (await stored()).layers.find((l) => l.id === 'layer_headline').transform.rotation.keyframes.find((k) => k.frame === 120);
    assert(Math.abs(kf2.easing.x1 - 0.3) < 0.08, `handle drag x1=${kf2.easing.x1}`);
    return `frame 180: linear ${linearRot.toFixed(2)}° → ease-in ${easedRot.toFixed(2)}°; handle touch-drag set x1≈${kf2.easing.x1}`;
  });

  await step('UI-8', 'Keyframe drag in the timeline moves it to a new frame; delete removes it', async () => {
    const r = await rulerBox();
    const kfBtn = page.locator('button[aria-label="rotation keyframe at frame 240"]');
    const b = await kfBtn.boundingBox();
    assert(b, 'keyframe button not visible');
    const targetX = r.x + (200 / 300) * r.width;
    await touchDrag(b.x + b.width / 2, b.y + b.height / 2, targetX, b.y + b.height / 2, 15);
    await sleep(350);
    let h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    const moved = h.transform.rotation.keyframes.find((k) => k.frame !== 120);
    assert(moved && Math.abs(moved.frame - 200) <= 2, `keyframe frame ${moved?.frame}, expected ≈200`);
    await tap(`button[aria-label="rotation keyframe at frame ${moved.frame}"]`);
    await tap('button:has-text("Delete keyframe")');
    await sleep(350);
    h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    assert(h.transform.rotation.keyframes.length === 1, 'keyframe not deleted');
    await shot('07-kf-moved-deleted');
    return `dragged 240 → ${moved.frame}; deleted; 1 rotation keyframe remains`;
  });

  await step('UI-9', 'Playback advances frames at project fps and pauses', async () => {
    await scrubTo(0);
    await tap('button[aria-label="Play"]');
    await sleep(1000);
    await tap('button[aria-label="Pause"]');
    const f = await frameNow();
    assert(f >= 45 && f <= 75, `after ~1s expected ~60 frames, got ${f}`);
    const f2 = await frameNow();
    await sleep(300);
    assert((await frameNow()) === f2, 'did not pause');
    return `~1 s of playback advanced to frame ${f} (60 fps clock), paused cleanly`;
  });

  await step('UI-10', 'Timeline collapses and expands', async () => {
    const tl = page.locator('[data-testid="timeline"]');
    const h0 = (await tl.boundingBox()).height;
    await tap('button[aria-label="Collapse timeline"]');
    await sleep(300);
    const h1 = (await tl.boundingBox()).height;
    assert(h1 < h0 - 60, `height ${h0} -> ${h1}`);
    await shot('08-collapsed');
    await tap('button[aria-label="Expand timeline"]');
    await sleep(300);
    const h2 = (await tl.boundingBox()).height;
    assert(h2 >= h0 - 2, 'did not expand');
    return `height ${h0} → ${h1} → ${h2}`;
  });

  await step('UI-11', 'Add a text layer, select it, reorder and delete it', async () => {
    await tap('button[aria-label="Add text layer"]');
    await sleep(300);
    let s = await stored();
    assert(s.layers.length === 3, 'layer not added');
    const newId = s.layers[2].id;
    await page.waitForSelector(`[data-layer-id="${newId}"]`);
    await tap('button[aria-label="Move layer down (behind)"]');
    await sleep(300);
    s = await stored();
    assert(s.layers[1].id === newId, 'reorder failed');
    await tap('button:has-text("Delete")');
    await sleep(300);
    s = await stored();
    assert(s.layers.length === 2 && !s.layers.some((l) => l.id === newId), 'delete failed');
    return 'added 3rd layer, moved behind, deleted';
  });

  await step('UI-12', 'Project persists across reload (edits + current frame)', async () => {
    await scrubTo(90);
    await tap('button:has-text("Text")');
    await page.locator('textarea').first().fill('PERSISTED');
    await sleep(500);
    await page.reload();
    await page.waitForSelector('[data-testid="canvas-stage"] [data-layer-id="layer_headline"]');
    const txt = await layerEl('layer_headline').evaluate((el) => el.textContent);
    assert(txt === 'PERSISTED', `after reload text="${txt}"`);
    const h = (await stored()).layers.find((l) => l.id === 'layer_headline');
    assert(h.transform.rotation.keyframes.length === 1, 'rotation keyframe lost');
    const f = await frameNow();
    assert(f === 90, `frame after reload ${f}`);
    await shot('09-reloaded');
    await tap('button:has-text("Text")');
    await page.locator('textarea').first().fill('MOTION IS\nDESIGN');
    await sleep(400);
    return 'text, keyframes and current frame (90) survived reload';
  });

  await step('UI-13', 'Export from the editor: job progress shown, MP4 downloadable', async () => {
    await tap('button:has-text("Export")');
    await tap('button:has-text("Render 1080×1920 MP4")');
    const t0 = Date.now();
    await page.waitForSelector('a:has-text("Download MP4")', { timeout: 10 * 60 * 1000 });
    const href = await page.locator('a:has-text("Download MP4")').getAttribute('href');
    if (TOKEN) assert(href.includes('?t=') && !href.includes(TOKEN), 'download link must carry a per-job token, never the API key');
    const r = await fetch(BASE + href, { method: 'HEAD' });
    assert(r.ok && (r.headers.get('content-type') || '').includes('video/mp4'), `download ${r.status}`);
    await shot('10-exported');
    return `rendered via UI in ${((Date.now() - t0) / 1000).toFixed(0)}s; ${href} → ${r.status} ${r.headers.get('content-type')}`;
  });

  await ctx.close();
}

await browser.close();

// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.status === 'PASS').length;
const md = ['| ID | Check | Result | Detail |', '|---|---|---|---|', ...results.map((r) => `| ${r.id} | ${r.name} | ${r.status} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)].join('\n');
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
writeFileSync(join(OUT, 'results.md'), md + '\n');
console.log(`\n${passed}/${results.length} checks passed. Results in qa/output/`);
process.exit(passed === results.length ? 0 : 1);
