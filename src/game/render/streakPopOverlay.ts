import { Container, Graphics } from 'pixi.js';
import {
  getResetMarkStyle,
  streakPops,
  type StreakPop,
} from '@/game/audio/tensionDebug';
import {
  classicV3Strokes,
  drawClassicPopCanvas,
  paintClassicPop,
} from './streakPopOverlayClassic';
import {
  headOfPath,
  pathLength,
  trimEnd,
  trimStart,
  type Point,
  type Stroke,
} from './gridPath';

const WHITE = 0xffffff;
const BLACK = 0x111111;

/**
 * A square outlined on the grid, `cells` wide and centered on the pop's cell.
 * Odd sizes keep every edge on a grid line. `ink` picks the pop's fill or fillInner.
 * It shows from `from` until `until` in the pop's life (0..1).
 */
type GridSquare = {
  cells: number;
  ink: 'outer' | 'inner';
  from: number;
  until?: number;
};
type MarkSpec = { peak: number; squares: readonly GridSquare[] };

/** WALL: quiet ack — the cell it hit, nothing more. */
const HIT_MARK: MarkSpec = {
  peak: 0.35,
  squares: [{ cells: 1, ink: 'outer', from: 0 }],
};
/** Head-to-head: the meeting cell in one color, the ring around it in the other. */
const CLASH_MARK: MarkSpec = {
  peak: 0.35,
  squares: [
    { cells: 1, ink: 'inner', from: 0 },
    { cells: 3, ink: 'outer', from: 0.2 },
  ],
};
/** REORG: story beat — steps out one cell ring at a time. Head-on puts the shorter chain in the middle. */
const REORG_MARK: MarkSpec = {
  peak: 0.35,
  squares: [
    { cells: 1, ink: 'outer', from: 0 },
    { cells: 3, ink: 'inner', from: 0.2 },
    { cells: 5, ink: 'outer', from: 0.4 },
  ],
};
/**
 * Home flash after a reset: closes in on the spawn cell one ring at a time.
 * It stops at the ring around the head. A square on the head itself vanishes into its fill.
 */
const SPAWN_MARK: MarkSpec = {
  peak: 0.45,
  squares: [
    { cells: 5, ink: 'outer', from: 0, until: 0.35 },
    { cells: 3, ink: 'outer', from: 0.35 },
  ],
};
/** The ring the spawn flash settles on. The wipe stops at its edge. */
const SPAWN_LANDING_CELLS = 3;
/** Wipe draws no square of its own. */
const WIPE_MARK: MarkSpec = { peak: 0.35, squares: [] };

/** Wipe line, as a fraction of the death square's opacity. */
const WIPE_ALPHA = 0.3;
/**
 * Near-black ink at the white peak disappears into the light grid.
 * Dark strokes use this peak instead, including their wipe.
 */
const DARK_PEAK = 0.55;

function specFor(text: string): MarkSpec {
  if (text === 'REORG') return REORG_MARK;
  if (text === 'CLASH') return CLASH_MARK;
  if (text === 'SPAWN') return SPAWN_MARK;
  if (text === 'WIPE') return WIPE_MARK;
  return HIT_MARK;
}

function isDeathMark(text: string): boolean {
  return text === 'WALL' || text === 'CLASH' || text === 'REORG';
}

function ringColor(pop: StreakPop): number {
  if (pop.fill != null) return pop.fill;
  const tone =
    pop.tone ??
    (isDeathMark(pop.text) || pop.text === 'SPAWN' ? 'white' : 'black');
  return tone === 'white' ? WHITE : BLACK;
}

function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** #111111 and anything darker. Mid grays stay on the shared peak. */
function isDarkInk(color: number): boolean {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return r <= 0x22 && g <= 0x22 && b <= 0x22;
}

/** Lifts a dark stroke so its peak is DARK_PEAK. White ink is unchanged. */
function inkAlpha(color: number, alpha: number, peak: number): number {
  if (peak <= 0 || !isDarkInk(color)) return alpha;
  return alpha * (DARK_PEAK / peak);
}

/** Largest square this pop ever shows, in cells. Zero when it has none. */
function outerCells(pop: StreakPop): number {
  return specFor(pop.text).squares.reduce(
    (most, square) => Math.max(most, square.cells),
    0
  );
}

/**
 * Death→spawn path in pixels relative to the death cell center.
 * It runs along the death row, then down the spawn column, through cell centers.
 * It leaves the death mark's outer square and stops at the spawn ring it lands on.
 */
function wipePath(
  pop: StreakPop,
  colSize: number,
  rowSize: number
): Point[] | null {
  if (pop.toCol === undefined || pop.toRow === undefined) return null;
  const dx = (pop.toCol - pop.col) * colSize;
  const dy = (pop.toRow - pop.row) * rowSize;
  if (dx === 0 && dy === 0) return null;
  const death = isDeathMark(pop.text)
    ? pop
    : streakPops().find(
        (other) =>
          other.col === pop.col &&
          other.row === pop.row &&
          isDeathMark(other.text)
      );
  const deathCells = death ? outerCells(death) : 0;
  const origin = { x: 0, y: 0 };
  const home = { x: dx, y: dy };
  const corner = { x: dx, y: 0 };
  let points = dx === 0 || dy === 0 ? [origin, home] : [origin, corner, home];
  points = trimStart(
    points,
    origin,
    (deathCells * colSize) / 2,
    (deathCells * rowSize) / 2
  );
  if (points.length < 2) return null;
  points = trimEnd(
    points,
    home,
    (SPAWN_LANDING_CELLS * colSize) / 2,
    (SPAWN_LANDING_CELLS * rowSize) / 2
  );
  if (points.length < 2 || pathLength(points) <= 0) return null;
  return points;
}

