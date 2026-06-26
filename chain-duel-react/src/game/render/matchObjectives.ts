/** Shared copy for pre-match objectives (canvas + any HUD reference). */
import type { PlayerControlSlot } from '@/lib/controls/playerControls';

export const MATCH_OBJECTIVES = [
  {
    title: 'GROW',
    body: 'Longer chains steal more sats on every capture.',
  },
  {
    title: 'SURVIVE',
    body: 'Crash resets you to genesis. Keep playing.',
  },
  {
    title: 'WIN',
    body: 'Zero-sum pot. Drain your rival to 0 sats.',
  },
] as const;

export const INSTRUCTION_CYCLE_MS = 3600;
export const INSTRUCTION_REVEAL_FRAC = 0.14;
export const INSTRUCTION_HIDE_FRAC = 0.16;

export const OBJECTIVE_TITLE_FONT = 'BureauGrotesque';

export function objectiveTitleStrokeWidth(fontSize: number): number {
  return Math.max(1, Math.round(fontSize * 0.028));
}

/** Pixi/canvas text stroke centered on the glyph path (matches CSS text-stroke). */
export const OBJECTIVE_TITLE_STROKE_ALIGNMENT = 0.5;

/** Drop-shadow padding on BureauGrotesque start words (see pixiRenderer startWordStyle). */
export const START_WORD_SHADOW_PAD = 48;
export const START_WORD_SHADOW_BLUR = 44;

/** Shared pre-match text glow (start prompt + objective hints). */
export const MATCH_OBJECTIVE_DROP_SHADOW = {
  color: '#000000',
  alpha: 0.95,
  blur: START_WORD_SHADOW_BLUR,
  angle: 0,
  distance: 0,
} as const;

export function applyCanvasTextDropShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = `rgba(0, 0, 0, ${MATCH_OBJECTIVE_DROP_SHADOW.alpha})`;
  ctx.shadowBlur = MATCH_OBJECTIVE_DROP_SHADOW.blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function clearCanvasTextDropShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export const START_PROMPT_WORDS = [
  'PRESS',
  'BUTTON',
  'TO',
  'START',
] as const;

/** Online arena: both players confirm before countdown. */
export const ONLINE_START_PROMPT_WORDS = [
  'WAITING',
  'BOTH',
  'PLAYERS',
] as const;

export const START_PROMPT_GAP_RATIO = 0.22;

/** Extra space below objective hints — nudges start prompt down without moving hints. */
export const START_PROMPT_Y_OFFSET_RATIO = 0.14;

/** BureauGrotesque avg glyph width as a fraction of font size (fallback only). */
export const START_PROMPT_CHAR_WIDTH_RATIO = 0.38;

/** Conservative horizontal budget — drop shadow bleeds past glyph metrics. */
export const START_PROMPT_MAX_WIDTH_FRAC = 0.86;

export function baseStartPromptFontSize(width: number, height: number): number {
  const compact = width < 560 || height < 260;
  return compact
    ? Math.max(12, (width / 14) * 1.05, height / 5.5)
    : Math.max(10, (width / 17) * 1.12);
}

export function fitStartPromptFontSize(
  width: number,
  height: number,
  measureLineWidth: (fontSize: number) => number
): number {
  const maxW = width * START_PROMPT_MAX_WIDTH_FRAC;
  let fontSize = baseStartPromptFontSize(width, height);
  for (let i = 0; i < 16 && fontSize > 10; i++) {
    if (measureLineWidth(fontSize) <= maxW) {
      return fontSize;
    }
    fontSize = Math.max(10, fontSize * 0.9);
  }
  return Math.max(10, fontSize);
}

export function startPromptLineWidth(
  fontSize: number,
  wordWidths: readonly number[],
  gapRatio = START_PROMPT_GAP_RATIO
): number {
  const gap = fontSize * gapRatio;
  let total = 0;
  for (const w of wordWidths) {
    total += w;
  }
  if (wordWidths.length > 1) {
    total += gap * (wordWidths.length - 1);
  }
  return total;
}

