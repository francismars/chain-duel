import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  measureOnlineStartReadyPanel,
  type OnlineStartReadyState,
} from '@/game/render/matchObjectives';

const MONO_FONT = 'Inter, system-ui, sans-serif';
const DISPLAY_FONT = 'BureauGrotesque, sans-serif';

function shortName(name: string | undefined, fallback: string): string {
  const trimmed = (name?.trim() || fallback).trim();
  if (trimmed.length <= 12) {
    return trimmed.toUpperCase();
  }
  return `${trimmed.slice(0, 11).toUpperCase()}…`;
}

function estimateNameWidth(name: string, namePx: number, measured: number): number {
  return Math.max(measured, namePx * name.length * 0.52, namePx * 2);
}

type SeatLayout = {
  root: Container;
  chip: Graphics;
  name: Text;
  status: Text;
  contentToken: string;
  identityW: number;
  chipX: number;
  chipY: number;
  nameX: number;
};

type SeatMetrics = ReturnType<typeof measureOnlineStartReadyPanel> & {
  compact: boolean;
  chipSize: number;
  statusPx: number;
  namePx: number;
  textGap: number;
  statusGap: number;
  topRowH: number;
  rowH: number;
  minSlotW: number;
};

function seatMetrics(startFontSize: number, compact: boolean): SeatMetrics {
  const base = measureOnlineStartReadyPanel(startFontSize, compact);
  const chipSize = Math.max(compact ? 18 : 22, startFontSize * 0.28);
  const namePx = chipSize * 0.92;
  const statusPx = Math.max(compact ? 12 : 14, startFontSize * 0.2);
  const textGap = Math.max(8, chipSize * 0.14);
  const statusGap = Math.max(7, chipSize * 0.18);
  const topRowH = chipSize;
  const rowH = topRowH + statusGap + statusPx * 1.12;
  return {
    ...base,
    compact,
    chipSize,
    statusPx,
    namePx,
    textGap,
    statusGap,
    topRowH,
    rowH,
    minSlotW: base.minSlotW,
  };
}

function syncSeatContent(
  seat: SeatLayout,
  metrics: SeatMetrics,
  ready: boolean,
  name: string
): number {
  const { chipSize, statusPx, namePx, textGap, statusGap, topRowH } = metrics;
  const token = `${name}:${namePx}:${statusPx}:${ready}:${chipSize}:${textGap}:${statusGap}`;

  if (seat.contentToken !== token) {
    seat.contentToken = token;
    seat.name.style = new TextStyle({
      fontFamily: MONO_FONT,
      fill: ready ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.62)',
      fontSize: namePx,
      fontWeight: '600',
      letterSpacing: 0.03,
    });
    seat.name.text = name;

    seat.status.style = new TextStyle({
      fontFamily: DISPLAY_FONT,
      fill: ready ? '#ffffff' : 'rgba(255,255,255,0.62)',
      fontSize: statusPx,
      fontWeight: '500',
      letterSpacing: 1,
      align: 'center',
    });
    seat.status.text = ready ? 'READY' : 'WAITING';
  }

  const nameW = estimateNameWidth(name, namePx, seat.name.width);
  seat.identityW = chipSize + textGap + nameW;
  seat.chipX = -seat.identityW / 2 + chipSize / 2;
  seat.chipY = topRowH / 2;
  seat.nameX = -seat.identityW / 2 + chipSize + textGap;

  seat.name.position.set(seat.nameX, seat.chipY);
  seat.status.position.set(0, topRowH + statusGap);

  return seat.identityW;
}

