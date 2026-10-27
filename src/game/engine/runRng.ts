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

/** FNV-1a 32-bit hash of full seed hex (must match marspay `challengeEngine/runRng.ts`). */
function seedFromHex(hex: string): number {
  const clean = hex.replace(/^0x/i, '').toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
