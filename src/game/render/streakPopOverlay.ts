import { Container, Graphics } from 'pixi.js';
import { streakPops, type StreakPop } from '@/game/audio/tensionDebug';

const WHITE = 0xffffff;
const BLACK = 0x111111;

type RingSpec = { life: number; from: number; to: number; peak: number };

/** WALL and CLASH: quiet ack — short, little expand. White ink peaks here. */
const HIT_RING: RingSpec = { life: 1, from: 0.72, to: 0.98, peak: 0.35 };
/** REORG: story beat — about a cell and a half, still brief. */
const REORG_RING: RingSpec = { life: 1, from: 0.58, to: 1.02, peak: 0.35 };
/** Soft home flash after a reset. A little under one cell. */
const SPAWN_RING: RingSpec = { life: 1, from: 0.85, to: 1.05, peak: 0.32 };
/** Wipe line, as a fraction of the death square's opacity. */
const WIPE_ALPHA = 0.3;
/**
 * Near-black ink at the white peak disappears into the light grid.
 * Dark strokes use this peak instead, including their wipe.
 */
const DARK_PEAK = 0.55;

function ringColor(pop: StreakPop): { fill: number; css: string } {
  const tone =
    pop.tone ??
    (pop.text === 'CLASH' ||
    pop.text === 'REORG' ||
    pop.text === 'WALL' ||
    pop.text === 'SPAWN'
      ? 'white'
      : 'black');
  if (pop.fill != null) {
    return {
      fill: pop.fill,
      css: `#${pop.fill.toString(16).padStart(6, '0')}`,
    };
  }
  if (tone === 'white') return { fill: WHITE, css: '#ffffff' };
  return { fill: BLACK, css: '#111111' };
}

/** Head-to-head inner square, as a fraction of the outer one. Wide enough that both colors read. */
const CLASH_INNER = 0.62;
/** Reorg nested squares, as a fraction of the one outside. */
const REORG_INNER = 0.74;

/**
 * Half-side in cells, before the small expand.
 * A wall ends near one cell across. A head-to-head ends near a cell and a quarter.
 * Reorg ends near a cell and a half. Spawn ends a little under one cell.
 */
const HIT_RADIUS = 0.51;
const CLASH_RADIUS = 0.64;
const REORG_RADIUS = 0.74;
const SPAWN_RADIUS = 0.4;

