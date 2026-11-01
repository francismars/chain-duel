import type { Graphics } from 'pixi.js';
import { streakPops, type StreakPop } from '@/game/audio/tensionDebug';
import {
  cachedStaircase,
  pathLength,
  slicePath,
  trimEnd,
  trimStart,
  type Point,
  type Stroke,
} from './gridPath';

/**
 * The original reset marks: squares sized off the shorter cell side that ease
 * outward, and a death→spawn wipe that steps along rows and columns. Kept so the trigger lab can compare
 * them with the grid marks in streakPopOverlay.ts.
 *
 * v2 keeps the shapes but moves the weight onto the spawn: the death square
 * fades fast, the wipe eases into home with its tail catching up, and the spawn
 * square closes in on the head once the wipe lands.
 *
 * v3 keeps v2's timing but sits on the board grid: squares snap to whole
 * cells, the wipe runs along the grid lines, and every stroke is stronger.
 */

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

/** v2 spawn: closes from wide to just outside the head, so it never hides in the head's fill. */
const SPAWN_V2_FROM = 1.7;
const SPAWN_V2_TO = 0.62;
const SPAWN_V2_PEAK = 0.5;
/** v2 wipe: lands at this point of the death pop's life. */
const WIPE_V2_LANDS = 0.75;
/**
 * Where the v2 wipe lands in the spawn pop's life. The death pop fades at 0.045
 * a frame and the v2 spawn at 0.03 (tensionDebug), so they meet here.
 */
const SPAWN_V2_WAITS = (WIPE_V2_LANDS / 0.045) * 0.03;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);
const easeIn = (t: number) => t * t;

/** True when a death mark's wipe is headed for this spawn. */
function spawnHasWipe(pop: StreakPop): boolean {
  return streakPops().some(
    (other) =>
      other.text !== 'SPAWN' &&
      other.toCol === pop.col &&
      other.toRow === pop.row &&
      (other.toCol !== other.col || other.toRow !== other.row)
  );
}

/** Square scale and alpha for one pop, or null once it has faded. */
function ringFor(
  pop: StreakPop,
  v2: boolean
): { scale: number; alpha: number } | null {
  const life = 1 - pop.alpha;
  const spec = specFor(pop.text);
  if (!v2) return ringAlpha(life, spec);
  if (life >= 1) return null;
  if (pop.text === 'SPAWN') {
    const wait = spawnHasWipe(pop) ? SPAWN_V2_WAITS : 0;
    if (life < wait) return null;
    const t = (life - wait) / (1 - wait);
    // Lands bright and settles, so the weight sits on the head.
    const close = easeOut(Math.min(1, t / 0.45));
    return {
      scale: SPAWN_V2_FROM + (SPAWN_V2_TO - SPAWN_V2_FROM) * close,
      alpha: SPAWN_V2_PEAK * (t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55),
    };
  }
  // Death marks: same expand, but gone early.
  const drawn = ringAlpha(life, spec);
  if (!drawn) return null;
  return { scale: drawn.scale, alpha: spec.peak * Math.pow(1 - life, 2.5) };
}

/** Base half-side in cells, before the ring's scale. */
function baseCells(pop: StreakPop, v2: boolean): number {
  if (v2 && pop.text === 'SPAWN') return 1;
  return baseRadiusCells(pop);
}

/**
 * The visible part of the wipe as fractions of its length, and its alpha.
 * Classic grows from the death square and fades with it.
 * v2 eases into home, its tail chases the head, and it brightens as it goes.
 */
function wipeSpan(
  life: number,
  deathAlpha: number,
  peak: number,
  v2: boolean
): { tail: number; head: number; alpha: number } {
  if (!v2) {
    return { tail: 0, head: Math.min(1, life * 1.35), alpha: deathAlpha };
  }
  const p = Math.min(1, life / WIPE_V2_LANDS);
  const fade = life <= WIPE_V2_LANDS ? 1 : 1 - (life - WIPE_V2_LANDS) / 0.25;
  return {
    tail: easeIn(p) * 0.92,
    head: easeOut(p),
    alpha: peak * (0.35 + 0.65 * p) * Math.max(0, fade),
  };
}

