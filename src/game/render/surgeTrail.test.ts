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

describe('SurgeTrail', () => {
  it('records each cell once, however many frames the head sits on it', () => {
    const trail = new SurgeTrail();
    for (let t = 0; t < 100; t += 16) trail.note([5, 5], [[4, 5]], true, t);
    expect(trail.length).toBe(0);
    trail.note([6, 5], [[5, 5]], true, 100);
    for (let t = 116; t < 200; t += 16) trail.note([6, 5], [[5, 5]], true, t);
    expect(cells(trail)).toEqual([[5, 5]]);
  });

  it('fills the cell a double step jumped over, oldest first', () => {
    const trail = new SurgeTrail();
    trail.note([5, 5], [[4, 5]], true, 0);
    trail.note(
      [7, 5],
      [
        [6, 5],
        [5, 5],
      ],
      true,
      100
    );
    expect(cells(trail)).toEqual([
      [5, 5],
      [6, 5],
    ]);
    // Departure times are spread, so the older cell is already a bit fainter.
    expect(trail.alpha(0, 100)).toBeLessThan(trail.alpha(1, 100));
    expect(trail.alpha(1, 100)).toBe(SURGE_TRAIL_PEAK_ALPHA);
  });

  it('fades smoothly to zero and prunes faded cells', () => {
    const trail = new SurgeTrail();
    trail.note([5, 5], [[4, 5]], true, 0);
    trail.note([6, 5], [[5, 5]], true, 100);
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
    trail.note([5, 5], [[4, 5]], true, 0);
    trail.note([20, 3], [[19, 3]], true, 100);
    expect(trail.length).toBe(0);
    trail.note([21, 3], [[20, 3]], false, 200);
    expect(trail.length).toBe(0);
  });
});
