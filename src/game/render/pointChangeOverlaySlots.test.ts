import { describe, expect, it, vi } from 'vitest';
import { CanvasTextMetrics } from 'pixi.js';
import type { PointChange } from '@/game/engine/types';
import { PointChangeOverlay } from '@/game/render/pointChangeOverlay';

// Node has no canvas; widths only feed layout, not slot choice.
vi.spyOn(CanvasTextMetrics, 'measureText').mockImplementation(
  (text = '') =>
    ({ width: String(text).length * 8, height: 16 }) as CanvasTextMetrics
);

function change(value: number, alpha: number): PointChange {
  return {
    player: 'P1',
    value,
    p1Pos: [4, 4],
    p2Pos: [10, 4],
    p1YOffsetPx: 0,
    p2YOffsetPx: 0,
    alpha,
  };
}

describe('PointChangeOverlay slots', () => {
  it('keeps a live pop on its Text when an older pop expires', () => {
    const overlay = new PointChangeOverlay('simple');
    const older = change(5, 0.2);
    const newer = change(21, 0.9);
    overlay.render([older, newer], 20, 20);
    const textsFor = (value: string) =>
      overlay.container.children
        .filter((root) => root.visible)
        .flatMap((root) => root.children)
        .filter((node) => 'text' in node && node.text === value);
    const before = textsFor('+21');
    expect(before).toHaveLength(1);

    overlay.render([newer], 20, 20);
    const after = textsFor('+21');
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(before[0]);
    expect(textsFor('+5')).toHaveLength(0);
  });

  it('frees its pooled Texts once every pop has faded', () => {
    const overlay = new PointChangeOverlay('full');
    overlay.render([change(5, 0.8)], 20, 20);
    const roots = [...overlay.container.children];
    expect(roots.length).toBeGreaterThan(0);

    overlay.render([], 20, 20);
    expect(overlay.container.children).toHaveLength(0);
    expect(roots.every((root) => root.destroyed)).toBe(true);
  });
});
