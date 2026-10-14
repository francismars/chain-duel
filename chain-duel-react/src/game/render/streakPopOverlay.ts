import { Container, Text, TextStyle } from 'pixi.js';
import { streakPops, type StreakPop } from '@/game/audio/tensionDebug';
import {
  pointChangeFontSize,
  pointChangePopScale,
} from '@/game/render/pointChangeOverlay';
import { pixiTextResolution } from '@/game/render/pixiTextResolution';

const GAIN_FILL = 0x6fd4a8;
const GAIN_GLOW = 0x88e0b8;
const LOSS_FILL = 0xe85a4a;
const LOSS_GLOW = 0xff7a6a;
/** Sit above the +sats label, which already occupies the head. */
const LIFT_CELLS = 1.35;
const SIZE_SCALE = 0.85;

export class StreakPopOverlay {
  readonly container = new Container();
  private pool: Text[] = [];

  hide(): void {
    for (const text of this.pool) text.visible = false;
  }

  render(colSize: number, rowSize: number): void {
    const pops = streakPops();
    if (pops.length === 0) {
      this.hide();
      return;
    }
    const cellSize = Math.min(colSize, rowSize);
    const spawnLift = -rowSize * LIFT_CELLS;
    pops.forEach((pop, index) => {
      const text = this.acquire(index);
      this.layout(text, pop, cellSize, colSize, rowSize, spawnLift);
    });
    for (let i = pops.length; i < this.pool.length; i += 1) {
      this.pool[i].visible = false;
    }
  }

  private layout(
    text: Text,
    pop: StreakPop,
    cellSize: number,
    colSize: number,
    rowSize: number,
    spawnLift: number
  ): void {
    const fontSize = Math.max(
      11,
      Math.round(pointChangeFontSize(2, cellSize) * SIZE_SCALE)
    );
    text.text = pop.text;
    const fill = pop.up ? GAIN_FILL : LOSS_FILL;
    const glow = pop.up ? GAIN_GLOW : LOSS_GLOW;
    text.style = new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize,
      fontWeight: '700',
      fill,
      align: 'center',
      padding: 8,
      dropShadow: {
        color: glow,
        alpha: 0.85,
        blur: 10,
        angle: 0,
        distance: 0,
      },
    });
    text.position.set(
      Math.round(pop.col * colSize + colSize / 2),
      Math.round(pop.row * rowSize + rowSize / 2 + pop.yOffsetPx + spawnLift)
    );
    const scale = pointChangePopScale(pop.alpha);
    text.scale.set(scale);
    text.alpha = pop.alpha;
    text.visible = true;
  }

  private acquire(index: number): Text {
    const existing = this.pool[index];
    if (existing) return existing;
    const text = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: '700',
        fill: GAIN_FILL,
        align: 'center',
      }),
    });
    text.anchor.set(0.5, 0.5);
    text.resolution = pixiTextResolution();
    text.roundPixels = true;
    this.container.addChild(text);
    this.pool.push(text);
    return text;
  }
}

export function drawStreakPopsCanvas(
  ctx: CanvasRenderingContext2D,
  colSize: number,
  rowSize: number
): void {
  const pops = streakPops();
  if (pops.length === 0) return;
  const cellSize = Math.min(colSize, rowSize);
  const spawnLift = -rowSize * LIFT_CELLS;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6fd4a8';
  for (const pop of pops) {
    const fontSize = Math.max(
      11,
      Math.round(pointChangeFontSize(2, cellSize) * SIZE_SCALE)
    );
    ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = pop.up ? '#6fd4a8' : '#e85a4a';
    ctx.shadowColor = pop.up ? '#88e0b8' : '#ff7a6a';
    ctx.shadowBlur = 10;
    ctx.globalAlpha = pop.alpha;
    const scale = pointChangePopScale(pop.alpha);
    const x = pop.col * colSize + colSize / 2;
    const y = pop.row * rowSize + rowSize / 2 + pop.yOffsetPx + spawnLift;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillText(pop.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
