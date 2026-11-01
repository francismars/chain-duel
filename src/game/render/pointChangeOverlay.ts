import { CanvasTextMetrics, Container, Text, TextStyle } from 'pixi.js';
import type { GridPos, PointChange } from '@/game/engine/types';
import { pixiTextResolution } from '@/game/render/pixiTextResolution';
import type { PointPopupMode } from '@/lib/graphicsSettings';

const GAIN_FILL = 0x6fd4a8;
const LOSS_FILL = 0xe85a4a;
const GAIN_GLOW = 0x88e0b8;
const LOSS_GLOW = 0xff7a6a;
const LABEL_SIZE_RATIO = 0.52;
const LABEL_ALPHA = 0.58;
const POP_FONT_SCALE = 0.92;
const GAIN_SIZE_SCALE = 0.8;
const LOSS_SIZE_SCALE = 0.66;
const SATS_LABEL = 'sats';

type GlowTier = 's' | 'm' | 'l';

type PopSpec = {
  mainText: string;
  labelText: string;
  rateText?: string;
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
  rate: Text;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Keep a centered popup inside the board. Heads near the edge were clipping the word. */
export function placeOnBoard(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  boardWidth: number,
  boardHeight: number
): { x: number; y: number } {
  const axis = (value: number, half: number, limit: number) => {
    if (!(limit > 16)) return value;
    const pad = Math.min(Math.max(8, half), Math.max(8, limit / 2 - 1));
    return clamp(value, pad, Math.max(pad, limit - pad));
  };
  return {
    x: axis(x, halfW, boardWidth),
    y: axis(y, halfH, boardHeight),
  };
}

/** How far to move a box so it sits inside the board. */
export function shiftToFit(
  left: number,
  top: number,
  right: number,
  bottom: number,
  boardWidth: number,
  boardHeight: number,
  margin = 8
): { dx: number; dy: number } {
  if (!(right > left + 1) || !(bottom > top + 1)) return { dx: 0, dy: 0 };
  if (!(boardWidth > 16) || !(boardHeight > 16)) return { dx: 0, dy: 0 };
  let dx = 0;
  let dy = 0;
  if (right > boardWidth - margin) dx -= right - (boardWidth - margin);
  if (left + dx < margin) dx += margin - (left + dx);
  if (bottom > boardHeight - margin) dy -= bottom - (boardHeight - margin);
  if (top + dy < margin) dy += margin - (top + dy);
  return { dx, dy };
}

/** After Pixi has a real texture, pull any leftover overflow back onto the board. */
export function keepPopOnBoard(
  node: Container,
  boardWidth: number,
  boardHeight: number
): void {
  const bounds = node.getBounds();
  const box = bounds as {
    x: number;
    y: number;
    width: number;
    height: number;
    minX?: number;
    minY?: number;
    maxX?: number;
    maxY?: number;
  };
  const left = box.minX ?? box.x;
  const top = box.minY ?? box.y;
  const right = box.maxX ?? left + box.width;
  const bottom = box.maxY ?? top + box.height;
  const { dx, dy } = shiftToFit(
    left,
    top,
    right,
    bottom,
    boardWidth,
    boardHeight
  );
  if (dx !== 0) node.position.x += dx;
  if (dy !== 0) node.position.y += dy;
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

/** Horizontal drift is disabled — pops only rise. */
export function pointChangeDriftX(_alpha: number, _outward: -1 | 1): number {
  return 0;
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

/** Pixi rebuilds a text texture when `.text` or `.style` is set, even to the same value. */
const boundText = new WeakMap<Text, { style: TextStyle; value: string }>();

function bindText(text: Text, style: TextStyle, value: string): void {
  const previous = boundText.get(text);
  if (previous && previous.style === style && previous.value === value) return;
  boundText.set(text, { style, value });
  text.style = style;
  text.text = value;
}

function makePointChangeStyle(
  fontSize: number,
  tier: GlowTier,
  isGain: boolean,
  label = false,
  glow = true
): TextStyle {
  return new TextStyle({
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize,
    fontWeight: label ? '600' : '700',
    fill: isGain ? GAIN_FILL : LOSS_FILL,
    padding: label ? 4 : 6,
    // The glow is a canvas shadowBlur at rasterize time, slow in Safari.
    dropShadow: glow && {
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

/** Styles are cached per overlay, so the TextStyle object identifies the font. */
let popWidthCache = new WeakMap<TextStyle, Map<string, number>>();

function measurePopTextWidth(text: string, style: TextStyle): number {
  let widths = popWidthCache.get(style);
  if (!widths) {
    widths = new Map();
    popWidthCache.set(style, widths);
  }
  let width = widths.get(text);
  if (width === undefined) {
    width = CanvasTextMetrics.measureText(text, style).width;
    widths.set(text, width);
  }
  return width;
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
  bindText(main, mainStyle, mainText);
  bindText(label, labelStyle, labelText);

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
    rateText: change.captureRateLabel,
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
    change.gainPos ?? (change.player === 'P1' ? change.p1Pos : change.p2Pos);
  const loss =
    change.lossPos ?? (change.player === 'P1' ? change.p2Pos : change.p1Pos);
  return { gain, loss };
}

function buildPopSpecs(
  change: PointChange,
  colSize: number,
  rowSize: number
): PopSpec[] {
  // Clear the chain. A shorter lift dropped the green number onto a white
  // head, where it disappeared, and left only the word beside the chain.
  const spawnLift = -rowSize * 1.25;
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
  const fontSize =
    pointChangeFontSize(spec.value, cellSize) *
    (spec.isGain ? GAIN_SIZE_SCALE : LOSS_SIZE_SCALE);
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

  if (spec.rateText && spec.isGain) {
    const rateSize = Math.max(10, fontSize * 0.72);
    ctx.textAlign = 'center';
    ctx.globalAlpha = baseAlpha;
    ctx.font = `700 ${Math.round(rateSize)}px Inter, system-ui, sans-serif`;
    drawFilledText(ctx, spec.rateText, 0, -fontSize * 0.95, fill);
  }

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
  /** Slots claimed during the current render() call. */
  private claimed = new Set<PopSlot>();

  private readonly glow: boolean;
  private readonly simple: boolean;

  /** Config → Graphics → Point popups; `textResolution` comes from the match canvas. */
  constructor(
    private readonly mode: PointPopupMode = 'full',
    private readonly textResolution = pixiTextResolution(1)
  ) {
    this.glow = mode === 'full';
    this.simple = mode === 'simple';
  }

  private style(
    fontSize: number,
    tier: GlowTier,
    isGain: boolean,
    label: boolean
  ): TextStyle {
    const key = styleCacheKey(fontSize, tier, isGain, label);
    let style = this.styleCache.get(key);
    if (!style) {
      style = makePointChangeStyle(fontSize, tier, isGain, label, this.glow);
      this.styleCache.set(key, style);
    }
    return style;
  }

  hide(): void {
    for (const slot of this.pool) {
      slot.root.visible = false;
    }
  }

  /**
   * Every popup has faded: free the pooled Texts (and their GPU textures) and
   * the measured widths, instead of holding them for the rest of the match.
   */
  release(): void {
    if (this.pool.length === 0) return;
    for (const slot of this.pool) {
      boundText.delete(slot.main);
      boundText.delete(slot.label);
      boundText.delete(slot.rate);
      slot.root.destroy({ children: true });
    }
    this.pool = [];
    this.claimed.clear();
    popWidthCache = new WeakMap();
  }

  render(
    changes: readonly PointChange[],
    colSize: number,
    rowSize: number,
    boardWidth = Number.POSITIVE_INFINITY,
    boardHeight = Number.POSITIVE_INFINITY
  ): void {
    if (changes.length === 0 || this.mode === 'off') {
      this.release();
      return;
    }

    const cellSize = Math.min(colSize, rowSize);
    this.claimed.clear();

    for (const change of changes) {
      for (const spec of buildPopSpecs(change, colSize, rowSize)) {
        const fontSize = Math.round(
          pointChangeFontSize(spec.value, cellSize) *
            (spec.isGain ? GAIN_SIZE_SCALE : LOSS_SIZE_SCALE)
        );
        const labelSize = Math.max(9, Math.round(fontSize * LABEL_SIZE_RATIO));
        const tier = glowTier(spec.value);
        const mainStyle = this.style(fontSize, tier, spec.isGain, false);
        const labelStyle = this.style(labelSize, tier, spec.isGain, true);
        const slot = this.acquire(mainStyle, spec.mainText);

        layoutPopTexts(
          slot.main,
          slot.label,
          mainStyle,
          labelStyle,
          spec.mainText,
          spec.labelText,
          fontSize
        );
        // Simple: the number alone, centred, without the "sats" word or tier line.
        slot.label.visible = !this.simple;
        const mainW = measurePopTextWidth(spec.mainText, mainStyle);
        if (this.simple) slot.main.position.set(-mainW / 2, 0);
        let rateW = 0;
        if (spec.rateText && spec.isGain && !this.simple) {
          const rateSize = Math.max(10, Math.round(fontSize * 0.72));
          const rateStyle = this.style(rateSize, tier, true, false);
          bindText(slot.rate, rateStyle, spec.rateText);
          slot.rate.position.set(0, Math.round(-fontSize * 0.95));
          slot.rate.visible = true;
          slot.rate.alpha = 1;
          rateW = measurePopTextWidth(spec.rateText, rateStyle);
        } else {
          slot.rate.visible = false;
        }

        const scale = this.simple ? 1 : pointChangePopScale(spec.alpha);
        // Text.width stays 0 until Pixi uploads the texture, so a head at the
        // edge kept the word off the board. Measure the string instead.
        const rowW = this.simple
          ? mainW
          : mainW +
            fontSize * 0.12 +
            measurePopTextWidth(spec.labelText, labelStyle);
        const glow = this.glow ? 14 : 2;
        const halfW = (Math.max(rowW, rateW) / 2 + glow) * scale;
        const halfH = (fontSize * (rateW > 0 ? 1.55 : 0.7) + glow) * scale;
        const placed = placeOnBoard(
          Math.round(spec.x + pointChangeDriftX(spec.alpha, spec.drift)),
          Math.round(spec.y),
          halfW,
          halfH,
          boardWidth,
          boardHeight
        );
        slot.root.position.set(placed.x, placed.y);
        slot.root.scale.set(scale);
        keepPopOnBoard(slot.root, boardWidth, boardHeight);

        slot.main.alpha = 1;
        slot.label.alpha = LABEL_ALPHA;
        slot.root.alpha = spec.alpha * (spec.isGain ? 1 : 0.9);
        slot.root.visible = true;
      }
    }

    for (const slot of this.pool) {
      if (!this.claimed.has(slot)) slot.root.visible = false;
    }
  }

  /**
   * Prefer a slot whose main text already shows this number. When the oldest
   * pop expires the rest shift down the list; matching by index rebound every
   * Text and re-rasterized its glow, which stalled Safari on each reward.
   */
  private acquire(mainStyle: TextStyle, mainText: string): PopSlot {
    let fallback: PopSlot | null = null;
    for (const slot of this.pool) {
      if (this.claimed.has(slot)) continue;
      const bound = boundText.get(slot.main);
      if (bound && bound.style === mainStyle && bound.value === mainText) {
        this.claimed.add(slot);
        return slot;
      }
      // Hidden slots are free to reuse; visible ones may match a later pop.
      if (!fallback || (fallback.root.visible && !slot.root.visible)) {
        fallback = slot;
      }
    }
    if (fallback && !fallback.root.visible) {
      this.claimed.add(fallback);
      return fallback;
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
      text.resolution = this.textResolution;
      text.roundPixels = true;
    }
    const rate = new Text({
      text: '',
      style: makePointChangeStyle(11, 's', true, true),
    });
    rate.anchor.set(0.5, 0.5);
    rate.resolution = this.textResolution;
    rate.roundPixels = true;
    root.addChild(rate);
    root.addChild(main);
    root.addChild(label);
    this.container.addChild(root);

    const slot = { root, main, label, rate };
    this.pool.push(slot);
    this.claimed.add(slot);
    return slot;
  }
}
