import { Container, Graphics } from 'pixi.js';
import { streakPops, type StreakPop } from '@/game/audio/tensionDebug';

const WHITE = 0xffffff;
const BLACK = 0x111111;

type RingSpec = { life: number; from: number; to: number; peak: number };

/** WALL and CLASH: quiet ack — small, short, little expand. */
const HIT_RING: RingSpec = { life: 1, from: 0.72, to: 0.98, peak: 0.72 };
/** REORG: story beat — clearly bigger, still brief. */
const REORG_RING: RingSpec = { life: 1, from: 0.58, to: 1.02, peak: 0.82 };
/** Soft home flash after a reset. */
const SPAWN_RING: RingSpec = { life: 1, from: 0.85, to: 1.05, peak: 0.55 };

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

/** Each nested square, as a fraction of the one outside it. Head-to-head and reorg share this gap. */
const CLASH_INNER = 0.74;

/** Half-side in cells. Wall and clash match. Reorg is a bit larger, double-ring. */
function baseRadiusCells(pop: StreakPop): number {
  if (pop.text === 'REORG') return 1.85;
  if (pop.text === 'SPAWN') return 0.9;
  return 1.25;
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

function paintMark(
  mark: Mark,
  pop: StreakPop,
  cell: number,
  colSize: number,
  rowSize: number
): void {
  const life = 1 - pop.alpha;
  const color = ringColor(pop).fill;
  const base = baseRadiusCells(pop) * cell;
  const drawn = ringAlpha(life, specFor(pop.text));
  mark.root.position.set(
    pop.col * colSize + colSize / 2,
    pop.row * rowSize + rowSize / 2
  );
  mark.root.visible = true;
  mark.ring.clear();
  if (!drawn) return;
  const half = base * drawn.scale;
  const width = Math.max(1, cell * 0.06);

  if (
    pop.text !== 'SPAWN' &&
    pop.toCol !== undefined &&
    pop.toRow !== undefined
  ) {
    const dx = (pop.toCol - pop.col) * colSize;
    const dy = (pop.toRow - pop.row) * rowSize;
    const travel = Math.min(1, life * 1.35);
    mark.ring
      .moveTo(0, 0)
      .lineTo(dx * travel, dy * travel)
      .stroke({
        width: Math.max(1, cell * 0.04),
        color,
        alpha: drawn.alpha * 0.35,
      });
  }
  if (pop.text === 'WIPE') return;

  // Head-to-head: one square, both chain colors, on the cell where they meet.
  if (pop.text === 'CLASH' && pop.fillInner != null) {
    const innerHalf = half * CLASH_INNER;
    strokeSquare(mark.ring, half, width, color, drawn.alpha);
    strokeSquare(mark.ring, innerHalf, width, pop.fillInner, drawn.alpha);
    return;
  }
  // REORG: three squares. Solo is one color. Head-on puts the shorter chain in the middle.
  if (pop.text === 'REORG') {
    const midHalf = half * CLASH_INNER;
    const innerHalf = midHalf * CLASH_INNER;
    const mid = pop.fillInner ?? color;
    strokeSquare(mark.ring, half, width, color, drawn.alpha);
    strokeSquare(mark.ring, midHalf, width, mid, drawn.alpha);
    strokeSquare(mark.ring, innerHalf, width, color, drawn.alpha);
    return;
  }
  strokeSquare(mark.ring, half, width, color, drawn.alpha);
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
    const css = ringColor(pop).css;
    const base = baseRadiusCells(pop) * cell;
    const drawn = ringAlpha(life, specFor(pop.text));
    if (!drawn) continue;
    const half = base * drawn.scale;
    const x = pop.col * colSize + colSize / 2;
    const y = pop.row * rowSize + rowSize / 2;
    const width = Math.max(1, cell * 0.06);
    ctx.strokeStyle = css;
    ctx.lineWidth = width;
    if (
      pop.text !== 'SPAWN' &&
      pop.toCol !== undefined &&
      pop.toRow !== undefined
    ) {
      const tx = pop.toCol * colSize + colSize / 2;
      const ty = pop.toRow * rowSize + rowSize / 2;
      const travel = Math.min(1, life * 1.35);
      ctx.strokeStyle = css;
      ctx.globalAlpha = drawn.alpha * 0.35;
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (tx - x) * travel, y + (ty - y) * travel);
      ctx.stroke();
      ctx.lineWidth = width;
    }
    if (pop.text === 'WIPE') continue;
    if (pop.text === 'CLASH' && pop.fillInner != null) {
      const innerHalf = half * CLASH_INNER;
      const inner = `#${pop.fillInner.toString(16).padStart(6, '0')}`;
      ctx.globalAlpha = drawn.alpha;
      ctx.strokeStyle = css;
      ctx.strokeRect(x - half, y - half, half * 2, half * 2);
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
      const midHalf = half * CLASH_INNER;
      const innerHalf = midHalf * CLASH_INNER;
      const mid =
        pop.fillInner == null
          ? css
          : `#${pop.fillInner.toString(16).padStart(6, '0')}`;
      ctx.globalAlpha = drawn.alpha;
      ctx.strokeStyle = css;
      ctx.strokeRect(x - half, y - half, half * 2, half * 2);
      ctx.strokeStyle = mid;
      ctx.strokeRect(x - midHalf, y - midHalf, midHalf * 2, midHalf * 2);
      ctx.strokeStyle = css;
      ctx.strokeRect(
        x - innerHalf,
        y - innerHalf,
        innerHalf * 2,
        innerHalf * 2
      );
      continue;
    }
    ctx.globalAlpha = drawn.alpha;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
  }
  ctx.restore();
}
