import type { GridPos } from '@/game/engine/types';

export function posKey(pos: GridPos): string {
  return `${pos[0]}:${pos[1]}`;
}

type HeapEntry = {
  key: string;
  pos: GridPos;
  f: number;
  order: number;
};

/** Min-heap on f; ties break by lower open-set insertion order (legacy scan). */
class MinHeap {
  private data: HeapEntry[] = [];

  get length(): number {
    return this.data.length;
  }

  push(entry: HeapEntry): void {
    this.data.push(entry);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private better(a: HeapEntry, b: HeapEntry): boolean {
    if (a.f !== b.f) return a.f < b.f;
    return a.order < b.order;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.better(this.data[i]!, this.data[parent]!)) break;
      [this.data[i], this.data[parent]] = [this.data[parent]!, this.data[i]!];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let best = i;
      const left = i * 2 + 1;
      const right = left + 1;
      if (left < n && this.better(this.data[left]!, this.data[best]!)) {
        best = left;
      }
      if (right < n && this.better(this.data[right]!, this.data[best]!)) {
        best = right;
      }
      if (best === i) break;
      [this.data[i], this.data[best]] = [this.data[best]!, this.data[i]!];
      i = best;
    }
  }
}

export function reconstructPath(
  cameFrom: Map<string, string>,
  current: GridPos
): GridPos[] {
  const path: GridPos[] = [[current[0], current[1]]];
  let cursor = posKey(current);
  while (cameFrom.has(cursor)) {
    const prev = cameFrom.get(cursor)!;
    const [x, y] = prev.split(':').map((n) => Number.parseInt(n, 10));
    path.unshift([x, y]);
    cursor = prev;
  }
  return path;
}

export interface RunAStarArgs {
  start: GridPos;
  target: GridPos;
  heuristic: (a: GridPos, b: GridPos) => number;
  neighbors: (current: GridPos) => Iterable<GridPos>;
  samePos: (a: GridPos, b: GridPos) => boolean;
}

/** Grid A* with heap open-set (replaces array + findIndex/splice/some). */
export function runAStar(args: RunAStarArgs): GridPos[] {
  const { start, target, heuristic, neighbors, samePos } = args;
  const startKey = posKey(start);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([
    [startKey, heuristic(start, target)],
  ]);
  const heap = new MinHeap();
  const openSetOrder = new Map<string, number>();
  let nextOpenOrder = 0;
  const ensureOpenOrder = (key: string): number => {
    let order = openSetOrder.get(key);
    if (order === undefined) {
      order = nextOpenOrder++;
      openSetOrder.set(key, order);
    }
    return order;
  };
  heap.push({
    key: startKey,
    pos: [start[0], start[1]],
    f: fScore.get(startKey)!,
    order: ensureOpenOrder(startKey),
  });

  while (heap.length > 0) {
    const entry = heap.pop()!;
    const recordedF = fScore.get(entry.key) ?? Number.POSITIVE_INFINITY;
    if (entry.f > recordedF) continue;

    const current = entry.pos;
    if (samePos(current, target)) {
      return reconstructPath(cameFrom, current);
    }

    const currentG = gScore.get(entry.key) ?? Number.POSITIVE_INFINITY;
    for (const nb of neighbors(current)) {
      const tentative = currentG + 1;
      const nbKey = posKey(nb);
      if (tentative >= (gScore.get(nbKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      cameFrom.set(nbKey, entry.key);
      gScore.set(nbKey, tentative);
      const f = tentative + heuristic(nb, target);
      fScore.set(nbKey, f);
      heap.push({
        key: nbKey,
        pos: [nb[0], nb[1]],
        f,
        order: ensureOpenOrder(nbKey),
      });
    }
  }

  return [[start[0], start[1]]];
}
