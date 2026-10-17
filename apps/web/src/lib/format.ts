export function formatTime(frame: number, fps: number): string {
  const s = frame / fps;
  return `${s.toFixed(2)}s`;
}
export function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}
export function round(v: number, decimals = 2) {
  const m = 10 ** decimals;
  return Math.round(v * m) / m;
}