function paintSeatChip(
  seat: SeatLayout,
  metrics: SeatMetrics,
  isP1: boolean,
  ready: boolean,
  pulse: number,
  waitingCue: boolean
): void {
  const { chipSize } = metrics;
  const half = chipSize / 2;

  seat.chip.clear();
  seat.chip.rect(-half, -half, chipSize, chipSize);
  if (isP1) {
    if (ready) {
      seat.chip.fill({ color: 0xffffff, alpha: 1 });
    } else {
      seat.chip.fill({ color: 0xffffff, alpha: 0.94 });
      if (waitingCue) {
        seat.chip.stroke({
          width: 1.4,
          color: 0xffffff,
          alpha: 0.55 + pulse * 0.2,
        });
      }
    }
  } else if (ready) {
    seat.chip.fill({ color: 0xffffff, alpha: 1 });
    seat.chip.stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
  } else {
    seat.chip.fill({
      color: 0x101010,
      alpha: waitingCue ? 0.72 + pulse * 0.23 : 0.95,
    });
  }
  if (ready) {
    const inset = Math.max(3, chipSize * 0.22);
    seat.chip.rect(
      -half + inset,
      -half + inset,
      chipSize - inset * 2,
      chipSize - inset * 2
    );
    seat.chip.fill({ color: 0x0a0a0a, alpha: 1 });
  }
  seat.chip.position.set(seat.chipX, seat.chipY);
}

function layoutSeat(
  seat: SeatLayout,
  metrics: SeatMetrics,
  isP1: boolean,
  ready: boolean,
  pulse: number,
  name: string,
  waitingCue: boolean
): number {
  const identityW = syncSeatContent(seat, metrics, ready, name);
  paintSeatChip(seat, metrics, isP1, ready, pulse, waitingCue);
  return identityW;
}

export class OnlineStartReadyOverlay {
  readonly container = new Container();

  private p1: SeatLayout;
  private p2: SeatLayout;
  private metricsToken = '';

  constructor() {
    this.container.cullable = false;
    this.container.visible = false;

    const makeSeat = (): SeatLayout => {
      const root = new Container();
      root.cullable = false;
      const chip = new Graphics();
      chip.cullable = false;
      const name = new Text({ text: '', style: new TextStyle() });
      const status = new Text({ text: '', style: new TextStyle() });
      for (const t of [name, status]) {
        t.resolution = 2;
        t.cullable = false;
        t.roundPixels = true;
      }
      name.anchor.set(0, 0.5);
      status.anchor.set(0.5, 0);
      root.addChild(chip);
      root.addChild(name);
      root.addChild(status);
      return {
        root,
        chip,
        name,
        status,
        contentToken: '',
        identityW: 0,
        chipX: 0,
        chipY: 0,
        nameX: 0,
      };
    };

    this.p1 = makeSeat();
    this.p2 = makeSeat();
    this.container.addChild(this.p1.root);
    this.container.addChild(this.p2.root);
  }

  hide(): void {
    this.container.visible = false;
    this.container.alpha = 0;
    this.container.scale.set(1);
    this.metricsToken = '';
    this.p1.contentToken = '';
    this.p2.contentToken = '';
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
    const metricsToken = `${m.chipSize}:${m.namePx}:${m.statusPx}`;
    if (metricsToken !== this.metricsToken) {
      this.metricsToken = metricsToken;
      this.p1.contentToken = '';
      this.p2.contentToken = '';
    }

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 520);
    const p1WaitingCue = state.localSlot === 'p1' && !state.p1Ready;
    const p2WaitingCue = state.localSlot === 'p2' && !state.p2Ready;
    const p1IdentityW = layoutSeat(
      this.p1,
      m,
      true,
      state.p1Ready,
      pulse,
      shortName(state.p1Label, 'Player 1'),
      p1WaitingCue
    );
    const p2IdentityW = layoutSeat(
      this.p2,
      m,
      false,
      state.p2Ready,
      pulse,
      shortName(state.p2Label, 'Player 2'),
      p2WaitingCue
    );

    const slotW = Math.max(m.minSlotW, p1IdentityW, p2IdentityW);
    const totalW = slotW * 2 + m.rowGap;
    const maxW = width * 0.9;
    const scale = totalW > maxW ? maxW / totalW : 1;
    this.p1.root.position.set(-totalW / 2 + slotW / 2, 0);
    this.p2.root.position.set(totalW / 2 - slotW / 2, 0);
    this.p1.root.alpha = 1;
    this.p2.root.alpha = 1;

