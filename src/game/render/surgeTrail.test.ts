import { describe, expect, it } from 'vitest';
import type { GridPos } from '@/game/engine/types';
import {
  SURGE_TRAIL_FADE_MS,
  SURGE_TRAIL_PEAK_ALPHA,
  SurgeTrail,
} from '@/game/render/surgeTrail';

function cells(trail: SurgeTrail): GridPos[] {
  const out: GridPos[] = [];
  for (let i = 0; i < trail.length; i += 1) {
    out.push([trail.cellX(i), trail.cellY(i)]);
  }
  return out;
}

/** A straight chain heading right: head at x, body trailing to the left. */
function chain(x: number, length: number): [GridPos, GridPos[]] {
  const body: GridPos[] = [];
  for (let i = 1; i < length; i += 1) body.push([x - i, 5]);
  return [[x, 5], body];
}

describe('SurgeTrail', () => {
  it('trails off the last block, once per cell however many frames pass', () => {
    const trail = new SurgeTrail();
    for (let t = 0; t < 100; t += 16) trail.note(...chain(5, 3), true, t);
    expect(trail.length).toBe(0);
    trail.note(...chain(6, 3), true, 100);
    for (let t = 116; t < 200; t += 16) trail.note(...chain(6, 3), true, t);
    // The tail was at x=3 and left it; the head's old cell is still chain.
    expect(cells(trail)).toEqual([[3, 5]]);
  });

  it('records both cells of a double step, oldest first', () => {
    const trail = new SurgeTrail();
    trail.note(...chain(5, 3), true, 0);
    trail.note(...chain(7, 3), true, 100);
    expect(cells(trail)).toEqual([
      [3, 5],
      [4, 5],
    ]);
    // Departure times are spread, so the older cell is already a bit fainter.
    expect(trail.alpha(0, 100)).toBeLessThan(trail.alpha(1, 100));
    expect(trail.alpha(1, 100)).toBe(SURGE_TRAIL_PEAK_ALPHA);
  });

  it('leaves nothing when the chain grows and the tail stays put', () => {
    const trail = new SurgeTrail();
    trail.note(...chain(5, 3), true, 0);
    trail.note(...chain(6, 4), true, 100);
    expect(trail.length).toBe(0);
  });

  it('fades smoothly to zero and prunes faded cells', () => {
    const trail = new SurgeTrail();
    trail.note(...chain(5, 3), true, 0);
    trail.note(...chain(6, 3), true, 100);
    let prev = trail.alpha(0, 100);
    for (let t = 116; t < 100 + SURGE_TRAIL_FADE_MS; t += 16) {
      const a = trail.alpha(0, t);
      expect(a).toBeLessThanOrEqual(prev);
      expect(prev - a).toBeLessThan(0.06);
      prev = a;
    }
    trail.prune(100 + SURGE_TRAIL_FADE_MS);
    expect(trail.length).toBe(0);
  });

  it('skips the jump on a respawn and stops when the boost ends', () => {
    const trail = new SurgeTrail();
    trail.note(...chain(5, 3), true, 0);
    trail.note([20, 3], [[19, 3]], true, 100);
    expect(trail.length).toBe(0);
    trail.note([21, 3], [[20, 3]], false, 200);
    expect(trail.length).toBe(0);
  });
});
