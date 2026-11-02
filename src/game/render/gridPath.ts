/**
 * Axis-aligned paths for reset wipes. Every leg runs along a row or a column,
 * so the line reads as part of the board grid.
 */

export type Point = { x: number; y: number };

/** One stroke of a reset mark, in pixels relative to the pop's cell center. */
export type Stroke =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      width: number;
      color: number;
      alpha: number;
    }
  | {
      kind: 'path';
      points: Point[];
      width: number;
      color: number;
      alpha: number;
    };

/** Most stairs a wipe takes. Long diagonals get wider treads, not more legs. */
const MAX_STAIRS = 6;

/**
 * Staircase from (0, 0) to (dc, dr) cells, in pixels. Each stair is a run along
 * the row then a drop down the column, through cell centers. A straight row or
 * column comes back as a single leg.
 */
export function staircase(
  dc: number,
  dr: number,
  colSize: number,
  rowSize: number
): Point[] {
  const stairs = Math.min(Math.abs(dc), Math.abs(dr), MAX_STAIRS);
  if (stairs === 0)
    return [
      { x: 0, y: 0 },
      { x: dc * colSize, y: dr * rowSize },
    ];
  const points: Point[] = [{ x: 0, y: 0 }];
  let row = 0;
  for (let i = 1; i <= stairs; i += 1) {
    const col = Math.round((dc * i) / stairs);
    const nextRow = Math.round((dr * i) / stairs);
    points.push({ x: col * colSize, y: row * rowSize });
    points.push({ x: col * colSize, y: nextRow * rowSize });
    row = nextRow;
  }
  return points;
}

/**
 * Staircase along the grid lines between cells, not through their centers.
 * It leaves the death cell from the corner facing home and lands on the home
 * cell's facing corner. A straight run follows the cells' right or bottom edge.
 */
export function gridLineStaircase(
  dc: number,
  dr: number,
  colSize: number,
  rowSize: number
): Point[] {
  const sx = Math.sign(dc);
  const sy = Math.sign(dr);
  const start = {
    x: sx === 0 ? colSize / 2 : (sx * colSize) / 2,
    y: sy === 0 ? rowSize / 2 : (sy * rowSize) / 2,
  };
  const spanCols = sx === 0 ? 0 : dc - sx;
  const spanRows = sy === 0 ? 0 : dr - sy;
  if (spanCols === 0 && spanRows === 0) return [start];
  return staircase(spanCols, spanRows, colSize, rowSize).map((point) => ({
    x: point.x + start.x,
    y: point.y + start.y,
  }));
}

/** Small seeded generator, so a mark keeps one shape for its whole life. */
function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `total` cells into `parts` random runs of at least one cell each. */
function randomRuns(
  total: number,
  parts: number,
  rand: () => number
): number[] {
  const cuts = new Set<number>();
  while (cuts.size < parts - 1) cuts.add(1 + Math.floor(rand() * (total - 1)));
  const edges = [0, ...[...cuts].sort((a, b) => a - b), total];
  return edges.slice(1).map((edge, i) => edge - edges[i]!);
}

/**
 * Like gridLineStaircase, but the path finds its own way home: one to three
 * turns, runs of uneven length, and a random first axis. Still on the grid
 * lines and always heading toward home, so it reads as a chain, not a stair.
 */
export function organicGridLinePath(
  dc: number,
  dr: number,
  colSize: number,
  rowSize: number,
  seed: number
): Point[] {
  const sx = Math.sign(dc);
  const sy = Math.sign(dr);
  const start = {
    x: sx === 0 ? colSize / 2 : (sx * colSize) / 2,
    y: sy === 0 ? rowSize / 2 : (sy * rowSize) / 2,
  };
  const spanCols = Math.abs(sx === 0 ? 0 : dc - sx);
  const spanRows = Math.abs(sy === 0 ? 0 : dr - sy);
  if (spanCols === 0 && spanRows === 0) return [start];
  if (spanCols === 0 || spanRows === 0) {
    return [
      start,
      {
        x: start.x + sx * spanCols * colSize,
        y: start.y + sy * spanRows * rowSize,
      },
    ];
  }
  const rand = seeded(seed);
  const turns = 1 + Math.floor(rand() * 3);
  const firstX = rand() < 0.5;
  // Runs alternate axes, so the first axis gets the extra run on an even count.
  const legs = turns + 1;
  const firstCount = Math.ceil(legs / 2);
  const secondCount = Math.floor(legs / 2);
  const xRuns = randomRuns(
    spanCols,
    Math.min(spanCols, firstX ? firstCount : secondCount),
    rand
  );
  const yRuns = randomRuns(
    spanRows,
    Math.min(spanRows, firstX ? secondCount : firstCount),
    rand
  );
  const points: Point[] = [start];
  let x = start.x;
  let y = start.y;
  let onX = firstX;
  while (xRuns.length > 0 || yRuns.length > 0) {
    const runs = onX ? xRuns : yRuns;
    const run = runs.shift();
    if (run !== undefined) {
      if (onX) x += sx * run * colSize;
      else y += sy * run * rowSize;
      points.push({ x, y });
    }
    onX = !onX;
  }
  return points;
}

