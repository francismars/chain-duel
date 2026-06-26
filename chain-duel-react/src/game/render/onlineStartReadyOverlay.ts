import { CanvasTextMetrics, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GridPos, SnakeState } from '@/game/engine/types';
import type { OnlineStartReadyState } from '@/game/render/matchObjectives';

const STATUS_FONT = 'Inter, system-ui, sans-serif';
const READY_CHECK_GREEN = 0x6fd4a8;

export type ChainHeadLabelMetrics = {
  statusPx: number;
  gapPx: number;
};

/** Full opacity once the start prompt has begun — don't dim with its idle pulse. */
export function onlineStartReadyAlpha(
  hasReadyState: boolean,
  startWordAlpha: number
): number {
  if (!hasReadyState) return 0;
  if (startWordAlpha >= 0.12) return 1;
  return startWordAlpha / 0.12;
}

export function chainHeadLabelMetrics(
  colSize: number,
  rowSize: number
): ChainHeadLabelMetrics {
  const cell = Math.min(colSize, rowSize);
  const statusPx = Math.max(13, Math.min(20, cell * 0.46));
  return {
    statusPx,
    gapPx: Math.max(8, cell * 0.26),
  };
}

function snakeSegments(snake: SnakeState): GridPos[] {
  return [snake.head, ...snake.body];
}

/** Horizontally centered on full chain; sits above the topmost segment. */
export function chainBodyLabelScreenPos(
  segments: GridPos[],
  colSize: number,
  rowSize: number,
  metrics: ChainHeadLabelMetrics,
  bobPx = 0
): { x: number; y: number } {
  if (segments.length === 0) {
    return { x: 0, y: 0 };
  }

  let minX = segments[0][0];
  let maxX = segments[0][0];
  let minY = segments[0][1];
  for (let i = 1; i < segments.length; i += 1) {
    const [x, y] = segments[i];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
  }

  const bodyTop = minY * rowSize - bobPx;
  return {
    x: ((minX + maxX + 1) / 2) * colSize,
    y: bodyTop - metrics.gapPx,
  };
}

type SeatCopy = {
  main: string;
  showCheckbox: boolean;
};

function seatCopy(ready: boolean, isLocal: boolean): SeatCopy {
  if (ready) {
    return { main: 'READY', showCheckbox: true };
  }
  if (isLocal) {
    return { main: 'PRESS START', showCheckbox: false };
  }
  return { main: 'WAITING', showCheckbox: false };
}

function statusFill(ready: boolean): string {
  if (ready) return 'rgba(255,255,255,0.95)';
  return 'rgba(255,255,255,0.78)';
}

function makeStatusStyle(
  fontSize: number,
  fill: string,
  weight: '600' | '500' = '600'
): TextStyle {
  return new TextStyle({
    fontFamily: STATUS_FONT,
    fill,
    fontSize,
    fontWeight: weight,
    letterSpacing: 0.06,
    align: 'center',
  });
}

function measureLabelWidth(text: string, style: TextStyle): number {
  return CanvasTextMetrics.measureText(text, style).width;
}

function checkboxSize(statusPx: number): number {
  return Math.max(11, statusPx * 0.78);
}

function paintCheckbox(g: Graphics, size: number, checked: boolean): void {
  const half = size / 2;
  g.clear();
  g.roundRect(-half, -half, size, size, 2);
  if (checked) {
    g.fill({ color: 0xffffff, alpha: 0.96 });
    g.stroke({ width: 1.2, color: READY_CHECK_GREEN, alpha: 0.85 });
    g.moveTo(-half * 0.42, -half * 0.02);
    g.lineTo(-half * 0.1, half * 0.34);
    g.lineTo(half * 0.46, -half * 0.4);
    g.stroke({
      width: Math.max(1.4, size * 0.13),
      color: 0x101010,
      alpha: 1,
      cap: 'round',
      join: 'round',
    });
    return;
  }
  g.stroke({ width: 1.4, color: 0xffffff, alpha: 0.35 });
}

type SeatLayout = {
  root: Container;
  row: Container;
  checkbox: Graphics;
  status: Text;
  hint: Text;
  styleToken: string;
};

function layoutSeat(
  seat: SeatLayout,
  metrics: ChainHeadLabelMetrics,
  ready: boolean,
  isLocal: boolean
): void {
  const copy = seatCopy(ready, isLocal);
  const fill = statusFill(ready);
  const token = `${copy.main}:${copy.showCheckbox}:${metrics.statusPx}:${ready}`;

  if (seat.styleToken !== token) {
    seat.styleToken = token;
    seat.status.style = makeStatusStyle(metrics.statusPx, fill);
    seat.status.text = copy.main;
    seat.hint.visible = false;
  }

  const mainStyle = seat.status.style;

  const box = checkboxSize(metrics.statusPx);
  const mainW = measureLabelWidth(copy.main, mainStyle);
  const rowGap = copy.showCheckbox ? metrics.statusPx * 0.2 : 0;
  const rowW = copy.showCheckbox ? box + rowGap + mainW : mainW;

  seat.checkbox.visible = copy.showCheckbox;
  if (copy.showCheckbox) {
    paintCheckbox(seat.checkbox, box, true);
    const midY = -metrics.statusPx / 2;
    seat.checkbox.position.set(-rowW / 2 + box / 2, midY);
    seat.status.anchor.set(0, 0.5);
    seat.status.position.set(-rowW / 2 + box + rowGap, midY);
  } else {
    seat.status.anchor.set(0.5, 1);
    seat.status.position.set(0, 0);
  }

  seat.row.position.set(0, 0);
}

