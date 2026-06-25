import { Container, Text, TextStyle } from 'pixi.js';
import {
  computeCanvasObjectivesLayout,
  computeInstructionCycleFrame,
  instructionBlockHeight,
  MATCH_OBJECTIVES,
  MATCH_OBJECTIVE_DROP_SHADOW,
  OBJECTIVE_TITLE_FONT,
  OBJECTIVE_TITLE_STROKE_ALIGNMENT,
  START_WORD_SHADOW_PAD,
  applyCanvasTextDropShadow,
  clearCanvasTextDropShadow,
  objectiveTitleStrokeWidth,
  type CanvasObjectivesLayout,
  type CanvasObjectivesOpts,
} from '@/game/render/matchObjectives';

const FADE_DELAY_MS = 900;
const FADE_DURATION_MS = 420;
const INSTRUCTION_FONT = 'Inter, system-ui, sans-serif';

/** Stroke-only Bureau title; Pixi skips fill pass only when `_fill` is undefined. */
function createObjectiveTitleTextStyle(titlePx: number): TextStyle {
  const titleStyle = new TextStyle({
    fontFamily: OBJECTIVE_TITLE_FONT,
    fontSize: titlePx,
    fontWeight: '500',
    letterSpacing: 1.2,
    align: 'center',
    padding: START_WORD_SHADOW_PAD,
    dropShadow: { ...MATCH_OBJECTIVE_DROP_SHADOW },
    stroke: {
      color: '#ffffff',
      width: objectiveTitleStrokeWidth(titlePx),
      alignment: OBJECTIVE_TITLE_STROKE_ALIGNMENT,
      join: 'round',
      cap: 'round',
    },
  });
  titleStyle.fill = null!;
  (titleStyle as unknown as { _fill?: unknown })._fill = undefined;
  return titleStyle;
}

type HintCard = {
  root: Container;
  title: Text;
  body: Text;
};

export class CanvasObjectivesOverlay {
  readonly container = new Container();

  private cards: HintCard[] = [];
  private stakes = new Text({ text: '', style: new TextStyle() });
  private layoutKey = '';
  private bodyY = 0;
  private stakesY = 0;

  constructor() {
    this.container.cullable = false;
    for (const item of MATCH_OBJECTIVES) {
      const root = new Container();
      root.cullable = false;
      const title = new Text({
        text: item.title.toUpperCase(),
        style: new TextStyle(),
      });
      const body = new Text({ text: item.body, style: new TextStyle() });
      title.anchor.set(0.5, 0);
      body.anchor.set(0.5, 0);
      title.resolution = 2;
      body.resolution = 2;
      title.cullable = false;
      body.cullable = false;
      root.addChild(title);
      root.addChild(body);
      root.visible = false;
      root.alpha = 0;
      this.container.addChild(root);
      this.cards.push({ root, title, body });
    }
    this.stakes.anchor.set(0.5, 0);
    this.stakes.resolution = 2;
    this.stakes.cullable = false;
    this.stakes.visible = false;
    this.container.addChild(this.stakes);
    this.container.visible = false;
    this.container.alpha = 0;
  }

  hide(): void {
    this.container.visible = false;
    this.container.alpha = 0;
    this.layoutKey = '';
    for (const card of this.cards) {
      card.root.visible = false;
      card.root.alpha = 0;
      card.title.scale.set(1);
      card.title.position.set(0, 0);
      card.body.alpha = 1;
      card.body.position.set(0, this.bodyY);
    }
    this.stakes.visible = false;
  }

  setAlpha(alpha: number): void {
    this.container.visible = alpha > 0.02;
    this.container.alpha = alpha;
  }

  render(
    width: number,
    height: number,
    startFontSize: number,
    opts: CanvasObjectivesOpts,
    startRevealTime: number
  ): CanvasObjectivesLayout {
    const layout = computeCanvasObjectivesLayout(
      width,
      height,
      startFontSize,
      opts
    );
    const token = `${width}x${height}:${layout.instructionTop}:${opts.stakesHint ?? ''}`;
    if (token !== this.layoutKey) {
      this.layoutKey = token;
      this.applyLayout(layout, opts);
    }

    const overlayElapsed =
      startRevealTime === -1
        ? 0
        : Math.max(0, performance.now() - startRevealTime - FADE_DELAY_MS);
    const overlayT = Math.min(1, overlayElapsed / FADE_DURATION_MS);
    const overlayEased = 1 - Math.pow(1 - overlayT, 3);

    const cycleElapsed = Math.max(0, overlayElapsed - 180);
    const frame = computeInstructionCycleFrame(cycleElapsed);
    const cardAlpha = frame.alpha * overlayEased;

    for (let i = 0; i < this.cards.length; i += 1) {
      const card = this.cards[i];
      const active = i === frame.index && cardAlpha > 0.02;
      card.root.visible = active;
      card.root.alpha = active ? cardAlpha : 0;
      card.root.position.set(width / 2, layout.instructionTop);
      card.title.scale.set(frame.titleScale);
      card.title.position.set(0, frame.titleOffsetY);
      card.body.alpha = frame.bodyAlpha;
      card.body.position.set(0, this.bodyY + frame.bodyOffsetY);
    }

    if (opts.stakesHint) {
      this.stakes.visible = cardAlpha > 0.02;
      this.stakes.alpha = cardAlpha;
      this.stakes.position.set(width / 2, layout.instructionTop + this.stakesY);
    } else {
      this.stakes.visible = false;
    }

    this.container.visible = cardAlpha > 0.02;
    this.container.alpha = 1;

    return layout;
  }