/** Pixi/canvas may report 0 until BureauGrotesque metrics load — use a safe estimate. */
export function measureStartWordWidth(
  word: string,
  fontSize: number,
  measured = 0
): number {
  const estimate =
    fontSize * word.length * START_PROMPT_CHAR_WIDTH_RATIO;
  const minWidth = fontSize * 0.32;
  if (measured > 0) {
    return Math.max(measured, minWidth);
  }
  return Math.max(estimate, minWidth);
}

export type OnlineStartReadyState = {
  p1Ready: boolean;
  p2Ready: boolean;
  p1Label?: string;
  p2Label?: string;
  localSlot?: 'p1' | 'p2' | null;
};

export type CanvasObjectivesOpts = {
  stakesHint?: string;
  controlSlots?: readonly PlayerControlSlot[];
  onlineStartReady?: OnlineStartReadyState;
  /** Override default "PRESS BUTTON TO START" (e.g. online confirm flow). */
  startPromptWords?: readonly string[];
  /** Smaller Inter line under the start prompt (online confirm hint). */
  startPromptSubtext?: string;
};

export function resolveStartPromptWords(
  opts?: Pick<CanvasObjectivesOpts, 'startPromptWords'>
): readonly string[] {
  return opts?.startPromptWords ?? START_PROMPT_WORDS;
}

export type CanvasObjectivesLayout = {
  startY: number;
  instructionTop: number;
  instructionBlockH: number;
  instructionW: number;
  titlePx: number;
  bodyPx: number;
  titleBodyGap: number;
  bodyBlockH: number;
  footerPx: number;
};

export function instructionBlockHeight(
  layout: Pick<
    CanvasObjectivesLayout,
    'titlePx' | 'titleBodyGap' | 'bodyBlockH' | 'footerPx'
  >,
  stakesHint?: string
): number {
  return (
    layout.titlePx +
    layout.titleBodyGap +
    layout.bodyBlockH +
    (stakesHint ? layout.footerPx * 1.5 : 0)
  );
}

export function startPromptVisualReach(startFontSize: number): number {
  return (
    startFontSize * 0.5 +
    START_WORD_SHADOW_PAD +
    START_WORD_SHADOW_BLUR +
    20
  );
}

export function computeCanvasObjectivesLayout(
  width: number,
  height: number,
  startFontSize: number,
  opts: CanvasObjectivesOpts
): CanvasObjectivesLayout {
  const titlePx = startFontSize;
  const compact = width < 560 || height < 260;
  const bodyPx = compact
    ? Math.max(10, width * 0.016)
    : Math.max(11, width * 0.014);
  const footerPx = Math.max(8, bodyPx * 0.92);
  const instructionW = Math.min(width * 0.78, 440);
  const titleBodyGap = Math.max(bodyPx * 0.45, titlePx * 0.1);
  const bodyBlockH = bodyPx * 2.35;
  const layoutCore = {
    titlePx,
    bodyPx,
    titleBodyGap,
    bodyBlockH,
    footerPx,
  };
  const instructionBlockH = instructionBlockHeight(layoutCore, opts.stakesHint);

  const sectionGap = Math.max(80, startFontSize * 0.80);
  const stackTopInset = START_WORD_SHADOW_PAD;
  const stackBottomInset = START_WORD_SHADOW_PAD + START_WORD_SHADOW_BLUR;
  const stackHeight =
    stackTopInset +
    instructionBlockH +
    sectionGap +
    startFontSize +
    stackBottomInset;
  const stackTop = Math.max(8, (height - stackHeight) / 2);
  const instructionTop = stackTop + stackTopInset;
  const startPromptYOffset = Math.max(
    20,
    startFontSize * START_PROMPT_Y_OFFSET_RATIO
  );
  const startY =
    instructionTop +
    instructionBlockH +
    sectionGap +
    startFontSize * 0.5 +
    startPromptYOffset;

  return {
    startY,
    instructionTop,
    instructionBlockH,
    instructionW,
    ...layoutCore,
  };
}

export type InstructionCycleFrame = {
  index: number;
  alpha: number;
  titleScale: number;
  titleOffsetY: number;
  bodyAlpha: number;
  bodyOffsetY: number;
};

