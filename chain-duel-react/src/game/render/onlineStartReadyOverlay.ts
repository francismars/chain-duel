import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  measureOnlineStartReadyPanel,
  type OnlineStartReadyState,
} from '@/game/render/matchObjectives';

const MONO_FONT = 'Inter, system-ui, sans-serif';
const DISPLAY_FONT = 'BureauGrotesque, sans-serif';

function shortName(name: string | undefined, fallback: string): string {
  const trimmed = (name ?? fallback).trim();
  if (trimmed.length <= 11) {
    return trimmed.toUpperCase();
  }
  return `${trimmed.slice(0, 10).toUpperCase()}…`;
}

type SeatLayout = {
  root: Container;
  bg: Graphics;
  chip: Graphics;
  status: Text;
  name: Text;
};

type SeatMetrics = ReturnType<typeof measureOnlineStartReadyPanel> & {
  compact: boolean;
  chipSize: number;
  statusPx: number;
  namePx: number;
  seatH: number;
  padY: number;
};

function seatMetrics(startFontSize: number, compact: boolean): SeatMetrics {
  const base = measureOnlineStartReadyPanel(startFontSize, compact);
  const chipSize = Math.max(compact ? 16 : 18, startFontSize * 0.26);
  const statusPx = Math.max(compact ? 13 : 15, startFontSize * 0.24);
  const namePx = Math.max(compact ? 8 : 9, startFontSize * 0.13);
  const padY = 12;
  const seatH = padY + chipSize + 10 + statusPx * 1.15 + 8 + namePx * 1.35 + padY;
  return {
    ...base,
    compact,
    chipSize,
    statusPx,
    namePx,
    seatH,
    padY,
  };
}

function layoutSeat(
  seat: SeatLayout,
  x: number,
  y: number,
  metrics: SeatMetrics,
  isP1: boolean,
  ready: boolean,
  pulse: number,
  name: string
): void {
  const { colW, chipSize, statusPx, namePx, seatH, padY } = metrics;
  seat.root.position.set(x, y);

  seat.bg.clear();
  seat.bg.roundRect(-colW / 2, 0, colW, seatH, 8);
  if (ready) {
    seat.bg.fill({ color: 0xffffff, alpha: 0.97 });
    seat.bg.stroke({ width: 1, color: 0xffffff, alpha: 0.45 });
  } else {
    seat.bg.fill({ color: 0x000000, alpha: 0.42 });
    seat.bg.stroke({
      width: 1,
      color: 0xffffff,
      alpha: 0.28 + pulse * 0.08,
    });
  }

  const chipY = padY + chipSize / 2;
  seat.chip.clear();
  const half = chipSize / 2;
  seat.chip.roundRect(-half, -half, chipSize, chipSize, chipSize * 0.12);
  if (isP1) {
    seat.chip.fill({ color: ready ? 0x0a0a0a : 0xffffff, alpha: ready ? 1 : 0.94 });
    if (!ready) {
      seat.chip.stroke({ width: 1.2, color: 0xffffff, alpha: 0.75 });
    }
  } else {
    seat.chip.fill({ color: ready ? 0x0a0a0a : 0x101010, alpha: 0.98 });
    seat.chip.stroke({
      width: ready ? 1 : 1.4,
      color: ready ? 0x0a0a0a : 0xffffff,
      alpha: ready ? 1 : 0.82,
    });
  }
  seat.chip.position.set(0, chipY);

  const statusY = padY + chipSize + 10 + statusPx * 0.55;
  seat.status.style = new TextStyle({
    fontFamily: DISPLAY_FONT,
    fill: ready ? '#0a0a0a' : '#ffffff',
    fontSize: statusPx,
    fontWeight: '500',
    letterSpacing: 1.2,
    align: 'center',
  });
  seat.status.text = ready ? 'READY' : 'WAITING';
  seat.status.anchor.set(0.5, 0);
  seat.status.position.set(0, statusY);

  const nameY = statusY + statusPx * 1.15 + 6;
  seat.name.style = new TextStyle({
    fontFamily: MONO_FONT,
    fill: ready ? 'rgba(10,10,10,0.62)' : 'rgba(255,255,255,0.55)',
    fontSize: namePx,
    fontWeight: '500',
    letterSpacing: 0.08,
    align: 'center',
  });
  seat.name.text = name;
  seat.name.anchor.set(0.5, 0);
  seat.name.position.set(0, nameY);
}

export class OnlineStartReadyOverlay {
  readonly container = new Container();

  private p1: SeatLayout;
  private p2: SeatLayout;
  private layoutKey = '';