  private applyLayout(
    layout: CanvasObjectivesLayout,
    opts: CanvasObjectivesOpts
  ): void {
    const { instructionW, titlePx, bodyPx, footerPx, titleBodyGap } = layout;
    this.bodyY = titlePx + titleBodyGap;
    this.stakesY =
      instructionBlockHeight(layout, opts.stakesHint) -
      (opts.stakesHint ? footerPx * 1.5 : 0) +
      titleBodyGap * 0.4;

    const titleStyle = createObjectiveTitleTextStyle(titlePx);

    const bodyStyle = new TextStyle({
      fontFamily: INSTRUCTION_FONT,
      fill: 'rgba(255,255,255,0.88)',
      fontSize: bodyPx,
      fontWeight: '400',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: instructionW,
      lineHeight: bodyPx * 1.45,
      breakWords: true,
      padding: START_WORD_SHADOW_PAD,
      dropShadow: { ...MATCH_OBJECTIVE_DROP_SHADOW },
    });

    for (const card of this.cards) {
      card.title.style = titleStyle;
      card.body.style = bodyStyle;
      card.title.position.set(0, 0);
      card.body.position.set(0, this.bodyY);
    }

    if (opts.stakesHint) {
      this.stakes.text = opts.stakesHint;
      this.stakes.style = new TextStyle({
        fontFamily: INSTRUCTION_FONT,
        fill: '#ffcc99',
        fontSize: footerPx,
        fontWeight: '500',
        align: 'center',
        wordWrap: true,
        wordWrapWidth: instructionW,
      });
    }
  }
}

export function drawCanvasObjectivesFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
  layout: CanvasObjectivesLayout,
  opts: CanvasObjectivesOpts,
  alpha: number,
  cycleElapsedMs: number
): void {
  if (alpha < 0.02) return;

  const frame = computeInstructionCycleFrame(cycleElapsedMs);
  const item = MATCH_OBJECTIVES[frame.index];
  const {
    instructionTop,
    instructionW,
    titlePx,
    bodyPx,
    footerPx,
    titleBodyGap,
    bodyBlockH,
  } = layout;
  const bodyY = titlePx + titleBodyGap;
  const cx = width / 2;
  const cy = instructionTop;
  const drawAlpha = alpha * frame.alpha;
  if (drawAlpha < 0.02) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleFontPx = Math.floor(titlePx);
  const titleStroke = objectiveTitleStrokeWidth(titleFontPx);

  ctx.save();
  ctx.globalAlpha = drawAlpha;
  ctx.translate(cx, cy + frame.titleOffsetY);
  ctx.scale(frame.titleScale, frame.titleScale);
  applyCanvasTextDropShadow(ctx);
  ctx.font = `500 ${titleFontPx}px ${OBJECTIVE_TITLE_FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = titleStroke;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(item.title.toUpperCase(), 0, 0);
  clearCanvasTextDropShadow(ctx);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = drawAlpha * frame.bodyAlpha;
  ctx.translate(cx, cy + bodyY + frame.bodyOffsetY);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `400 ${Math.floor(bodyPx)}px Inter, system-ui, sans-serif`;
  wrapFillText(ctx, item.body, 0, 0, instructionW, bodyPx * 1.45);
  ctx.restore();

  if (opts.stakesHint) {
    ctx.save();
    ctx.globalAlpha = drawAlpha * frame.bodyAlpha;
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffcc99';
    ctx.font = `500 ${Math.floor(footerPx)}px Inter, system-ui, sans-serif`;
    ctx.fillText(
      opts.stakesHint,
      0,
      bodyY + bodyBlockH + titleBodyGap * 0.4 + frame.bodyOffsetY
    );
    ctx.restore();
  }

  ctx.restore();
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(' ');
  let line = '';
  let ly = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, ly);
      ly += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, ly);
}
