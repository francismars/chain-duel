import type { Graphics } from 'pixi.js';
import { POWERUP_COLORS } from '@/game/engine/constants';
import type { PowerUpType } from '@/game/engine/types';

const VIEW = 16;
const CENTER = 8;

export const POWERUP_ICON_PATHS = {
  SURGE: 'M10 2L4 9h5l-3 5 8-7H9l1-5z',
  FREEZE_CROSS: 'M8 1v14M1 8h14M3.5 3.5l9 9M12.5 3.5l-9 9',
  PHANTOM: 'M3 14V7a5 5 0 0110 0v7l-2-1.5-2 1.5-2-1.5L5 15l-2-1z',
  AMPLIFIER: 'M2 12L7 4l3 5 2-3 3 6H2z',
} as const;

export function getPowerUpColor(type: string): number {
  return POWERUP_COLORS[type] ?? 0xffffff;
}

export function powerUpColorHex(type: PowerUpType | string): string {
  const n = getPowerUpColor(type);
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function powerUpColorRgb(type: string): {
  r: number;
  g: number;
  b: number;
} {
  const color = getPowerUpColor(type);
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

export function powerUpColorRgba(type: string, alpha: number): string {
  const { r, g, b } = powerUpColorRgb(type);
  return `rgba(${r},${g},${b},${alpha})`;
}

function mapPoint(
  cx: number,
  cy: number,
  size: number,
  x: number,
  y: number
): [number, number] {
  const scale = size / VIEW;
  return [cx + (x - CENTER) * scale, cy + (y - CENTER) * scale];
}

function mapRadius(size: number, r: number): number {
  return (r / VIEW) * size;
}

function drawSurgeIcon(
  drawPoly: (points: number[]) => void
): void {
  drawPoly([10, 2, 4, 9, 9, 9, 6, 14, 14, 7, 9, 7, 10, 2]);
}

function drawFreezeIcon(
  drawLine: (x1: number, y1: number, x2: number, y2: number) => void,
  drawCircle: (x: number, y: number, r: number, fill: boolean) => void
): void {
  drawLine(8, 1, 8, 15);
  drawLine(1, 8, 15, 8);
  drawLine(3.5, 3.5, 12.5, 12.5);
  drawLine(12.5, 3.5, 3.5, 12.5);
  drawCircle(8, 8, 1.6, true);
}

function drawPhantomIcon(drawPoly: (points: number[]) => void): void {
  // Ghost body + scalloped tail (matches legend silhouette)
  drawPoly([
    3, 14, 3, 7, 3.5, 5.5, 5, 4.2, 6.5, 3.5, 8, 3, 9.5, 3.5, 11, 4.2, 12.5, 5.5,
    13, 7, 13, 14, 11, 12.5, 9, 14, 7, 12.5, 5, 14, 3, 14,
  ]);
}

function drawAmplifierIcon(drawPoly: (points: number[]) => void): void {
  drawPoly([2, 12, 7, 4, 10, 9, 12, 6, 15, 12, 2, 12]);
}

function drawDecoyIcon(
  drawCircle: (x: number, y: number, r: number, fill: boolean) => void,
  drawDashedCircle: (x: number, y: number, r: number) => void
): void {
  drawDashedCircle(8, 8, 5);
  drawCircle(8, 8, 1.5, true);
}

export function drawPowerUpIconPixi(
  gfx: Graphics,
  cx: number,
  cy: number,
  size: number,
  type: PowerUpType | string,
  color: number,
  alpha: number
): void {
  const strokeWidth = Math.max(1.2, size * 0.11);

  const drawPoly = (points: number[]) => {
    const mapped: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const [x, y] = mapPoint(cx, cy, size, points[i]!, points[i + 1]!);
      mapped.push(x, y);
    }
    gfx.poly(mapped).fill({ color, alpha });
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const [mx1, my1] = mapPoint(cx, cy, size, x1, y1);
    const [mx2, my2] = mapPoint(cx, cy, size, x2, y2);
    gfx.moveTo(mx1, my1).lineTo(mx2, my2).stroke({
      width: strokeWidth,
      color,
      alpha,
      cap: 'round',
    });
  };

  const drawCircle = (x: number, y: number, r: number, fill: boolean) => {
    const [mx, my] = mapPoint(cx, cy, size, x, y);
    const mr = mapRadius(size, r);
    if (fill) {
      gfx.circle(mx, my, mr).fill({ color, alpha });
    } else {
      gfx.circle(mx, my, mr).stroke({ width: strokeWidth, color, alpha });
    }
  };

  const drawDashedCircle = (x: number, y: number, r: number) => {
    const [mx, my] = mapPoint(cx, cy, size, x, y);
    const mr = mapRadius(size, r);
    const segments = 10;
    const dash = 0.55;
    for (let i = 0; i < segments; i += 1) {
      const start = (i / segments) * Math.PI * 2;
      const end = start + (Math.PI * 2 * dash) / segments;
      gfx
        .arc(mx, my, mr, start, end)
        .stroke({ width: strokeWidth, color, alpha, cap: 'round' });
    }
  };

  switch (type) {
    case 'SURGE':
      drawSurgeIcon(drawPoly);
      break;
    case 'FREEZE':
      drawFreezeIcon(drawLine, drawCircle);
      break;
    case 'PHANTOM':
      drawPhantomIcon(drawPoly);
      break;
    case 'AMPLIFIER':
      drawAmplifierIcon(drawPoly);
      break;
    case 'DECOY':
      drawDecoyIcon(drawCircle, drawDashedCircle);
      break;
    default:
      gfx.circle(cx, cy, size * 0.22).fill({ color, alpha });
  }
}

export function drawPowerUpIconCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  type: PowerUpType | string,
  color: number,
  alpha: number
): void {
  const { r, g, b } = {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
  const fill = `rgba(${r},${g},${b},${alpha})`;
  const stroke = `rgba(${r},${g},${b},${alpha})`;
  const strokeWidth = Math.max(1.2, size * 0.11);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawPoly = (points: number[]) => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      const [x, y] = mapPoint(cx, cy, size, points[i]!, points[i + 1]!);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const [mx1, my1] = mapPoint(cx, cy, size, x1, y1);
    const [mx2, my2] = mapPoint(cx, cy, size, x2, y2);
    ctx.beginPath();
    ctx.moveTo(mx1, my1);
    ctx.lineTo(mx2, my2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  };

  const drawCircle = (x: number, y: number, radius: number, doFill: boolean) => {
    const [mx, my] = mapPoint(cx, cy, size, x, y);
    const mr = mapRadius(size, radius);
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    if (doFill) {
      ctx.fillStyle = fill;
      ctx.fill();
    } else {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  };

  const drawDashedCircle = (x: number, y: number, radius: number) => {
    const [mx, my] = mapPoint(cx, cy, size, x, y);
    const mr = mapRadius(size, radius);
    ctx.setLineDash([
      Math.max(1.5, size * 0.12),
      Math.max(1.5, size * 0.08),
    ]);
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    ctx.setLineDash([]);
  };

  switch (type) {
    case 'SURGE':
      drawSurgeIcon(drawPoly);
      break;
    case 'FREEZE':
      drawFreezeIcon(drawLine, drawCircle);
      break;
    case 'PHANTOM':
      drawPhantomIcon(drawPoly);
      break;
    case 'AMPLIFIER':
      drawAmplifierIcon(drawPoly);
      break;
    case 'DECOY':
      drawDecoyIcon(drawCircle, drawDashedCircle);
      break;
    default:
      drawCircle(CENTER, CENTER, 2.5, true);
  }

  ctx.restore();
}

export function drawPowerUpTileCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  iconSize: number,
  type: PowerUpType | string,
  color: number,
  pulse: number
): void {
  drawPowerUpIconCanvas(ctx, cx, cy, iconSize, type, color, 0.95 * pulse);
}
