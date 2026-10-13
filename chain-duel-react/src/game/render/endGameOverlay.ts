import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '@/game/engine/types';
import { pixiTextResolution } from './pixiTextResolution';

/** Beat after the board settles before the winner overlay appears. */
export const END_OVERLAY_DELAY_MS = 500;
export const END_OVERLAY_STAGGER_MS = 95;
export const END_OVERLAY_ITEM_DURATION_MS = 400;
/** Must match resolve-block cover duration in the renderer. */
export const END_RESOLVE_DURATION_MS = 1400;
/** backdrop, rules, label, name, result, amount, prompt */
export const END_OVERLAY_ITEM_COUNT = 7;
/** Prompt / action-row slot in the stagger sequence. */
export const END_OVERLAY_ACTIONS_INDEX = 6;

export function endOverlayRevealDurationMs(): number {
  return (
    Math.max(0, END_OVERLAY_ITEM_COUNT - 1) * END_OVERLAY_STAGGER_MS +
    END_OVERLAY_ITEM_DURATION_MS
  );
}

/** Delay from game end until free-play action buttons should appear. */
export function endOverlayActionsDelayMs(convergenceWallClosed: boolean): number {
  const resolveMs = convergenceWallClosed ? END_RESOLVE_DURATION_MS : 0;
  return (
    resolveMs +
    END_OVERLAY_DELAY_MS +
    END_OVERLAY_ACTIONS_INDEX * END_OVERLAY_STAGGER_MS
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 0–1 eased progress for a staggered end-screen item. */
export function endOverlayItemProgress(
  elapsedMs: number,
  itemIndex: number
): number {
  const t = Math.max(
    0,
    Math.min(
      1,
      (elapsedMs - itemIndex * END_OVERLAY_STAGGER_MS) /
        END_OVERLAY_ITEM_DURATION_MS
    )
  );
  return easeOutCubic(t);
}

/** Same geometry in WebGL and the Canvas fallback. */
function layout(width: number, height: number) {
  const inset = Math.min(width * 0.07, height * 0.12);
  return {
    inset,
    title: Math.min(width * 0.085, height * 0.22),
    label: Math.max(10, Math.min(width / 65, height / 27)),
  };
}

function frameRects(width: number, height: number) {
  const { inset } = layout(width, height);
  const rects: [number, number, number, number][] = [
    [inset, height * 0.24, width - inset * 2, 1],
    [inset, height * 0.76, width - inset * 2, 1],
  ];
  return rects;
}

export type MatchEndFigure =
  | { kind: 'sats'; label: string }
  | { kind: 'free'; title: string; note: string };

/** Practice-hub matches are free. Paid duels keep the winner's sats line. */
export function matchEndFigure(
  freeGame: boolean,
  sats: number
): MatchEndFigure {
  if (freeGame) {
    return { kind: 'free', title: 'FREE GAME', note: 'NO SATS WON' };
  }
  return {
    kind: 'sats',
    label: `${Math.floor(sats).toLocaleString()} SATS`,
  };
}

/** Final score, not a payout estimate (fees are shown on the claim screen). */
export function winnerSats(state: GameState): number {
  if (state.winnerPlayer === 'P1') return state.score[0];
  if (state.winnerPlayer === 'P2') {
    return (
      state.score[1] +
      (state.meta.teamMode === '2v1' ? (state.extraSnakes[0]?.score ?? 0) : 0)
    );
  }
  return (
    state.extraSnakes.find((player) => player.name === state.winnerName)
      ?.score ?? 0
  );
}

export class EndGameOverlay {
  readonly container = new Container();
  private frame = new Graphics();
  private label = this.text('Inter', '#aaaaaa');
  private name = this.text('BureauGrotesque', '#ffffff');
  private result = this.text('BureauGrotesque', '#ffffff');
  private amount = this.text('BureauGrotesque', '#ffffff');
  private prompt = this.text('Inter', '#cccccc');

  constructor() {
    this.container.addChild(
      this.frame,
      this.label,
      this.name,
      this.result,
      this.amount,
      this.prompt
    );
    this.hide();
  }

  private text(fontFamily: string, fill: string): Text {
    const text = new Text({
      text: '',
      style: { fontFamily, fill, align: 'center' },
    });
    text.anchor.set(0.5);
    text.resolution = pixiTextResolution();
    return text;
  }

  hide(): void {
    this.container.visible = false;
  }

  render(
    width: number,
    height: number,
    winner: string,
    prompt: string,
    sats: number,
    elapsedMs = endOverlayRevealDurationMs()
  ): void {
    this.container.visible = true;
    const l = layout(width, height);
    const backdrop = endOverlayItemProgress(elapsedMs, 0);
    const rules = endOverlayItemProgress(elapsedMs, 1);
    const labelP = endOverlayItemProgress(elapsedMs, 2);
    const nameP = endOverlayItemProgress(elapsedMs, 3);
    const resultP = endOverlayItemProgress(elapsedMs, 4);
    const amountP = endOverlayItemProgress(elapsedMs, 5);
    const promptP = endOverlayItemProgress(elapsedMs, 6);

    this.frame.clear();
    if (backdrop > 0.01) {
      this.frame
        .rect(0, 0, width, height)
        .fill({ color: 0x050505, alpha: 0.93 * backdrop });
    }
    if (rules > 0.01) {
      for (const [x, y, w, h] of frameRects(width, height)) {
        this.frame
          .rect(x, y, w, h)
          .fill({ color: 0xffffff, alpha: (h === 1 ? 0.3 : 1) * rules });
      }
    }

    this.label.text = 'CHAIN DUEL  /  MATCH COMPLETE';
    this.label.style.fontSize = l.label;
    this.label.position.set(width / 2, height * 0.16 + (1 - labelP) * 10);
    this.label.alpha = labelP;

    this.name.text = winner.toUpperCase() || 'WINNER';
    this.name.style.fontSize = l.title * 0.66;
    this.name.scale.set(1);
    const nameScale = Math.min(
      1,
      (width - l.inset * 2) / Math.max(1, this.name.width)
    );
    this.name.scale.set(nameScale);
    this.name.position.set(width / 2, height * 0.36 + (1 - nameP) * 14);
    this.name.alpha = nameP;

    this.result.text = 'WINS';
    this.result.style.fontSize = l.title * 1.1;
    this.result.position.set(width / 2, height * 0.51 + (1 - resultP) * 12);
    this.result.alpha = resultP;

    this.amount.text = `${Math.floor(sats).toLocaleString()} SATS`;
    this.amount.style.fontSize = l.title * 0.55;
    this.amount.scale.set(1);
    this.amount.scale.set(
      Math.min(1, (width - l.inset * 2) / Math.max(1, this.amount.width))
    );
    this.amount.position.set(width / 2, height * 0.66 + (1 - amountP) * 10);
    this.amount.alpha = amountP;

    this.prompt.text = prompt;
    this.prompt.style.fontSize = l.label;
    this.prompt.style.wordWrap = true;
    this.prompt.style.wordWrapWidth = width - l.inset * 2;
    this.prompt.position.set(width / 2, height * 0.86 + (1 - promptP) * 8);
    this.prompt.alpha = prompt ? promptP : 0;
  }
}

export function drawEndGameCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  winner: string,
  prompt: string,
  sats: number,
  elapsedMs = endOverlayRevealDurationMs()
): void {
  const l = layout(width, height);
  const backdrop = endOverlayItemProgress(elapsedMs, 0);
  const rules = endOverlayItemProgress(elapsedMs, 1);
  const labelP = endOverlayItemProgress(elapsedMs, 2);
  const nameP = endOverlayItemProgress(elapsedMs, 3);
  const resultP = endOverlayItemProgress(elapsedMs, 4);
  const amountP = endOverlayItemProgress(elapsedMs, 5);
  const promptP = endOverlayItemProgress(elapsedMs, 6);

  ctx.save();
  ctx.shadowBlur = 0;
  if (backdrop > 0.01) {
    ctx.globalAlpha = backdrop;
    ctx.fillStyle = 'rgba(5,5,5,0.93)';
    ctx.fillRect(0, 0, width, height);
  }
  if (rules > 0.01) {
    ctx.globalAlpha = rules;
    for (const [x, y, w, h] of frameRects(width, height)) {
      ctx.fillStyle = h === 1 ? '#555555' : '#ffffff';
      ctx.fillRect(x, y, w, h);
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (labelP > 0.01) {
    ctx.globalAlpha = labelP;
    ctx.fillStyle = '#aaaaaa';
    ctx.font = `${l.label}px Inter, sans-serif`;
    ctx.fillText(
      'CHAIN DUEL  /  MATCH COMPLETE',
      width / 2,
      height * 0.16 + (1 - labelP) * 10
    );
  }

  if (nameP > 0.01) {
    const name = winner.toUpperCase() || 'WINNER';
    ctx.globalAlpha = nameP;
    ctx.font = `${l.title * 0.66}px BureauGrotesque`;
    const scale = Math.min(
      1,
      (width - l.inset * 2) / Math.max(1, ctx.measureText(name).width)
    );
    ctx.font = `${l.title * 0.66 * scale}px BureauGrotesque`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, width / 2, height * 0.36 + (1 - nameP) * 14);
  }

  if (resultP > 0.01) {
    ctx.globalAlpha = resultP;
    ctx.font = `${l.title * 1.1}px BureauGrotesque`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('WINS', width / 2, height * 0.51 + (1 - resultP) * 12);
  }

  if (amountP > 0.01) {
    ctx.globalAlpha = amountP;
    ctx.font = `${l.title * 0.55}px BureauGrotesque`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `${Math.floor(sats).toLocaleString()} SATS`,
      width / 2,
      height * 0.66 + (1 - amountP) * 10,
      width - l.inset * 2
    );
  }

  if (promptP > 0.01 && prompt) {
    ctx.globalAlpha = promptP;
    ctx.font = `${l.label}px Inter, sans-serif`;
    ctx.fillStyle = '#cccccc';
    ctx.fillText(
      prompt,
      width / 2,
      height * 0.86 + (1 - promptP) * 8,
      width - l.inset * 2
    );
  }
  ctx.restore();
}