    this.container.position.set(centerX, panelTopY);
    this.container.scale.set(scale);
    this.container.visible = true;
    this.container.alpha = alpha;
  }
}

export function drawOnlineStartReadyFallback(
  ctx: CanvasRenderingContext2D,
  width: number,
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

  const p1Name = shortName(state.p1Label, 'Player 1');
  const p2Name = shortName(state.p2Label, 'Player 2');
  const p1IdentityW = measureIdentityWidth(ctx, m, p1Name);
  const p2IdentityW = measureIdentityWidth(ctx, m, p2Name);
  const slotW = Math.max(m.minSlotW, p1IdentityW, p2IdentityW);
  const totalW = slotW * 2 + m.rowGap;
  const maxW = width * 0.9;
  const scale = totalW > maxW ? maxW / totalW : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(centerX, panelTopY);
  ctx.scale(scale, scale);

  drawSeatFallback(
    ctx,
    -totalW / 2 + slotW / 2,
    0,
    m,
    true,
    state.p1Ready,
    pulse,
    p1Name,
    p1IdentityW,
    state.localSlot === 'p1' && !state.p1Ready
  );
  drawSeatFallback(
    ctx,
    totalW / 2 - slotW / 2,
    0,
    m,
    false,
    state.p2Ready,
    pulse,
    p2Name,
    p2IdentityW,
    state.localSlot === 'p2' && !state.p2Ready
  );

  ctx.restore();
}

function measureIdentityWidth(
  ctx: CanvasRenderingContext2D,
  metrics: SeatMetrics,
  name: string
): number {
  ctx.font = `600 ${Math.floor(metrics.namePx)}px Inter, system-ui, sans-serif`;
  return (
    metrics.chipSize +
    metrics.textGap +
    estimateNameWidth(name, metrics.namePx, ctx.measureText(name).width)
  );
}

function drawSeatFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  metrics: SeatMetrics,
  isP1: boolean,
  ready: boolean,
  pulse: number,
  name: string,
  identityW: number,
  waitingCue: boolean
): void {
  const { chipSize, statusPx, namePx, textGap, statusGap, topRowH } = metrics;
  const chipX = x - identityW / 2 + chipSize / 2;
  const chipY = y + topRowH / 2;
  const nameX = x - identityW / 2 + chipSize + textGap;
  const half = chipSize / 2;

  ctx.fillStyle = isP1
    ? ready
      ? '#ffffff'
      : 'rgba(255,255,255,0.94)'
    : ready
      ? '#ffffff'
      : '#101010';
  if (!isP1 && !ready && waitingCue) {
    ctx.globalAlpha *= 0.72 + pulse * 0.23;
  }
  ctx.fillRect(chipX - half, chipY - half, chipSize, chipSize);
  if (!isP1 && !ready && waitingCue) {
    ctx.globalAlpha /= 0.72 + pulse * 0.23;
  }
  if (isP1 && !ready && waitingCue) {
    ctx.strokeStyle = `rgba(255,255,255,${0.55 + pulse * 0.2})`;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(chipX - half, chipY - half, chipSize, chipSize);
  } else if (ready && !isP1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(chipX - half, chipY - half, chipSize, chipSize);
  }
  if (ready) {
    const inset = Math.max(3, chipSize * 0.22);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(
      chipX - half + inset,
      chipY - half + inset,
      chipSize - inset * 2,
      chipSize - inset * 2
    );
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ready ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.62)';
  ctx.font = `600 ${Math.floor(namePx)}px Inter, system-ui, sans-serif`;
  ctx.fillText(name, nameX, chipY);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = ready ? '#ffffff' : 'rgba(255,255,255,0.62)';
  ctx.font = `500 ${Math.floor(statusPx)}px BureauGrotesque, sans-serif`;
  ctx.fillText(ready ? 'READY' : 'WAITING', x, y + topRowH + statusGap);
}
