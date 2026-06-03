/** Mulberry32 seeded PRNG for deterministic challenge runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromHex(hex: string): number {
  const clean = hex.replace(/^0x/i, '').slice(0, 8);
  return parseInt(clean.padEnd(8, '0').slice(0, 8), 16) >>> 0;
}

let activeNext: (() => number) | null = null;

export function initRunRng(seedHex: string): void {
  activeNext = mulberry32(seedFromHex(seedHex));
}

export function clearRunRng(): void {
  activeNext = null;
}

export function isRunRngActive(): boolean {
  return activeNext !== null;
}

/** Seeded draw in challenge mode; `Math.random()` otherwise. */
export function gameRandom(): number {
  if (activeNext) return activeNext();
  return Math.random();
}
