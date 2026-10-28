import type { Direction, GridPos } from '@/game/engine/types';

/**
 * Where a death mark should sit.
 * On the board, that is the cell the head stepped into.
 * Past the outer edge, it is the last cell still on the grid.
 */
export function visibleDeathCell(
  head: GridPos,
  dir: Direction,
  cols: number,
  rows: number
): GridPos {
  const [x, y] = head;
  if (x >= 0 && y >= 0 && x < cols && y < rows) return [x, y];
  if (dir === 'Left') return [x + 1, y];
  if (dir === 'Right') return [x - 1, y];
  if (dir === 'Up') return [x, y + 1];
  if (dir === 'Down') return [x, y - 1];
  return [
    Math.min(cols - 1, Math.max(0, x)),
    Math.min(rows - 1, Math.max(0, y)),
  ];
}