export const START_PROMPT_WORD_STAGGER_MS = 105;
export const START_PROMPT_WORD_DURATION_MS = 420;
export const START_PROMPT_STAGGER_DELAY_MS = 1000;
export const START_PROMPT_PULSE_PERIOD_MS = 3000;
export const START_PROMPT_PULSE_ALPHA_FLOOR = 0.66;

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInQuad(t: number): number {
  return t * t;
}

function easeOutBack(t: number, overshoot = 1.12): number {
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function startPromptRevealElapsedMs(
  now: number,
  startRevealTime: number
): number {
  if (startRevealTime === -1) return 0;
  return Math.max(0, now - startRevealTime - START_PROMPT_STAGGER_DELAY_MS);
}

export function startPromptWordRevealAlpha(revealElapsedMs: number, wordIndex: number): number {
  const t = Math.max(
    0,
    Math.min(
      1,
      (revealElapsedMs - wordIndex * START_PROMPT_WORD_STAGGER_MS) /
        START_PROMPT_WORD_DURATION_MS
    )
  );
  return easeOutCubic(t);
}

export function computeStartPromptPulse(
  revealElapsedMs: number,
  wordCount: number = START_PROMPT_WORDS.length
): number {
  const lastWordStart = Math.max(0, wordCount - 1) * START_PROMPT_WORD_STAGGER_MS;
  const revealCompleteAt = lastWordStart + START_PROMPT_WORD_DURATION_MS;
  if (revealElapsedMs < revealCompleteAt) {
    return 1;
  }

  const pulseElapsed = revealElapsedMs - revealCompleteAt;
  const phase =
    (pulseElapsed % START_PROMPT_PULSE_PERIOD_MS) / START_PROMPT_PULSE_PERIOD_MS;
  // Single smooth breath per cycle — synced across the whole line.
  const raw = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const beat = smoothstep(raw);
  return (
    START_PROMPT_PULSE_ALPHA_FLOOR + beat * (1 - START_PROMPT_PULSE_ALPHA_FLOOR)
  );
}

export function computeInstructionCycleFrame(
  elapsedMs: number,
  cycleMs = INSTRUCTION_CYCLE_MS
): InstructionCycleFrame {
  const cycleElapsed = Math.max(0, elapsedMs);
  const index =
    Math.floor(cycleElapsed / cycleMs) % MATCH_OBJECTIVES.length;
  const phase = (cycleElapsed % cycleMs) / cycleMs;
  const phaseMs = cycleElapsed % cycleMs;
  const revealEnd = INSTRUCTION_REVEAL_FRAC;
  const hideStart = 1 - INSTRUCTION_HIDE_FRAC;
  const holdPulse =
    1 + Math.sin((phaseMs / cycleMs) * Math.PI * 2 * 1.15) * 0.008;

  if (phase < revealEnd) {
    const t = phase / revealEnd;
    const alpha = easeOutCubic(t);
    const pop = easeOutBack(t);
    const titleScale = 0.94 + pop * 0.06;
    const titleOffsetY = (1 - alpha) * 8;
    const bodyDelay = 0.32;
    const bodyT =
      t <= bodyDelay ? 0 : (t - bodyDelay) / (1 - bodyDelay);
    const bodyAlpha = easeOutCubic(bodyT);
    const bodyOffsetY = (1 - bodyAlpha) * 6;
    return {
      index,
      alpha,
      titleScale,
      titleOffsetY,
      bodyAlpha: bodyAlpha * alpha,
      bodyOffsetY,
    };
  }
  if (phase > hideStart) {
    const t = (phase - hideStart) / INSTRUCTION_HIDE_FRAC;
    const fade = Math.max(0, 1 - easeInQuad(t));
    const titleScale = 1 - t * 0.03;
    const titleOffsetY = -t * 8;
    const bodyOffsetY = -t * 5;
    return {
      index,
      alpha: fade,
      titleScale,
      titleOffsetY,
      bodyAlpha: fade,
      bodyOffsetY,
    };
  }
  return {
    index,
    alpha: 1,
    titleScale: holdPulse,
    titleOffsetY: 0,
    bodyAlpha: 1,
    bodyOffsetY: 0,
  };
}