/** Everything one pop draws this frame. Empty once it has faded. */
function markStrokes(
  pop: StreakPop,
  colSize: number,
  rowSize: number
): Stroke[] {
  const life = 1 - pop.alpha;
  if (life >= 1) return [];
  const spec = specFor(pop.text);
  const alpha = spec.peak * (1 - life);
  const cell = Math.min(colSize, rowSize);
  const outer = ringColor(pop);
  const inner = pop.fillInner ?? outer;
  const strokes: Stroke[] = [];

  const wipe = wipePath(pop, colSize, rowSize);
  if (pop.text !== 'SPAWN' && wipe) {
    const travel = Math.min(1, life * 1.35);
    const points = headOfPath(wipe, pathLength(wipe) * travel);
    // The first frame has no length yet.
    if (points.length >= 2) {
      strokes.push({
        kind: 'path',
        points,
        width: Math.max(1, cell * 0.04),
        color: outer,
        alpha: inkAlpha(outer, alpha, spec.peak) * WIPE_ALPHA,
      });
    }
  }

  const width = Math.max(1, cell * 0.06);
  for (const square of spec.squares) {
    if (life < square.from || life >= (square.until ?? 1)) continue;
    const color = square.ink === 'inner' ? inner : outer;
    const w = square.cells * colSize;
    const h = square.cells * rowSize;
    strokes.push({
      kind: 'rect',
      x: -w / 2,
      y: -h / 2,
      w,
      h,
      width,
      color,
      alpha: inkAlpha(color, alpha, spec.peak),
    });
  }
  return strokes;
}

type Mark = {
  root: Container;
  ring: Graphics;
};

export class StreakPopOverlay {
  readonly container = new Container();
  private pool: Mark[] = [];

  hide(): void {
    for (const mark of this.pool) mark.root.visible = false;
  }

  render(colSize: number, rowSize: number): void {
    const pops = streakPops();
    if (pops.length === 0) {
      this.hide();
      return;
    }
    pops.forEach((pop, index) => {
      const mark = this.acquire(index);
      paintMark(mark, pop, colSize, rowSize);
    });
    for (let i = pops.length; i < this.pool.length; i += 1) {
      this.pool[i]!.root.visible = false;
    }
  }

  private acquire(index: number): Mark {
    const existing = this.pool[index];
    if (existing) return existing;
    const root = new Container();
    const ring = new Graphics();
    root.addChild(ring);
    this.container.addChild(root);
    const mark = { root, ring };
    this.pool.push(mark);
    return mark;
  }
}

function paintMark(
  mark: Mark,
  pop: StreakPop,
  colSize: number,
  rowSize: number
): void {
  mark.root.position.set(
    pop.col * colSize + colSize / 2,
    pop.row * rowSize + rowSize / 2
  );
  mark.root.visible = true;
  mark.ring.clear();
  const style = getResetMarkStyle();
  if (style === 'classic' || style === 'classic-v2') {
    paintClassicPop(mark.ring, pop, colSize, rowSize, style === 'classic-v2');
    return;
  }
  const strokes =
    style === 'classic-v3'
      ? classicV3Strokes(pop, colSize, rowSize)
      : markStrokes(pop, colSize, rowSize);
  for (const stroke of strokes) {
    const style = {
      width: stroke.width,
      color: stroke.color,
      alpha: stroke.alpha,
    };
    if (stroke.kind === 'rect') {
      mark.ring.rect(stroke.x, stroke.y, stroke.w, stroke.h).stroke(style);
      continue;
    }
    const [first, ...rest] = stroke.points;
    mark.ring.moveTo(first!.x, first!.y);
    for (const point of rest) mark.ring.lineTo(point.x, point.y);
    mark.ring.stroke({ ...style, join: 'miter', cap: 'butt' });
  }
}

export function drawStreakPopsCanvas(
  ctx: CanvasRenderingContext2D,
  colSize: number,
  rowSize: number
): void {
  const pops = streakPops();
  if (pops.length === 0) return;
  ctx.save();
  const style = getResetMarkStyle();
  for (const pop of pops) {
    if (style === 'classic' || style === 'classic-v2') {
      drawClassicPopCanvas(ctx, pop, colSize, rowSize, style === 'classic-v2');
      continue;
    }
    const x = pop.col * colSize + colSize / 2;
    const y = pop.row * rowSize + rowSize / 2;
    const strokes =
      style === 'classic-v3'
        ? classicV3Strokes(pop, colSize, rowSize)
        : markStrokes(pop, colSize, rowSize);
    for (const stroke of strokes) {
      ctx.globalAlpha = stroke.alpha;
      ctx.strokeStyle = toCss(stroke.color);
      ctx.lineWidth = stroke.width;
      if (stroke.kind === 'rect') {
        ctx.strokeRect(x + stroke.x, y + stroke.y, stroke.w, stroke.h);
        continue;
      }
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      ctx.beginPath();
      const [first, ...rest] = stroke.points;
      ctx.moveTo(x + first!.x, y + first!.y);
      for (const point of rest) ctx.lineTo(x + point.x, y + point.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
