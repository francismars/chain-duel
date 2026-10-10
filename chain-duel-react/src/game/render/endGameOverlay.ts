import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '@/game/engine/types';
import { pixiTextResolution } from './pixiTextResolution';

/** Beat after the board settles before the winner overlay appears. */
export const END_OVERLAY_DELAY_MS = 500;

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
    sats: number
  ): void {
    this.container.visible = true;
    const l = layout(width, height);
    this.frame
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: 0x050505, alpha: 0.93 });
    for (const [x, y, w, h] of frameRects(width, height)) {
      this.frame
        .rect(x, y, w, h)
        .fill({ color: 0xffffff, alpha: h === 1 ? 0.3 : 1 });
    }
    this.label.text = 'CHAIN DUEL  /  MATCH COMPLETE';
    this.label.style.fontSize = l.label;
    this.label.position.set(width / 2, height * 0.16);
    this.name.text = winner.toUpperCase() || 'WINNER';
    this.name.style.fontSize = l.title * 0.66;
    this.name.scale.set(1);
    const nameScale = Math.min(
      1,
      (width - l.inset * 2) / Math.max(1, this.name.width)
    );
    this.name.scale.set(nameScale);
    this.name.position.set(width / 2, height * 0.36);
    this.result.text = 'WINS';
    this.result.style.fontSize = l.title * 1.1;
    this.result.position.set(width / 2, height * 0.51);
    this.amount.text = `${Math.floor(sats).toLocaleString()} SATS`;
    this.amount.style.fontSize = l.title * 0.55;
    this.amount.scale.set(1);
    this.amount.scale.set(
      Math.min(1, (width - l.inset * 2) / Math.max(1, this.amount.width))
    );
    this.amount.position.set(width / 2, height * 0.66);
    this.prompt.text = prompt;
    this.prompt.style.fontSize = l.label;
    this.prompt.style.wordWrap = true;
    this.prompt.style.wordWrapWidth = width - l.inset * 2;
    this.prompt.position.set(width / 2, height * 0.86);
  }
}

export function drawEndGameCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  winner: string,
  prompt: string,
  sats: number
): void {
  const l = layout(width, height);
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(5,5,5,0.93)';
  ctx.fillRect(0, 0, width, height);
  for (const [x, y, w, h] of frameRects(width, height)) {
    ctx.fillStyle = h === 1 ? '#555555' : '#ffffff';
    ctx.fillRect(x, y, w, h);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aaaaaa';
  ctx.font = `${l.label}px Inter, sans-serif`;
  ctx.fillText('CHAIN DUEL  /  MATCH COMPLETE', width / 2, height * 0.16);
  const name = winner.toUpperCase() || 'WINNER';
  ctx.font = `${l.title * 0.66}px BureauGrotesque`;
  const scale = Math.min(
    1,
    (width - l.inset * 2) / Math.max(1, ctx.measureText(name).width)
  );
  ctx.font = `${l.title * 0.66 * scale}px BureauGrotesque`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, width / 2, height * 0.36);
  ctx.font = `${l.title * 1.1}px BureauGrotesque`;
  ctx.fillText('WINS', width / 2, height * 0.51);
  ctx.font = `${l.title * 0.55}px BureauGrotesque`;
  ctx.fillText(
    `${Math.floor(sats).toLocaleString()} SATS`,
    width / 2,
    height * 0.66,
    width - l.inset * 2
  );
  ctx.font = `${l.label}px Inter, sans-serif`;
  ctx.fillStyle = '#cccccc';
  ctx.fillText(prompt, width / 2, height * 0.86, width - l.inset * 2);
  ctx.restore();
}
