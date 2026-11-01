import { describe, expect, it } from 'vitest';
import {
  gridLineStaircase,
  organicGridLinePath,
  pathLength,
  slicePath,
  staircase,
  trimEnd,
  trimStart,
} from './gridPath';

const axisAligned = (points: { x: number; y: number }[]) =>
  points.every(
    (p, i) => i === 0 || p.x === points[i - 1]!.x || p.y === points[i - 1]!.y
  );

describe('staircase', () => {
  it('walks a diagonal in row and column legs only', () => {
    const points = staircase(4, -3, 10, 10);
    expect(axisAligned(points)).toBe(true);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 40, y: -30 });
    expect(pathLength(points)).toBe(70);
  });

  it('keeps a straight row as one leg', () => {
    expect(staircase(5, 0, 10, 12)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
  });

  it('caps long diagonals at six stairs', () => {
    expect(staircase(40, 20, 1, 1)).toHaveLength(13);
  });
});

describe('trim and slice', () => {
  it('clips the ends to the squares around them', () => {
    let points = staircase(3, 3, 10, 10);
    points = trimStart(points, { x: 0, y: 0 }, 5, 5);
    points = trimEnd(points, { x: 30, y: 30 }, 5, 5);
    expect(points[0]).toEqual({ x: 5, y: 0 });
    expect(points.at(-1)).toEqual({ x: 30, y: 25 });
    expect(axisAligned(points)).toBe(true);
  });

  it('slices a stretch that turns a corner', () => {
    const points = staircase(2, 2, 10, 10);
    const part = slicePath(points, 5, 15);
    expect(part).toEqual([
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
    expect(pathLength(part)).toBe(10);
  });
});

describe('gridLineStaircase', () => {
  it('runs corner to corner on the grid lines', () => {
    const points = gridLineStaircase(4, 3, 10, 10);
    expect(axisAligned(points)).toBe(true);
    // Leaves the death cell's facing corner, lands on the home cell's.
    expect(points[0]).toEqual({ x: 5, y: 5 });
    expect(points.at(-1)).toEqual({ x: 35, y: 25 });
    for (const p of points) {
      expect(((p.x - 5) / 10) % 1).toBe(0);
      expect(((p.y - 5) / 10) % 1).toBe(0);
    }
  });

  it('follows a cell edge for a straight run', () => {
    expect(gridLineStaircase(0, -4, 10, 10)).toEqual([
      { x: 5, y: -5 },
      { x: 5, y: -35 },
    ]);
  });
});

describe('organicGridLinePath', () => {
  it('stays on grid lines, heads home, and lands on the home corner', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const points = organicGridLinePath(9, -6, 10, 10, seed);
      expect(axisAligned(points)).toBe(true);
      expect(points[0]).toEqual({ x: 5, y: -5 });
      expect(points.at(-1)).toEqual({ x: 85, y: -55 });
      // Never doubles back: x only grows, y only shrinks.
      for (let i = 1; i < points.length; i += 1) {
        expect(points[i]!.x).toBeGreaterThanOrEqual(points[i - 1]!.x);
        expect(points[i]!.y).toBeLessThanOrEqual(points[i - 1]!.y);
      }
      // One to three turns: two to four legs.
      expect(points.length - 1).toBeGreaterThanOrEqual(2);
      expect(points.length - 1).toBeLessThanOrEqual(4);
    }
  });

  it('keeps one shape per seed and varies across seeds', () => {
    const a = organicGridLinePath(9, -6, 10, 10, 7);
    expect(organicGridLinePath(9, -6, 10, 10, 7)).toEqual(a);
    const shapes = new Set(
      Array.from({ length: 12 }, (_, i) =>
        JSON.stringify(organicGridLinePath(9, -6, 10, 10, i + 1))
      )
    );
    expect(shapes.size).toBeGreaterThan(4);
  });
});
