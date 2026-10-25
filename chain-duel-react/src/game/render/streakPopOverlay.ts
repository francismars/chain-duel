import { Container, Graphics } from 'pixi.js';
import { streakPops, type StreakPop } from '@/game/audio/tensionDebug';

const WHITE = 0xffffff;
const BLACK = 0x111111;
const GREY = 0xb0b0b0;

type RingSpec = { life: number; from: number; to: number; arrive?: number };

/** Keep expanding for the whole life. Each line finishes at its own pace. */
const REORG_RINGS: RingSpec[] = [
  { life: 1, from: 0.42, to: 1 },
  { life: 0.82, from: 0.22, to: 0.58 },
  { life: 0.64, from: 0.08, to: 0.24 },
];

const SINGLE_RING: RingSpec[] = [{ life: 1, from: 0.55, to: 1.05 }];

function ringColor(pop: StreakPop): { fill: number; css: string } {
  const tone =
    pop.tone ?? (pop.text === 'CLASH' ? 'grey' : pop.text === 'WALL' ? 'white' : 'black');
  if (tone === 'white') return { fill: WHITE, css: '#ffffff' };
  if (tone === 'grey') return { fill: GREY, css: '#b0b0b0' };
  return { fill: BLACK, css: '#111111' };
}

/** Wall and clash stay fixed. A reorg's diameter is the chain that was lost. */
function baseRadiusCells(pop: StreakPop): number {
  if (pop.text === 'WALL') return 2;
  if (pop.text === 'CLASH') return 3.3;
  const length = Math.max(4, pop.chainLength ?? 8);
  return length * 0.28;
}

function ringAlpha(popLife: number, spec: RingSpec): { scale: number; alpha: number } | null {
  const t = popLife / spec.life;
  if (t >= 1) return null;
  const eased = 1 - Math.pow(1 - t, 2);
  return {
    scale: spec.from + (spec.to - spec.from) * eased,
    alpha: 0.88 * (1 - t),
  };
}

function specsFor(text: string): RingSpec[] {
  return text === 'REORG' ? REORG_RINGS : SINGLE_RING;
}

type Mark = {
  root: Container;
  rings: Graphics[];
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
      this.pool[i].root.visible = false;
    }
  }

  private acquire(index: number): Mark {
    const existing = this.pool[index];
    if (existing) return existing;
    const root = new Container();
    const rings = [0, 1, 2].map(() => {
      const ring = new Graphics();
      root.addChild(ring);
      return ring;
    });
    this.container.addChild(root);
    const mark = { root, rings };
    this.pool.push(mark);
    return mark;
  }
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
  const specs = specsFor(pop.text);
  mark.root.position.set(
    pop.col * colSize + colSize / 2,
    pop.row * rowSize + rowSize / 2
  );
  mark.root.visible = true;
  mark.rings.forEach((ring, index) => {
    const spec = specs[index];
    ring.clear();
    if (!spec) return;
    const drawn = ringAlpha(life, spec);
    if (!drawn) return;
    const half = base * drawn.scale;
    const width = pop.text === 'REORG' ? Math.max(1.6, cell * 0.1) : Math.max(1.25, cell * 0.08);
    ring.rect(-half, -half, half * 2, half * 2).stroke({ width, color, alpha: drawn.alpha });
  });
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
    const x = pop.col * colSize + colSize / 2;
    const y = pop.row * rowSize + rowSize / 2;
    for (const spec of specsFor(pop.text)) {
      const drawn = ringAlpha(life, spec);
      if (!drawn) continue;
      const half = base * drawn.scale;
      ctx.strokeStyle = css;
      ctx.globalAlpha = drawn.alpha;
      ctx.lineWidth =
        pop.text === 'REORG' ? Math.max(1.6, cell * 0.1) : Math.max(1.25, cell * 0.08);
      ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    }
  }
  ctx.restore();
}