function baseRadiusCells(pop: StreakPop): number {
  if (pop.text === 'REORG') return REORG_RADIUS;
  if (pop.text === 'CLASH') return CLASH_RADIUS;
  if (pop.text === 'SPAWN') return SPAWN_RADIUS;
  return HIT_RADIUS;
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

function ringAlpha(
  popLife: number,
  spec: RingSpec
): { scale: number; alpha: number } | null {
  const t = popLife / spec.life;
  if (t >= 1) return null;
  const eased = 1 - Math.pow(1 - t, 2);
  return {
    scale: spec.from + (spec.to - spec.from) * eased,
    alpha: spec.peak * (1 - t),
  };
}

function specFor(text: string): RingSpec {
  if (text === 'REORG') return REORG_RING;
  if (text === 'SPAWN') return SPAWN_RING;
  return HIT_RING;
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
    const cell = Math.min(colSize, rowSize);
    pops.forEach((pop, index) => {
      const mark = this.acquire(index);
      paintMark(mark, pop, cell, colSize, rowSize);
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

function strokeSquare(
  ring: Graphics,
  half: number,
  width: number,
  color: number,
  alpha: number
): void {
  ring.rect(-half, -half, half * 2, half * 2).stroke({ width, color, alpha });
}

function outerHalfPx(pop: StreakPop, cell: number): number {
  const spec = specFor(pop.text);
  const drawn = ringAlpha(1 - pop.alpha, spec);
  return baseRadiusCells(pop) * cell * (drawn?.scale ?? spec.to);
}

/** Offset from a square's center to the edge facing (dx, dy). */
function squareEdge(
  dx: number,
  dy: number,
  half: number
): { x: number; y: number } {
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  if (span < 1e-4 || half <= 0) return { x: 0, y: 0 };
  const t = half / span;
  return { x: dx * t, y: dy * t };
}

/**
 * Death→spawn line in pixels relative to the death cell center.
 * It leaves the death square's outer edge and stops at the spawn square's outer edge.
 */
function wipeSegment(
  pop: StreakPop,
  colSize: number,
  rowSize: number,
  cell: number
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  if (pop.toCol === undefined || pop.toRow === undefined) return null;
  const dx = (pop.toCol - pop.col) * colSize;
  const dy = (pop.toRow - pop.row) * rowSize;
  const death =
    pop.text === 'WALL' || pop.text === 'CLASH' || pop.text === 'REORG'
      ? pop
      : streakPops().find(
          (other) =>
            other.col === pop.col &&
            other.row === pop.row &&
            (other.text === 'REORG' ||
              other.text === 'CLASH' ||
              other.text === 'WALL')
        );
  const spawn = streakPops().find(
    (other) =>
      other.text === 'SPAWN' &&
      other.col === pop.toCol &&
      other.row === pop.toRow
  );
  const start = squareEdge(dx, dy, death ? outerHalfPx(death, cell) : 0);
  const inset = squareEdge(
    dx,
    dy,
    spawn ? outerHalfPx(spawn, cell) : SPAWN_RADIUS * cell * SPAWN_RING.to
  );
  const end = { x: dx - inset.x, y: dy - inset.y };
  if ((end.x - start.x) * dx + (end.y - start.y) * dy <= 0) return null;
  return { from: start, to: end };
}

function paintMark(
  mark: Mark,
  pop: StreakPop,
  cell: number,
  colSize: number,
  rowSize: number
): void {
  const life = 1 - pop.alpha;
  const color = ringColor(pop).fill;
  const spec = specFor(pop.text);
  const base = baseRadiusCells(pop) * cell;
  const drawn = ringAlpha(life, spec);
  mark.root.position.set(
    pop.col * colSize + colSize / 2,
    pop.row * rowSize + rowSize / 2
  );
  mark.root.visible = true;
  mark.ring.clear();
  if (!drawn) return;
  const half = base * drawn.scale;
  const width = Math.max(1, cell * 0.06);

  const wipe = wipeSegment(pop, colSize, rowSize, cell);
  if (pop.text !== 'SPAWN' && wipe) {
    const travel = Math.min(1, life * 1.35);
    mark.ring
      .moveTo(wipe.from.x, wipe.from.y)
      .lineTo(
        wipe.from.x + (wipe.to.x - wipe.from.x) * travel,
        wipe.from.y + (wipe.to.y - wipe.from.y) * travel
      )
      .stroke({
        width: Math.max(1, cell * 0.04),
        color,
        alpha: inkAlpha(color, drawn.alpha, spec.peak) * WIPE_ALPHA,
      });
  }
  if (pop.text === 'WIPE') return;

  // Head-to-head: one square, both chain colors, on the cell where they meet.
  if (pop.text === 'CLASH' && pop.fillInner != null) {
    const innerHalf = half * CLASH_INNER;
    strokeSquare(
      mark.ring,
      half,
      width,
      color,
      inkAlpha(color, drawn.alpha, spec.peak)
    );
    strokeSquare(
      mark.ring,
      innerHalf,
      width,
      pop.fillInner,
      inkAlpha(pop.fillInner, drawn.alpha, spec.peak)
    );
    return;
  }
  // REORG: three squares. Solo is one color. Head-on puts the shorter chain in the middle.
  if (pop.text === 'REORG') {
    const midHalf = half * REORG_INNER;
    const innerHalf = midHalf * REORG_INNER;
    const mid = pop.fillInner ?? color;
    const outerAlpha = inkAlpha(color, drawn.alpha, spec.peak);
    strokeSquare(mark.ring, half, width, color, outerAlpha);
    strokeSquare(
      mark.ring,
      midHalf,
      width,
      mid,
      inkAlpha(mid, drawn.alpha, spec.peak)
    );
    strokeSquare(mark.ring, innerHalf, width, color, outerAlpha);
    return;
  }
  strokeSquare(
    mark.ring,
    half,
    width,
    color,
    inkAlpha(color, drawn.alpha, spec.peak)
  );
}

export function drawStreakPopsCanvas(
  ctx: CanvasRenderingContext2D,
  colSize: number,
  rowSize: number
): void {
  const pops = streakPops();
  if (pops.length === 0) return;
  const cell = Math.min(colSize, rowSize);
  ctx.save();
  for (const pop of pops) {
    const life = 1 - pop.alpha;
    const paint = ringColor(pop);
    const css = paint.css;
    const spec = specFor(pop.text);
    const base = baseRadiusCells(pop) * cell;
    const drawn = ringAlpha(life, spec);
    if (!drawn) continue;
    const half = base * drawn.scale;
    const x = pop.col * colSize + colSize / 2;
    const y = pop.row * rowSize + rowSize / 2;
    const width = Math.max(1, cell * 0.06);
    const alphaFor = (color: number) => inkAlpha(color, drawn.alpha, spec.peak);
    ctx.strokeStyle = css;
    ctx.lineWidth = width;
    const wipe = wipeSegment(pop, colSize, rowSize, cell);
    if (pop.text !== 'SPAWN' && wipe) {
      const travel = Math.min(1, life * 1.35);
      ctx.strokeStyle = css;
      ctx.globalAlpha = alphaFor(paint.fill) * WIPE_ALPHA;
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.beginPath();
      ctx.moveTo(x + wipe.from.x, y + wipe.from.y);
      ctx.lineTo(
        x + wipe.from.x + (wipe.to.x - wipe.from.x) * travel,
        y + wipe.from.y + (wipe.to.y - wipe.from.y) * travel
      );
      ctx.stroke();
      ctx.lineWidth = width;
    }
    if (pop.text === 'WIPE') continue;
    if (pop.text === 'CLASH' && pop.fillInner != null) {
      const innerHalf = half * CLASH_INNER;
      const inner = `#${pop.fillInner.toString(16).padStart(6, '0')}`;
      ctx.globalAlpha = alphaFor(paint.fill);
      ctx.strokeStyle = css;
      ctx.strokeRect(x - half, y - half, half * 2, half * 2);
      ctx.globalAlpha = alphaFor(pop.fillInner);
      ctx.strokeStyle = inner;
      ctx.strokeRect(
        x - innerHalf,
        y - innerHalf,
        innerHalf * 2,
        innerHalf * 2
      );
      continue;
    }
    if (pop.text === 'REORG') {
      const midHalf = half * REORG_INNER;
      const innerHalf = midHalf * REORG_INNER;
      const midColor = pop.fillInner ?? paint.fill;
      const mid =
        pop.fillInner == null
          ? css
          : `#${pop.fillInner.toString(16).padStart(6, '0')}`;
      ctx.globalAlpha = alphaFor(paint.fill);
      ctx.strokeStyle = css;
      ctx.strokeRect(x - half, y - half, half * 2, half * 2);
      ctx.globalAlpha = alphaFor(midColor);
      ctx.strokeStyle = mid;
      ctx.strokeRect(x - midHalf, y - midHalf, midHalf * 2, midHalf * 2);
      ctx.globalAlpha = alphaFor(paint.fill);
      ctx.strokeStyle = css;
      ctx.strokeRect(
        x - innerHalf,
        y - innerHalf,
        innerHalf * 2,
        innerHalf * 2
      );
      continue;
    }
    ctx.globalAlpha = alphaFor(paint.fill);
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
  }
  ctx.restore();
}
