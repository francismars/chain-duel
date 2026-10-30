import type { GridPos } from '@/game/engine/types';

/** Matches the flat head and body fills in `PixiGameRenderer.drawSnake`. */
export const QUIET_HEAD_ALPHA = 1;
export const QUIET_BODY_ALPHA = 0.6;
export const QUIET_PHANTOM_HEAD_ALPHA = 0.5;
export const QUIET_PHANTOM_BODY_ALPHA = 0.25;

export type QuietSnake = {
  id: string;
  /** Higher draws above lower when two chains share a cell. */
  z: number;
  color: number;
  head: GridPos;
  body: GridPos[];
  phantom: boolean;
  frozen: boolean;
  outline?: number;
};

export type CellPaint = {
  key: string;
  id: string;
  z: number;
  gx: number;
  gy: number;
  color: number;
  alpha: number;
};

export type CellDiff = {
  added: CellPaint[];
  updated: CellPaint[];
  removed: string[];
};

export type QuietMark = {
  id: string;
  kind: 'frozen' | 'outline';
  gx: number;
  gy: number;
  color: number;
};

export function cellsForSnakes(snakes: readonly QuietSnake[]): CellPaint[] {
  const out: CellPaint[] = [];
  const indexByKey = new Map<string, number>();
  for (const snake of snakes) {
    const headAlpha = snake.phantom
      ? QUIET_PHANTOM_HEAD_ALPHA
      : QUIET_HEAD_ALPHA;
    const bodyAlpha = snake.phantom
      ? QUIET_PHANTOM_BODY_ALPHA
      : QUIET_BODY_ALPHA;
    const push = (gx: number, gy: number, alpha: number) => {
      const key = `${snake.id}:${gx},${gy}`;
      const cell: CellPaint = {
        key,
        id: snake.id,
        z: snake.z,
        gx,
        gy,
        color: snake.color,
        alpha,
      };
      const existing = indexByKey.get(key);
      if (existing === undefined) {
        indexByKey.set(key, out.length);
        out.push(cell);
        return;
      }
      out[existing] = cell;
    };
    push(snake.head[0], snake.head[1], headAlpha);
    for (const seg of snake.body) push(seg[0], seg[1], bodyAlpha);
  }
  return out;
}

/** Cells that kept their color and alpha are omitted. Position is part of the key. */
export function diffCells(
  prev: ReadonlyMap<string, CellPaint>,
  next: readonly CellPaint[]
): CellDiff {
  const added: CellPaint[] = [];
  const updated: CellPaint[] = [];
  const nextKeys = new Set<string>();
  for (const cell of next) {
    nextKeys.add(cell.key);
    const old = prev.get(cell.key);
    if (!old) {
      added.push(cell);
      continue;
    }
    if (
      old.color !== cell.color ||
      old.alpha !== cell.alpha ||
      old.z !== cell.z
    ) {
      updated.push(cell);
    }
  }
  const removed: string[] = [];
  for (const key of prev.keys()) {
    if (!nextKeys.has(key)) removed.push(key);
  }
  return { added, updated, removed };
}

export function marksForSnakes(snakes: readonly QuietSnake[]): QuietMark[] {
  const marks: QuietMark[] = [];
  for (const snake of snakes) {
    if (snake.frozen) {
      marks.push({
        id: snake.id,
        kind: 'frozen',
        gx: snake.head[0],
        gy: snake.head[1],
        color: 0x3090c8,
      });
    }
    if (snake.outline == null) continue;
    const segs = [snake.head, ...snake.body];
    for (const seg of segs) {
      marks.push({
        id: snake.id,
        kind: 'outline',
        gx: seg[0],
        gy: seg[1],
        color: snake.outline,
      });
    }
  }
  return marks;
}
