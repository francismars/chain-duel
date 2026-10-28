import { describe, expect, it } from 'vitest';
import {
  cellsForSnakes,
  diffCells,
  marksForSnakes,
  QUIET_BODY_ALPHA,
  QUIET_HEAD_ALPHA,
  QUIET_PHANTOM_BODY_ALPHA,
  QUIET_PHANTOM_HEAD_ALPHA,
  type CellPaint,
  type QuietSnake,
} from './quietChainCells';

function snake(overrides: Partial<QuietSnake> = {}): QuietSnake {
  return {
    id: 'p1',
    z: 20,
    color: 0xffffff,
    head: [2, 0],
    body: [
      [1, 0],
      [0, 0],
    ],
    phantom: false,
    frozen: false,
    ...overrides,
  };
}

function byKey(cells: readonly CellPaint[]): Map<string, CellPaint> {
  return new Map(cells.map((cell) => [cell.key, cell]));
}

describe('quiet chain cells', () => {
  it('on a normal step, dims the old head, adds the new head, and drops the tail', () => {
    const before = cellsForSnakes([snake()]);
    const after = cellsForSnakes([
      snake({
        head: [3, 0],
        body: [
          [2, 0],
          [1, 0],
        ],
      }),
    ]);
    const diff = diffCells(byKey(before), after);

    expect(diff.added.map((cell) => [cell.gx, cell.gy, cell.alpha])).toEqual([
      [3, 0, QUIET_HEAD_ALPHA],
    ]);
    expect(diff.updated.map((cell) => [cell.gx, cell.gy, cell.alpha])).toEqual([
      [2, 0, QUIET_BODY_ALPHA],
    ]);
    expect(diff.removed).toEqual(['p1:0,0']);
    expect(
      diff.added.concat(diff.updated).some((cell) => cell.key === 'p1:1,0')
    ).toBe(false);
  });

  it('changes every alpha when a chain turns phantom, and leaves positions put', () => {
    const before = cellsForSnakes([snake()]);
    const after = cellsForSnakes([snake({ phantom: true })]);
    const diff = diffCells(byKey(before), after);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.updated.map((cell) => cell.alpha)).toEqual([
      QUIET_PHANTOM_HEAD_ALPHA,
      QUIET_PHANTOM_BODY_ALPHA,
      QUIET_PHANTOM_BODY_ALPHA,
    ]);
  });

  it('moves the frozen ring and the outline with the cells that moved', () => {
    const before = marksForSnakes([
      snake({
        id: 'e0',
        frozen: true,
        outline: 0xff00ff,
      }),
    ]);
    const after = marksForSnakes([
      snake({
        id: 'e0',
        head: [3, 0],
        body: [
          [2, 0],
          [1, 0],
        ],
        frozen: true,
        outline: 0xff00ff,
      }),
    ]);

    expect(before.map((mark) => [mark.kind, mark.gx])).toEqual([
      ['frozen', 2],
      ['outline', 2],
      ['outline', 1],
      ['outline', 0],
    ]);
    expect(after.map((mark) => [mark.kind, mark.gx])).toEqual([
      ['frozen', 3],
      ['outline', 3],
      ['outline', 2],
      ['outline', 1],
    ]);
  });
});