  constructor() {
    this.container.cullable = false;
    this.container.visible = false;

    const makeSeat = (): SeatLayout => {
      const root = new Container();
      root.cullable = false;
      const bg = new Graphics();
      const chip = new Graphics();
      const status = new Text({ text: '', style: new TextStyle() });
      const name = new Text({ text: '', style: new TextStyle() });
      for (const t of [status, name]) {
        t.resolution = 2;
      }
      root.addChild(bg);
      root.addChild(chip);
      root.addChild(status);
      root.addChild(name);
      return { root, bg, chip, status, name };
    };

    this.p1 = makeSeat();
    this.p2 = makeSeat();
    this.container.addChild(this.p1.root);
    this.container.addChild(this.p2.root);
  }

  hide(): void {
    this.container.visible = false;
    this.container.alpha = 0;
    this.layoutKey = '';
  }

  render(
    width: number,
    centerX: number,
    panelTopY: number,
    startFontSize: number,
    state: OnlineStartReadyState | undefined,
    alpha: number
  ): void {
    if (!state || alpha < 0.02) {
      this.hide();
      return;
    }

    const compact = width < 560;
    const m = seatMetrics(startFontSize, compact);
    const token = `${m.colW}:${state.p1Ready}:${state.p2Ready}:${state.p1Label}:${state.p2Label}`;
    if (token !== this.layoutKey) {
      this.layoutKey = token;
    }

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 520);
    const seatCenterX = m.colW / 2 + m.colGap / 2;

    layoutSeat(
      this.p1,
      -seatCenterX,
      0,
      m,
      true,
      state.p1Ready,
      pulse,
      shortName(state.p1Label, 'Player 1')
    );
    layoutSeat(
      this.p2,
      seatCenterX,
      0,
      m,
      false,
      state.p2Ready,
      pulse,
      shortName(state.p2Label, 'Player 2')
    );

    if (state.localSlot === 'p1' && !state.p1Ready) {
      this.p1.root.scale.set(1 + pulse * 0.015);
    } else if (state.localSlot === 'p2' && !state.p2Ready) {
      this.p2.root.scale.set(1 + pulse * 0.015);
    } else {
      this.p1.root.scale.set(1);
      this.p2.root.scale.set(1);
    }

    this.container.position.set(centerX, panelTopY);
    this.container.visible = true;
    this.container.alpha = alpha;
  }
}

export function drawOnlineStartReadyFallback(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  panelTopY: number,
  startFontSize: number,
  state: OnlineStartReadyState | undefined,
  alpha: number
): void {
  if (!state || alpha < 0.02) {
    return;
  }

  const compact = startFontSize < 28;
  const m = seatMetrics(startFontSize, compact);
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 520);
  const seatCenterX = m.colW / 2 + m.colGap / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(centerX, panelTopY);

  drawSeatFallback(
    ctx,
    -seatCenterX,
    0,
    m,
    true,
    state.p1Ready,
    pulse,
    shortName(state.p1Label, 'Player 1')
  );
  drawSeatFallback(
    ctx,
    seatCenterX,
    0,
    m,
    false,
    state.p2Ready,
    pulse,
    shortName(state.p2Label, 'Player 2')
  );

  ctx.restore();
}

function drawSeatFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  metrics: SeatMetrics,
  isP1: boolean,
  ready: boolean,
  pulse: number,
  name: string
): void {
  const { colW, chipSize, statusPx, namePx, seatH, padY } = metrics;
  roundRect(ctx, x - colW / 2, y, colW, seatH, 8);
  if (ready) {
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.28 + pulse * 0.08})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const chipY = y + padY + chipSize / 2;
  const half = chipSize / 2;
  roundRect(ctx, x - half, chipY - half, chipSize, chipSize, chipSize * 0.12);
  if (isP1) {
    ctx.fillStyle = ready ? '#0a0a0a' : 'rgba(255,255,255,0.94)';
    ctx.fill();
    if (!ready) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = ready ? '#0a0a0a' : '#101010';
    ctx.fill();
    ctx.strokeStyle = ready ? '#0a0a0a' : 'rgba(255,255,255,0.82)';
    ctx.lineWidth = ready ? 1 : 1.4;
    ctx.stroke();
  }

  const statusY = y + padY + chipSize + 10;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = ready ? '#0a0a0a' : '#ffffff';
  ctx.font = `500 ${Math.floor(statusPx)}px BureauGrotesque, sans-serif`;
  ctx.fillText(ready ? 'READY' : 'WAITING', x, statusY);

  const nameY = statusY + statusPx * 1.15 + 6;
  ctx.fillStyle = ready ? 'rgba(10,10,10,0.62)' : 'rgba(255,255,255,0.55)';
  ctx.font = `500 ${Math.floor(namePx)}px Inter, system-ui, sans-serif`;
  ctx.fillText(name, x, nameY);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