function specFor(text: string): RingSpec {
  if (text === 'REORG') return REORG_RING;
  if (text === 'SPAWN') return SPAWN_RING;
  return HIT_RING;
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

function outerHalfPx(pop: StreakPop, cell: number, v2: boolean): number {
  if (v2 && pop.text === 'SPAWN') return SPAWN_V2_TO * cell;
  const spec = specFor(pop.text);
  const drawn = ringAlpha(1 - pop.alpha, spec);
  return baseRadiusCells(pop) * cell * (drawn?.scale ?? spec.to);
}

/**
 * Death→spawn staircase in pixels relative to the death cell center.
 * Rows and columns only, through cell centers. It leaves the death square's
 * outer edge and stops at the spawn square's outer edge.
 */
function wipePath(
  pop: StreakPop,
  colSize: number,
  rowSize: number,
  cell: number,
  v2: boolean
): Point[] | null {
  if (pop.toCol === undefined || pop.toRow === undefined) return null;
  const dc = pop.toCol - pop.col;
  const dr = pop.toRow - pop.row;
  if (dc === 0 && dr === 0) return null;
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
  const startHalf = death ? outerHalfPx(death, cell, v2) : 0;
  const endHalf = spawn
    ? outerHalfPx(spawn, cell, v2)
    : v2
      ? SPAWN_V2_TO * cell
      : SPAWN_RADIUS * cell * SPAWN_RING.to;
  let points = cachedStaircase(pop.id, dc, dr, colSize, rowSize);
  points = trimStart(points, { x: 0, y: 0 }, startHalf, startHalf);
  if (points.length < 2) return null;
  points = trimEnd(
    points,
    { x: dc * colSize, y: dr * rowSize },
    endHalf,
    endHalf
  );
  if (points.length < 2 || pathLength(points) <= 0) return null;
  return points;
}

/** The visible stretch of the wipe this frame. */
function wipeStretch(
  wipe: Point[],
  span: { tail: number; head: number }
): Point[] {
  const length = pathLength(wipe);
  return slicePath(wipe, length * span.tail, length * span.head);
}

/** Paints one pop on a Graphics already centered on its cell and cleared. */
export function paintClassicPop(
  ring: Graphics,
  pop: StreakPop,
  colSize: number,
  rowSize: number,
  v2 = false
): void {
  const cell = Math.min(colSize, rowSize);
  const life = 1 - pop.alpha;
  const color = ringColor(pop).fill;
  const spec = specFor(pop.text);
  const base = baseCells(pop, v2) * cell;
  const rawDeath = ringAlpha(life, spec);
  const drawn = ringFor(pop, v2);

  const wipe = wipePath(pop, colSize, rowSize, cell, v2);
  if (pop.text !== 'SPAWN' && wipe && rawDeath) {
    const span = wipeSpan(life, rawDeath.alpha, spec.peak, v2);
    const stretch = wipeStretch(wipe, span);
    if (stretch.length >= 2) {
      ring.moveTo(stretch[0]!.x, stretch[0]!.y);
      for (let i = 1; i < stretch.length; i += 1) {
        ring.lineTo(stretch[i]!.x, stretch[i]!.y);
      }
      ring.stroke({
        width: Math.max(1, cell * 0.04),
        color,
        alpha: inkAlpha(color, span.alpha, spec.peak) * WIPE_ALPHA,
        join: 'miter',
        cap: 'butt',
      });
    }
  }
  if (!drawn) return;
  const half = base * drawn.scale;
  const width = Math.max(1, cell * 0.06);
  if (pop.text === 'WIPE') return;

  // Head-to-head: one square, both chain colors, on the cell where they meet.
  if (pop.text === 'CLASH' && pop.fillInner != null) {
    const innerHalf = half * CLASH_INNER;
    strokeSquare(
      ring,
      half,
      width,
      color,
      inkAlpha(color, drawn.alpha, spec.peak)
    );
    strokeSquare(
      ring,
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
    strokeSquare(ring, half, width, color, outerAlpha);
    strokeSquare(
      ring,
      midHalf,
      width,
      mid,
      inkAlpha(mid, drawn.alpha, spec.peak)
    );
    strokeSquare(ring, innerHalf, width, color, outerAlpha);
    return;
  }
  strokeSquare(
    ring,
    half,
    width,
    color,
    inkAlpha(color, drawn.alpha, spec.peak)
  );
}

/** Canvas fallback for one pop. The caller saves and restores the context. */
export function drawClassicPopCanvas(
  ctx: CanvasRenderingContext2D,
  pop: StreakPop,
  colSize: number,
  rowSize: number,
  v2 = false
): void {
  const cell = Math.min(colSize, rowSize);
  const life = 1 - pop.alpha;
  const paint = ringColor(pop);
  const css = paint.css;
  const spec = specFor(pop.text);
  const base = baseCells(pop, v2) * cell;
  const rawDeath = ringAlpha(life, spec);
  const drawn = ringFor(pop, v2);
  const x = pop.col * colSize + colSize / 2;
  const y = pop.row * rowSize + rowSize / 2;
  const width = Math.max(1, cell * 0.06);
  const wipe = wipePath(pop, colSize, rowSize, cell, v2);
  if (pop.text !== 'SPAWN' && wipe && rawDeath) {
    const span = wipeSpan(life, rawDeath.alpha, spec.peak, v2);
    ctx.strokeStyle = css;
    ctx.globalAlpha = inkAlpha(paint.fill, span.alpha, spec.peak) * WIPE_ALPHA;
    ctx.lineWidth = Math.max(1, cell * 0.04);
    const stretch = wipeStretch(wipe, span);
    if (stretch.length >= 2) {
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(x + stretch[0]!.x, y + stretch[0]!.y);
      for (let i = 1; i < stretch.length; i += 1) {
        ctx.lineTo(x + stretch[i]!.x, y + stretch[i]!.y);
      }
      ctx.stroke();
    }
  }
  if (!drawn) return;
  const half = base * drawn.scale;
  const alphaFor = (color: number) => inkAlpha(color, drawn.alpha, spec.peak);
  ctx.strokeStyle = css;
  ctx.lineWidth = width;
  if (pop.text === 'WIPE') return;
  if (pop.text === 'CLASH' && pop.fillInner != null) {
    const innerHalf = half * CLASH_INNER;
    const inner = `#${pop.fillInner.toString(16).padStart(6, '0')}`;
    ctx.globalAlpha = alphaFor(paint.fill);
    ctx.strokeStyle = css;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.globalAlpha = alphaFor(pop.fillInner);
    ctx.strokeStyle = inner;
    ctx.strokeRect(x - innerHalf, y - innerHalf, innerHalf * 2, innerHalf * 2);
    return;
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
    ctx.strokeRect(x - innerHalf, y - innerHalf, innerHalf * 2, innerHalf * 2);
    return;
  }
  ctx.globalAlpha = alphaFor(paint.fill);
  ctx.strokeRect(x - half, y - half, half * 2, half * 2);
}

/** v3 squares, in whole cells, by the point in the mark's life they step out. */
// A wall crash is usually a short chain: just the cell it hit. Only a reorg,
// a long chain going down, earns the full step out to 5×5.
const V3_STEPS: Record<string, Array<{ from: number; cells: number }>> = {
  WALL: [{ from: 0, cells: 1 }],
  CLASH: [
    { from: 0, cells: 1 },
    { from: 0.4, cells: 3 },
  ],
  REORG: [
    { from: 0, cells: 1 },
    { from: 0.25, cells: 3 },
    { from: 0.5, cells: 5 },
  ],
};
/** v3 spawn: one quiet ring around the head. */
const V3_SPAWN_CELLS = 3;
/** Squares stay quieter than the wipe, so the path home carries the motion. */
const V3_SQUARE_SCALE = 0.6;
/** Each ring further out is this much fainter than the one inside it. */
const V3_RING_FALLOFF = 0.6;
const V3_PEAK = 0.75;
/** Black reads weaker on the grey board, so v3 draws it fully opaque at its peak. */
const V3_DARK_PEAK = 1;

/** v3's own ink lift: black strokes peak at V3_DARK_PEAK instead of V3_PEAK. */
function v3Ink(color: number, alpha: number): number {
  return isDarkInk(color) ? alpha * (V3_DARK_PEAK / V3_PEAK) : alpha;
}
const V3_WIPE_ALPHA = 0.7;

/**
 * v3 wipe: same landing point as v2, with a snappier curve. The head shoots
 * out and brakes hard into home, and the tail catches up late.
 */
function v3WipeSpan(life: number): {
  tail: number;
  head: number;
  alpha: number;
} {
  const p = Math.min(1, life / WIPE_V2_LANDS);
  const fade = life <= WIPE_V2_LANDS ? 1 : 1 - (life - WIPE_V2_LANDS) / 0.25;
  return {
    tail: Math.pow(p, 3) * 0.92,
    head: 1 - Math.pow(1 - p, 3),
    alpha: V3_PEAK * (0.45 + 0.55 * p) * Math.max(0, fade),
  };
}

/** Odd-sized squares this v3 mark shows right now, outermost first. */
function v3Squares(pop: StreakPop, life: number): number[] {
  if (pop.text === 'SPAWN') {
    const wait = spawnHasWipe(pop) ? SPAWN_V2_WAITS : 0;
    if (life < wait) return [];
    return [V3_SPAWN_CELLS];
  }
  const steps = V3_STEPS[pop.text] ?? V3_STEPS.WALL!;
  return steps
    .filter((step) => life >= step.from)
    .map((step) => step.cells)
    .reverse();
}

function v3Alpha(pop: StreakPop, life: number): number {
  if (pop.text === 'SPAWN') {
    const wait = spawnHasWipe(pop) ? SPAWN_V2_WAITS : 0;
    const t = Math.max(0, (life - wait) / (1 - wait));
    return V3_PEAK * (t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55);
  }
  // Death marks still clear early, so the weight lands on the spawn.
  return V3_PEAK * Math.pow(1 - life, 1.6);
}

/**
 * Classic v3 as strokes, drawn by the grid overlay's painter. Squares sit on
 * cell edges and the wipe climbs the grid lines from corner to corner.
 */
export function classicV3Strokes(
  pop: StreakPop,
  colSize: number,
  rowSize: number
): Stroke[] {
  const life = 1 - pop.alpha;
  if (life >= 1) return [];
  const cell = Math.min(colSize, rowSize);
  const outer = ringColor(pop).fill;
  const inner = pop.fillInner ?? outer;
  const strokes: Stroke[] = [];
  const squares = v3Squares(pop, life);

  if (
    pop.text !== 'SPAWN' &&
    pop.toCol !== undefined &&
    pop.toRow !== undefined
  ) {
    const dc = pop.toCol - pop.col;
    const dr = pop.toRow - pop.row;
    const deathCells = squares[0] ?? 1;
    let points = cachedStaircase(pop.id, dc, dr, colSize, rowSize, 'organic');
    points = trimStart(
      points,
      { x: 0, y: 0 },
      (deathCells * colSize) / 2,
      (deathCells * rowSize) / 2
    );
    points = trimEnd(
      points,
      { x: dc * colSize, y: dr * rowSize },
      (V3_SPAWN_CELLS * colSize) / 2,
      (V3_SPAWN_CELLS * rowSize) / 2
    );
    const span = v3WipeSpan(life);
    const length = pathLength(points);
    const stretch =
      length > 0
        ? slicePath(points, length * span.tail, length * span.head)
        : [];
    if (stretch.length >= 2) {
      strokes.push({
        kind: 'path',
        points: stretch,
        width: Math.max(1.5, cell * 0.08),
        color: outer,
        alpha: Math.min(1, v3Ink(outer, span.alpha) * V3_WIPE_ALPHA),
      });
    }
  }
  if (pop.text === 'WIPE') return strokes;

  const alpha = v3Alpha(pop, life);
  const width = Math.max(1, cell * 0.06);
  squares.forEach((cells, index) => {
    // CLASH: inner chain color on the meeting cell. REORG: middle ring is the other chain.
    const middle = squares.length === 3 && index === 1;
    const innermost = squares.length === 2 && index === 1;
    const color =
      (pop.text === 'CLASH' && innermost) || (pop.text === 'REORG' && middle)
        ? inner
        : outer;
    const w = cells * colSize;
    const h = cells * rowSize;
    strokes.push({
      kind: 'rect',
      x: -w / 2,
      y: -h / 2,
      w,
      h,
      width,
      color,
      // Outermost first: rings further out fade more.
      alpha: Math.min(
        1,
        v3Ink(color, alpha) *
          V3_SQUARE_SCALE *
          Math.pow(V3_RING_FALLOFF, squares.length - 1 - index)
      ),
    });
  });
  return strokes;
}
