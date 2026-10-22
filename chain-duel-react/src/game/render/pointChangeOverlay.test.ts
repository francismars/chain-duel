import { describe, expect, it } from 'vitest';
import {
  computePopLayout,
  placeOnBoard,
  pointChangeDriftX,
  shiftToFit,
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

  it('stays on a vertical path as the pop fades', () => {
    expect(pointChangeDriftX(1, -1)).toBe(0);
    expect(pointChangeDriftX(0.2, 1)).toBe(0);
  });

  it('pulls a popup at the board edge fully inside', () => {
    const right = placeOnBoard(860, 200, 80, 24, 900, 400);
    expect(right.x + 80).toBeLessThanOrEqual(900);
    expect(right.x - 80).toBeGreaterThanOrEqual(0);
    const onHead = placeOnBoard(792, 155, 44, 30, 908, 445);
    expect(onHead.x).toBe(792);
    const pastEdge = placeOnBoard(890, 155, 44, 30, 908, 445);
    expect(pastEdge.x).toBeLessThan(890);
    expect(pastEdge.x + 44).toBeLessThanOrEqual(908);
    const overflow = shiftToFit(860, 40, 980, 90, 908, 445);
    expect(860 + overflow.dx).toBeGreaterThanOrEqual(8);
    expect(980 + overflow.dx).toBeLessThanOrEqual(900);
    const left = placeOnBoard(12, 8, 80, 24, 900, 400);
    expect(left.x - 80).toBeGreaterThanOrEqual(0);
    expect(left.y - 24).toBeGreaterThanOrEqual(0);
  });

  it('keeps label to the right of the number', () => {
    const { mainX, labelX } = computePopLayout(48, 22, 20);
    expect(labelX).toBeGreaterThan(mainX);
    expect(mainX).toBeLessThan(0);
    expect(labelX + 22).toBeLessThanOrEqual(-mainX);
  });
});
