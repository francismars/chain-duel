import { CanvasTextMetrics, Container, Text, TextStyle } from 'pixi.js';
import { streakPops, type StreakPop } from '@/game/audio/tensionDebug';
import {
  keepPopOnBoard,
  placeOnBoard,
  pointChangePopScale,
} from '@/game/render/pointChangeOverlay';
import { pixiTextResolution } from '@/game/render/pixiTextResolution';

/** Gold, so a reorg doesn't read as a sats gain or a sats loss. */
const REORG_FILL = 0xf0c14d;
const REORG_GLOW = 0xffe09a;
/** Full life stays a little see-through, so the word doesn't shout. */
const REORG_ALPHA = 0.82;
/** Sit above the +sats label, which already occupies the head. */
const LIFT_CELLS = 1.35;

const boundText = new WeakMap<Text, string>();

export class StreakPopOverlay {
  readonly container = new Container();
  private pool: Text[] = [];
  private styles = new Map<string, TextStyle>();

  hide(): void {
    for (const text of this.pool) text.visible = false;
  }

  render(
    colSize: number,
    rowSize: number,
    boardWidth = Number.POSITIVE_INFINITY,
    boardHeight = Number.POSITIVE_INFINITY
  ): void {
    const pops = streakPops();
    if (pops.length === 0) {
      this.hide();
      return;
    }
    const cellSize = Math.min(colSize, rowSize);
    const spawnLift = -rowSize * LIFT_CELLS;
    pops.forEach((pop, index) => {
      const text = this.acquire(index);
      this.layout(
        text,
        pop,
        cellSize,
        colSize,
        rowSize,
        spawnLift,
        boardWidth,
        boardHeight
      );
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
    spawnLift: number,
    boardWidth: number,
    boardHeight: number
  ): void {
    const fontSize = Math.max(16, Math.round(cellSize * 0.95));
    const styleKey = String(fontSize);
    let style = this.styles.get(styleKey);
    if (!style) {
      style = new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize,
        fontWeight: '700',
        fill: REORG_FILL,
        align: 'center',
        padding: 8,
        dropShadow: {
          color: REORG_GLOW,
          alpha: 0.35,
          blur: 6,
          angle: 0,
          distance: 0,
        },
      });
      this.styles.set(styleKey, style);
    }
    const token = `${styleKey}|${pop.text}`;
    if (boundText.get(text) !== token) {
      boundText.set(text, token);
      text.style = style;
      text.text = pop.text;
    }
    const scale = pointChangePopScale(pop.alpha);
    const rawX = pop.col * colSize + colSize / 2;
    const rawY = pop.row * rowSize + rowSize / 2 + pop.yOffsetPx + spawnLift;
    const measured = CanvasTextMetrics.measureText(pop.text || ' ', style).width;
    const glow = 16;
    const placed = placeOnBoard(
      rawX,
      rawY,
      (measured / 2 + glow) * scale,
      (fontSize / 2 + glow) * scale,
      boardWidth,
      boardHeight
    );
    text.position.set(Math.round(placed.x), Math.round(placed.y));
    text.scale.set(scale);
    keepPopOnBoard(text, boardWidth, boardHeight);
    text.alpha = pop.alpha * REORG_ALPHA;
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
        fill: REORG_FILL,
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
  for (const pop of pops) {
    const fontSize = Math.max(16, Math.round(cellSize * 0.95));
    ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#f0c14d';
    ctx.shadowColor = 'rgba(255, 224, 154, 0.35)';
    ctx.shadowBlur = 6;
    ctx.globalAlpha = pop.alpha * REORG_ALPHA;
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
