let counter = 0;
/** Short unique id (not cryptographic). */
export function uid(prefix = 'k'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