type Cached = { key: string; points: Point[] };
const stairCache = new Map<number, Cached>();

/**
 * Staircase for one pop, built once and reused every frame it is on screen.
 * The key covers the cell size, so a resize rebuilds it.
 */
export function cachedStaircase(
  id: number,
  dc: number,
  dr: number,
  colSize: number,
  rowSize: number,
  shape: 'centers' | 'lines' | 'organic' = 'centers'
): Point[] {
  const key = `${dc}|${dr}|${colSize}|${rowSize}|${shape}`;
  const hit = stairCache.get(id);
  if (hit && hit.key === key) return hit.points;
  // Pops live under a second, so a small cache never holds a stale one for long.
  if (stairCache.size > 32) stairCache.clear();
  const points =
    shape === 'organic'
      ? organicGridLinePath(dc, dr, colSize, rowSize, id * 2654435761)
      : shape === 'lines'
        ? gridLineStaircase(dc, dr, colSize, rowSize)
        : staircase(dc, dr, colSize, rowSize);
  stairCache.set(id, { key, points });
  return points;
}

/** Steps `from` toward `to` until it leaves the rect centered on `center`. */
function exitRect(
  from: Point,
  to: Point,
  center: Point,
  hx: number,
  hy: number
): Point | null {
  const inside = (p: Point) =>
    Math.abs(p.x - center.x) <= hx && Math.abs(p.y - center.y) <= hy;
  if (inside(to)) return null;
  if (!inside(from)) return from;
  // Legs run along one axis, so only that axis can cross an edge.
  if (to.x !== from.x) {
    const edge = center.x + Math.sign(to.x - from.x) * hx;
    return { x: edge, y: from.y };
  }
  const edge = center.y + Math.sign(to.y - from.y) * hy;
  return { x: from.x, y: edge };
}

/** Drops the part of an axis-aligned path that sits inside the rect at its start. */
export function trimStart(
  points: Point[],
  center: Point,
  hx: number,
  hy: number
): Point[] {
  for (let i = 0; i < points.length - 1; i += 1) {
    const exit = exitRect(points[i]!, points[i + 1]!, center, hx, hy);
    if (exit) return [exit, ...points.slice(i + 1)];
  }
  return [];
}

/** Drops the part of an axis-aligned path that sits inside the rect at its end. */
export function trimEnd(
  points: Point[],
  center: Point,
  hx: number,
  hy: number
): Point[] {
  return trimStart([...points].reverse(), center, hx, hy).reverse();
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total +=
      Math.abs(points[i]!.x - points[i - 1]!.x) +
      Math.abs(points[i]!.y - points[i - 1]!.y);
  }
  return total;
}

/** The part of an axis-aligned path between `from` and `to` pixels along it. */
export function slicePath(points: Point[], from: number, to: number): Point[] {
  const out: Point[] = [];
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const leg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const start = walked;
    walked += leg;
    if (walked <= from || leg === 0) continue;
    if (start >= to) break;
    const at = (d: number) => {
      const t = Math.min(1, Math.max(0, (d - start) / leg));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };
    if (out.length === 0) out.push(at(from));
    out.push(at(to));
    if (walked >= to) break;
  }
  return out;
}

/** The first `length` pixels of an axis-aligned path. */
export function headOfPath(points: Point[], length: number): Point[] {
  return slicePath(points, 0, length);
}
