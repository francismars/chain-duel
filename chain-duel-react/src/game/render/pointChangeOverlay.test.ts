import { describe, expect, it } from 'vitest';
import {
  computePopLayout,
  pointChangeDriftX,
  pointChangeFontSize,
  pointChangeLifeProgress,
  pointChangePopScale,
} from '@/game/render/pointChangeOverlay';

describe('pointChangeOverlay', () => {
  it('maps alpha to life progress', () => {
    expect(pointChangeLifeProgress(1)).toBe(0);
    expect(pointChangeLifeProgress(0)).toBe(1);
  });

  it('pops in at spawn then settles', () => {
    expect(pointChangePopScale(1)).toBeGreaterThan(1.22);
    expect(pointChangePopScale(0.4)).toBeCloseTo(1, 1);
  });

  it('scales font with capture size', () => {
    const small = pointChangeFontSize(8, 20);
    const large = pointChangeFontSize(240, 20);
    expect(large).toBeGreaterThan(small);
  });

  it('drifts outward as the pop fades', () => {
    expect(Math.abs(pointChangeDriftX(1, -1))).toBeLessThan(0.001);
    expect(Math.abs(pointChangeDriftX(0.2, -1))).toBeGreaterThan(0);
  });

  it('keeps label to the right of the number', () => {
    const { mainX, labelX } = computePopLayout(48, 22, 20);
    expect(labelX).toBeGreaterThan(mainX);
    expect(mainX).toBeLessThan(0);
    expect(labelX + 22).toBeLessThanOrEqual(-mainX);
  });
});
