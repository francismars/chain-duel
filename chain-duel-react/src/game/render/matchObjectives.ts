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

/** Drop-shadow padding on BureauGrotesque start words (see pixiRenderer startWordStyle). */
export const START_WORD_SHADOW_PAD = 48;
export const START_WORD_SHADOW_BLUR = 44;

export const START_PROMPT_WORDS = [
  'PRESS',
  'BUTTON',
  'TO',
  'START',
] as const;

export const START_PROMPT_GAP_RATIO = 0.38;

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
  const estimate = fontSize * word.length * 0.48;
  return Math.max(measured, estimate, fontSize * 0.35);
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
};

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

/** Tight gap below the start prompt — cards only, no outer panel. */
export function computeOnlineStartReadyPlacement(
  layout: CanvasObjectivesLayout,
  startFontSize: number
): { panelTopY: number; sectionGap: number } {
  const startPromptBottom = layout.startY + startFontSize * 0.48 + 10;
  const sectionGap = Math.max(10, startFontSize * 0.2);
  return {
    sectionGap,
    panelTopY: startPromptBottom + sectionGap,
  };
}

export function measureOnlineStartReadyPanel(
  startFontSize: number,
  compact: boolean
): { panelW: number; panelH: number; rowGap: number; minSlotW: number } {
  const chipSize = Math.max(compact ? 18 : 22, startFontSize * 0.28);
  const statusPx = Math.max(compact ? 12 : 14, startFontSize * 0.2);
  const statusGap = Math.max(7, chipSize * 0.18);
  const rowH = chipSize + statusGap + statusPx * 1.12;
  const minSlotW = Math.max(compact ? 132 : 148, startFontSize * 1.55);
  const rowGap = Math.max(compact ? 28 : 40, startFontSize * 0.42);
  return {
    minSlotW,
    rowGap,
    panelW: minSlotW * 2 + rowGap,
    panelH: rowH,
  };
}

export function computeCanvasObjectivesLayout(
  width: number,
  height: number,
  startFontSize: number,
  opts: CanvasObjectivesOpts
): CanvasObjectivesLayout {
  const compact = width < 560 || height < 260;
  const titlePx = compact
    ? Math.max(12, width * 0.028)
    : Math.max(14, width * 0.022);
  const bodyPx = compact
    ? Math.max(10, width * 0.022)
    : Math.max(12, width * 0.017);
  const footerPx = Math.max(9, bodyPx * 0.95);
  const instructionW = Math.min(width * 0.78, 440);
  const titleBodyGap = bodyPx * 0.45;
  const bodyBlockH = bodyPx * 2.35;
  const layoutCore = {
    titlePx,
    bodyPx,
    titleBodyGap,
    bodyBlockH,
    footerPx,
  };
  const instructionBlockH = instructionBlockHeight(layoutCore, opts.stakesHint);

  const startY = height * 0.5;
  const startReach = startPromptVisualReach(startFontSize);
  const maxInstructionBottom = startY - startReach;
  const preferredTop = Math.max(12, height * 0.1);
  const instructionTop = Math.max(
    8,
    Math.min(preferredTop, maxInstructionBottom - instructionBlockH)
  );

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
};

export function computeInstructionCycleFrame(
  elapsedMs: number,
  cycleMs = INSTRUCTION_CYCLE_MS
): InstructionCycleFrame {
  const cycleElapsed = Math.max(0, elapsedMs);
  const index =
    Math.floor(cycleElapsed / cycleMs) % MATCH_OBJECTIVES.length;
  const phase = (cycleElapsed % cycleMs) / cycleMs;
  const revealEnd = INSTRUCTION_REVEAL_FRAC;
  const hideStart = 1 - INSTRUCTION_HIDE_FRAC;

  if (phase < revealEnd) {
    const t = phase / revealEnd;
    const eased = 1 - Math.pow(1 - t, 3);
    return { index, alpha: eased };
  }
  if (phase > hideStart) {
    const t = (phase - hideStart) / INSTRUCTION_HIDE_FRAC;
    const eased = t * t;
    return { index, alpha: Math.max(0, 1 - eased) };
  }
  return { index, alpha: 1 };
}
