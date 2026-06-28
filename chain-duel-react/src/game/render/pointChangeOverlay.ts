import { CanvasTextMetrics, Container, Text, TextStyle } from 'pixi.js';
import type { GridPos, PointChange } from '@/game/engine/types';
import { pixiTextResolution } from '@/game/render/pixiTextResolution';

const GAIN_FILL = 0x6fd4a8;
const LOSS_FILL = 0xe85a4a;
const GAIN_GLOW = 0x88e0b8;
const LOSS_GLOW = 0xff7a6a;
const LABEL_SIZE_RATIO = 0.52;
const LABEL_ALPHA = 0.58;
const POP_FONT_SCALE = 0.92;
const SATS_LABEL = 'sats';

type GlowTier = 's' | 'm' | 'l';

type PopSpec = {
  mainText: string;
  labelText: string;
  x: number;
  y: number;
  value: number;
  isGain: boolean;
  alpha: number;
  drift: -1 | 1;
};

type PopSlot = {
  root: Container;
  main: Text;
  label: Text;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 0 at spawn, 1 as the pop fades out. */
export function pointChangeLifeProgress(alpha: number): number {
  return clamp(1 - alpha, 0, 1);
}

/** Quick pop-in at spawn, then settles to 1.0. */
export function pointChangePopScale(alpha: number): number {
  const life = pointChangeLifeProgress(alpha);
  const pop = 1 - Math.pow(1 - Math.min(1, life * 7), 3);
  return 1 + 0.3 * (1 - pop);
}

/** Bigger steals read larger on the board. */
export function pointChangeFontSize(value: number, cellSize: number): number {
  const base = Math.max(13, cellSize * 0.82);
  const tier = Math.min(1, Math.log10(Math.max(2, value)) / 2.2);
  return base * (1 + tier * 0.38) * POP_FONT_SCALE;
}

/** Drift away from center so gain/loss feel directional. */
export function pointChangeDriftX(alpha: number, outward: -1 | 1): number {
  const life = pointChangeLifeProgress(alpha);
  return outward * life * life * 11;
}

function glowTier(value: number): GlowTier {
  if (value >= 150) return 'l';
  if (value >= 40) return 'm';
  return 's';
}

function glowBlur(tier: GlowTier, isGain: boolean): number {
  const base = isGain ? 8 : 6;
  const spread = isGain ? 8 : 5;
  return base + (tier === 'l' ? spread : tier === 'm' ? spread * 0.55 : 0);
}

function styleCacheKey(
  fontSize: number,
  tier: GlowTier,
  isGain: boolean,
  label = false
): string {
  return `${label ? 'l' : 'm'}-${isGain ? 'g' : 'l'}-${fontSize}-${tier}`;
}

function makePointChangeStyle(
  fontSize: number,
  tier: GlowTier,
  isGain: boolean,
  label = false
): TextStyle {
  return new TextStyle({
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize,
    fontWeight: label ? '600' : '700',
    fill: isGain ? GAIN_FILL : LOSS_FILL,
    padding: label ? 4 : 6,
    dropShadow: {
      color: isGain ? GAIN_GLOW : LOSS_GLOW,
      alpha: label ? 0.35 : isGain ? 0.7 : 0.58,
      blur: label ? glowBlur(tier, isGain) * 0.45 : glowBlur(tier, isGain),
      angle: 0,
      distance: 0,
    },
  });
}

function sameGridPos(a: GridPos, b: GridPos): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function yOffsetForPop(change: PointChange, pos: GridPos): number {
  if (sameGridPos(pos, change.p1Pos)) return change.p1YOffsetPx;
  if (sameGridPos(pos, change.p2Pos)) return change.p2YOffsetPx;
  return change.p1YOffsetPx;
}

function measurePopTextWidth(text: string, style: TextStyle): number {
  return CanvasTextMetrics.measureText(text, style).width;
}

/** Left edge X for main/label in a centered pop row. */
export function computePopLayout(
  mainW: number,
  labelW: number,
  fontSize: number
): { mainX: number; labelX: number } {
  const gap = fontSize * 0.12;
  const totalW = mainW + gap + labelW;
  const left = -totalW / 2;
  return { mainX: left, labelX: left + mainW + gap };
}

/** Left-anchored row; widths from metrics, not stale Text.width after pool reuse. */
export function layoutPopTexts(
  main: Text,
  label: Text,
  mainStyle: TextStyle,
  labelStyle: TextStyle,
  mainText: string,
  labelText: string,
  fontSize: number
): void {
  main.style = mainStyle;
  label.style = labelStyle;
  main.text = mainText;
  label.text = labelText;

  const mainW = measurePopTextWidth(mainText, mainStyle);
  const labelW = measurePopTextWidth(labelText, labelStyle);
  const { mainX, labelX } = computePopLayout(mainW, labelW, fontSize);

  main.position.set(mainX, 0);
  label.position.set(labelX, 1);
}

function popScreenPos(
  pos: GridPos,
  yOffsetPx: number,
  colSize: number,
  rowSize: number,
  spawnLift: number
): { x: number; y: number } {
  return {
    x: pos[0] * colSize + colSize / 2,
    y: pos[1] * rowSize + rowSize / 2 + yOffsetPx + spawnLift,
  };
}

function outwardDrift(gainX: number, lossX: number, isGain: boolean): -1 | 1 {
  if (gainX === lossX) return isGain ? -1 : 1;
  return isGain ? (gainX < lossX ? -1 : 1) : lossX < gainX ? 1 : -1;
}

function gainSpec(
  change: PointChange,
  x: number,
  y: number,
  drift: -1 | 1
): PopSpec {
  return {
    mainText: `+${change.value}`,
    labelText: SATS_LABEL,
    x,
    y,
    value: change.value,
    isGain: true,
    alpha: change.alpha,
    drift,
  };
}

function lossSpec(
  change: PointChange,
  x: number,
  y: number,
  drift: -1 | 1
): PopSpec {
  return {
    mainText: `-${change.value}`,
    labelText: SATS_LABEL,
    x,
    y,
    value: change.value,
    isGain: false,
    alpha: change.alpha,
    drift,
  };
}

function resolveGainLossPos(change: PointChange): {
  gain: GridPos;
  loss: GridPos;
} {
  const gain =
    change.gainPos ??
    (change.player === 'P1' ? change.p1Pos : change.p2Pos);
  const loss =
    change.lossPos ??
    (change.player === 'P1' ? change.p2Pos : change.p1Pos);
  return { gain, loss };
}

function buildPopSpecs(
  change: PointChange,
  colSize: number,
  rowSize: number
): PopSpec[] {
  const spawnLift = -rowSize * 0.42;
  const { gain: gainPos, loss: lossPos } = resolveGainLossPos(change);

  const gain = popScreenPos(
    gainPos,
    yOffsetForPop(change, gainPos),
    colSize,
    rowSize,
    spawnLift
  );
  const loss = popScreenPos(
    lossPos,
    yOffsetForPop(change, lossPos),
    colSize,
    rowSize,
    spawnLift
  );
  const drift = outwardDrift(gain.x, loss.x, true);
  return [
    gainSpec(change, gain.x, gain.y, drift),
    lossSpec(change, loss.x, loss.y, outwardDrift(gain.x, loss.x, false)),
  ];
}

function drawFilledText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string
): void {
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawPopCanvas(
  ctx: CanvasRenderingContext2D,
  spec: PopSpec,
  cellSize: number
): void {
  const scale = pointChangePopScale(spec.alpha);
  const fontSize = pointChangeFontSize(spec.value, cellSize);
  const labelSize = Math.max(9, fontSize * LABEL_SIZE_RATIO);
  const dx = pointChangeDriftX(spec.alpha, spec.drift);
  const tier = glowTier(spec.value);

  const fill = spec.isGain ? '#6fd4a8' : '#e85a4a';
  const baseAlpha = spec.alpha * (spec.isGain ? 1 : 0.9);

  ctx.save();
  ctx.translate(Math.round(spec.x + dx), Math.round(spec.y));
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';
  ctx.shadowColor = spec.isGain
    ? 'rgba(111, 212, 168, 0.5)'
    : 'rgba(232, 90, 74, 0.5)';
  ctx.shadowBlur = glowBlur(tier, spec.isGain);

  ctx.font = `700 ${Math.round(fontSize)}px Inter, system-ui, sans-serif`;
  const mainW = ctx.measureText(spec.mainText).width;
  ctx.font = `600 ${Math.round(labelSize)}px Inter, system-ui, sans-serif`;
  const labelW = ctx.measureText(spec.labelText).width;
  const totalW = mainW + fontSize * 0.12 + labelW;

  let cursorX = -totalW / 2;
  ctx.textAlign = 'left';
  ctx.globalAlpha = baseAlpha;
  ctx.font = `700 ${Math.round(fontSize)}px Inter, system-ui, sans-serif`;
  drawFilledText(ctx, spec.mainText, cursorX, 0, fill);
  cursorX += mainW + fontSize * 0.12;
  ctx.globalAlpha = baseAlpha * LABEL_ALPHA;
  ctx.font = `600 ${Math.round(labelSize)}px Inter, system-ui, sans-serif`;
  ctx.shadowBlur = glowBlur(tier, spec.isGain) * 0.45;
  drawFilledText(ctx, spec.labelText, cursorX, 1, fill);

  ctx.restore();
}

export function drawPointChangesCanvas(
  ctx: CanvasRenderingContext2D,
  changes: readonly PointChange[],
  colSize: number,
  rowSize: number
): void {
  const cellSize = Math.min(colSize, rowSize);
  for (const change of changes) {
    for (const spec of buildPopSpecs(change, colSize, rowSize)) {
      drawPopCanvas(ctx, spec, cellSize);
    }
  }
}

export class PointChangeOverlay {
  readonly container = new Container();

  private pool: PopSlot[] = [];
  private styleCache = new Map<string, TextStyle>();

  hide(): void {
    for (const slot of this.pool) {
      slot.root.visible = false;
    }
  }

  render(
    changes: readonly PointChange[],
    colSize: number,
    rowSize: number
  ): void {
    if (changes.length === 0) {
      this.hide();
      return;
    }

    const cellSize = Math.min(colSize, rowSize);
    let used = 0;

    for (const change of changes) {
      for (const spec of buildPopSpecs(change, colSize, rowSize)) {
        const slot = this.acquire(used);
        used += 1;

        const fontSize = Math.round(pointChangeFontSize(spec.value, cellSize));
        const labelSize = Math.max(9, Math.round(fontSize * LABEL_SIZE_RATIO));
        const tier = glowTier(spec.value);

        const mainKey = styleCacheKey(fontSize, tier, spec.isGain, false);
        let mainStyle = this.styleCache.get(mainKey);
        if (!mainStyle) {
          mainStyle = makePointChangeStyle(fontSize, tier, spec.isGain, false);
          this.styleCache.set(mainKey, mainStyle);
        }

        const labelKey = styleCacheKey(labelSize, tier, spec.isGain, true);
        let labelStyle = this.styleCache.get(labelKey);
        if (!labelStyle) {
          labelStyle = makePointChangeStyle(labelSize, tier, spec.isGain, true);
          this.styleCache.set(labelKey, labelStyle);
        }

        layoutPopTexts(
          slot.main,
          slot.label,
          mainStyle,
          labelStyle,
          spec.mainText,
          spec.labelText,
          fontSize
        );
        slot.label.visible = true;

        const x = Math.round(spec.x + pointChangeDriftX(spec.alpha, spec.drift));
        const y = Math.round(spec.y);
        slot.root.position.set(x, y);

        const scale = pointChangePopScale(spec.alpha);
        slot.root.scale.set(scale);

        slot.main.alpha = 1;
        slot.label.alpha = LABEL_ALPHA;
        slot.root.alpha = spec.alpha * (spec.isGain ? 1 : 0.9);
        slot.root.visible = true;
      }
    }

    for (let i = used; i < this.pool.length; i += 1) {
      this.pool[i].root.visible = false;
    }
  }

  private acquire(index: number): PopSlot {
    if (index < this.pool.length) {
      return this.pool[index];
    }

    const root = new Container();
    const main = new Text({
      text: '',
      style: makePointChangeStyle(16, 's', true, false),
    });
    const label = new Text({
      text: SATS_LABEL,
      style: makePointChangeStyle(9, 's', true, true),
    });
    for (const text of [main, label]) {
      text.anchor.set(0, 0.5);
      text.resolution = pixiTextResolution();
      text.roundPixels = true;
    }
    root.addChild(main);
    root.addChild(label);
    this.container.addChild(root);

    const slot = { root, main, label };
    this.pool.push(slot);
    return slot;
  }
}