export class OnlineStartReadyOverlay {
  readonly container = new Container();

  private p1: SeatLayout;
  private p2: SeatLayout;

  constructor() {
    this.container.cullable = false;
    this.container.visible = false;

    const makeSeat = (): SeatLayout => {
      const root = new Container();
      root.cullable = false;
      const row = new Container();
      row.cullable = false;
      const checkbox = new Graphics();
      checkbox.cullable = false;
      const status = new Text({ text: '', style: new TextStyle() });
      const hint = new Text({ text: '', style: new TextStyle() });
      for (const t of [status, hint]) {
        t.resolution = 2;
        t.cullable = false;
        t.roundPixels = true;
      }
      row.addChild(checkbox);
      row.addChild(status);
      row.addChild(hint);
      root.addChild(row);
      return { root, row, checkbox, status, hint, styleToken: '' };
    };

    this.p1 = makeSeat();
    this.p2 = makeSeat();
    this.container.addChild(this.p1.root);
    this.container.addChild(this.p2.root);
  }

  hide(): void {
    this.container.visible = false;
    this.container.alpha = 0;
    this.p1.styleToken = '';
    this.p2.styleToken = '';
  }

  render(
    colSize: number,
    rowSize: number,
    p1Snake: SnakeState,
    p2Snake: SnakeState,
    p1BobPx: number,
    p2BobPx: number,
    state: OnlineStartReadyState | undefined,
    alpha: number
  ): void {
    if (!state || alpha < 0.02) {
      this.hide();
      return;
    }

    const metrics = chainHeadLabelMetrics(colSize, rowSize);

    layoutSeat(
      this.p1,
      metrics,
      state.p1Ready,
      state.localSlot === 'p1'
    );
    layoutSeat(
      this.p2,
      metrics,
      state.p2Ready,
      state.localSlot === 'p2'
    );

    const p1Pos = chainBodyLabelScreenPos(
      snakeSegments(p1Snake),
      colSize,
      rowSize,
      metrics,
      p1BobPx
    );
    const p2Pos = chainBodyLabelScreenPos(
      snakeSegments(p2Snake),
      colSize,
      rowSize,
      metrics,
      p2BobPx
    );

    this.container.position.set(0, 0);
    this.p1.root.position.set(Math.round(p1Pos.x), Math.round(p1Pos.y));
    this.p2.root.position.set(Math.round(p2Pos.x), Math.round(p2Pos.y));
    this.container.visible = true;
    this.container.alpha = alpha;
  }
}

function drawCheckboxFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  checked: boolean
): void {
  const half = size / 2;
  const left = x - half;
  const top = y - half;
  ctx.beginPath();
  ctx.roundRect(left, top, size, size, 2);
  if (checked) {
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(111,212,168,0.85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = '#101010';
    ctx.lineWidth = Math.max(1.4, size * 0.13);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(x - half * 0.42, y - half * 0.02);
    ctx.lineTo(x - half * 0.1, y + half * 0.34);
    ctx.lineTo(x + half * 0.46, y - half * 0.4);
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

export function drawOnlineStartReadyFallback(
  ctx: CanvasRenderingContext2D,
  colSize: number,
  rowSize: number,
  p1Snake: SnakeState,
  p2Snake: SnakeState,
  p1BobPx: number,
  p2BobPx: number,
  state: OnlineStartReadyState | undefined,
  alpha: number
): void {
  if (!state || alpha < 0.02) {
    return;
  }

  const metrics = chainHeadLabelMetrics(colSize, rowSize);

  ctx.save();
  ctx.globalAlpha = alpha;

  const drawSeat = (
    snake: SnakeState,
    bobPx: number,
    ready: boolean,
    isLocal: boolean
  ): void => {
    const copy = seatCopy(ready, isLocal);
    const fill = statusFill(ready);
    const pos = chainBodyLabelScreenPos(
      snakeSegments(snake),
      colSize,
      rowSize,
      metrics,
      bobPx
    );
    const mainStyle = makeStatusStyle(metrics.statusPx, fill);
    const mainW = measureLabelWidth(copy.main, mainStyle);
    const box = checkboxSize(metrics.statusPx);
    const rowGap = copy.showCheckbox ? metrics.statusPx * 0.2 : 0;
    const rowW = copy.showCheckbox ? box + rowGap + mainW : mainW;

    if (copy.showCheckbox) {
      drawCheckboxFallback(
        ctx,
        pos.x - rowW / 2 + box / 2,
        pos.y - metrics.statusPx / 2,
        box,
        true
      );
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.floor(metrics.statusPx)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = fill;
      ctx.fillText(
        copy.main,
        pos.x - rowW / 2 + box + rowGap,
        pos.y - metrics.statusPx / 2
      );
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `600 ${Math.floor(metrics.statusPx)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = fill;
      ctx.fillText(copy.main, pos.x, pos.y);
    }
  };

  drawSeat(p1Snake, p1BobPx, state.p1Ready, state.localSlot === 'p1');
  drawSeat(p2Snake, p2BobPx, state.p2Ready, state.localSlot === 'p2');

  ctx.restore();
}
