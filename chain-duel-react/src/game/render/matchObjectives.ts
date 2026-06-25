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

export type CanvasObjectivesOpts = {
  stakesHint?: string;
  controlSlots?: readonly PlayerControlSlot[];
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
