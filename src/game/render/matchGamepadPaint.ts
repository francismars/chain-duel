import { Graphics, GraphicsPath } from 'pixi.js';
import {
  GAMEPAD_BODY_PATH,
  GAMEPAD_VIEW,
  GAMEPAD_DPAD_ORIGIN,
  GAMEPAD_DPAD_OUTLINE,
  GAMEPAD_L_STICK,
} from '@/features/config/gamepadDiagramGeometry';
import {
  matchPadActivity,
  type MatchPadActivity,
  type MatchPadReading,
} from '@/game/render/preMatchGamepad';

const WHITE = 0xffffff;
/** Same hairline as the pre-match key caps. */
const LINE_ALPHA = 0.42;
/** Pressed controls stay a light wash so the grid shows through. */
const ACTIVE_FILL_ALPHA = 0.32;

type DrawOp =
  | {
      t: 'path';
      d: string;
      fill?: number;
      fillAlpha?: number;
      stroke?: number;
    }
  | {
      t: 'roundRect';
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: number;
      fillAlpha: number;
    }
  | {
      t: 'circle';
      cx: number;
      cy: number;
      r: number;
      fill?: number;
      fillAlpha?: number;
      stroke?: number;
    }
  | { t: 'group'; x: number; y: number; children: DrawOp[] };

function matchDrawOps(activity: MatchPadActivity): DrawOp[] {
  const dpad: DrawOp[] = [];
  const arm = (on: boolean, x: number, y: number, w: number, h: number) => {
    if (!on) return;
    dpad.push({
      t: 'roundRect',
      x,
      y,
      w,
      h,
      r: 4,
      fill: WHITE,
      fillAlpha: ACTIVE_FILL_ALPHA,
    });
  };
  arm(activity.dpad.up, 16, 0, 16, 18);
  arm(activity.dpad.down, 16, 30, 16, 18);
  arm(activity.dpad.left, 0, 16, 18, 16);
  arm(activity.dpad.right, 30, 16, 18, 16);
  dpad.push({ t: 'path', d: GAMEPAD_DPAD_OUTLINE, stroke: 1.25 });
  dpad.push({ t: 'circle', cx: 24, cy: 24, r: 5.5, stroke: 1.1 });

  const faces: DrawOp[] = activity.faces.map((face) =>
    face.active
      ? {
          t: 'circle' as const,
          cx: face.cx,
          cy: face.cy,
          r: 12,
          fill: WHITE,
          fillAlpha: ACTIVE_FILL_ALPHA,
          stroke: 1.4,
        }
      : {
          t: 'circle' as const,
          cx: face.cx,
          cy: face.cy,
          r: 12,
          stroke: 1.25,
        }
  );

  return [
    { t: 'path', d: GAMEPAD_BODY_PATH, stroke: 1.5 },
    {
      t: 'group',
      x: GAMEPAD_DPAD_ORIGIN.x,
      y: GAMEPAD_DPAD_ORIGIN.y,
      children: dpad,
    },
    {
      t: 'circle',
      cx: GAMEPAD_L_STICK.cx,
      cy: GAMEPAD_L_STICK.cy,
      r: 22,
      stroke: 1.25,
    },
    {
      t: 'circle',
      cx: GAMEPAD_L_STICK.cx,
      cy: GAMEPAD_L_STICK.cy,
      r: 16,
      stroke: 1.25,
    },
    {
      t: 'circle',
      cx: activity.stick.cx,
      cy: activity.stick.cy,
      r: 2.4,
      fill: WHITE,
      fillAlpha: activity.stick.active ? 0.95 : 0.85,
    },
    ...faces,
  ];
}

function screenStroke(design: number, scale: number): number {
  return Math.max(design, 1 / scale);
}

function paintPixiOps(gfx: Graphics, ops: DrawOp[], scale: number): void {
  for (const op of ops) {
    if (op.t === 'group') {
      gfx.save();
      gfx.translateTransform(op.x, op.y);
      paintPixiOps(gfx, op.children, scale);
      gfx.restore();
      continue;
    }
    if (op.t === 'path') {
      const path = new GraphicsPath(op.d);
      if (op.fill !== undefined) {
        gfx.path(path).fill({ color: op.fill, alpha: op.fillAlpha ?? 1 });
      }
      if (op.stroke !== undefined) {
        gfx.path(new GraphicsPath(op.d)).stroke({
          width: screenStroke(op.stroke, scale),
          color: WHITE,
          alpha: LINE_ALPHA,
          join: 'round',
        });
      }
      continue;
    }
    if (op.t === 'roundRect') {
      gfx
        .roundRect(op.x, op.y, op.w, op.h, op.r)
        .fill({ color: op.fill, alpha: op.fillAlpha });
      continue;
    }
    if (op.fill !== undefined) {
      gfx
        .circle(op.cx, op.cy, op.r)
        .fill({ color: op.fill, alpha: op.fillAlpha ?? 1 });
    }
    if (op.stroke !== undefined) {
      gfx.circle(op.cx, op.cy, op.r).stroke({
        width: screenStroke(op.stroke, scale),
        color: WHITE,
        alpha: LINE_ALPHA,
      });
    }
  }
}

export function paintMatchGamepadPixi(
  gfx: Graphics,
  reading: MatchPadReading,
  scale: number
): void {
  gfx.clear();
  gfx.resetTransform();
  paintPixiOps(gfx, matchDrawOps(matchPadActivity(reading)), scale);
}

function paintCanvasOps(
  ctx: CanvasRenderingContext2D,
  ops: DrawOp[],
  scale: number
): void {
  for (const op of ops) {
    if (op.t === 'group') {
      ctx.save();
      ctx.translate(op.x, op.y);
      paintCanvasOps(ctx, op.children, scale);
      ctx.restore();
      continue;
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (op.t === 'path') {
      const path = new Path2D(op.d);
      if (op.fill !== undefined) {
        ctx.fillStyle = hexColor(op.fill, op.fillAlpha ?? 1);
        ctx.fill(path);
      }
      if (op.stroke !== undefined) {
        ctx.strokeStyle = hexColor(WHITE, LINE_ALPHA);
        ctx.lineWidth = screenStroke(op.stroke, scale);
        ctx.stroke(path);
      }
      continue;
    }
    if (op.t === 'roundRect') {
      ctx.beginPath();
      ctx.roundRect(op.x, op.y, op.w, op.h, op.r);
      ctx.fillStyle = hexColor(op.fill, op.fillAlpha);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
    if (op.fill !== undefined) {
      ctx.fillStyle = hexColor(op.fill, op.fillAlpha ?? 1);
      ctx.fill();
    }
    if (op.stroke !== undefined) {
      ctx.strokeStyle = hexColor(WHITE, LINE_ALPHA);
      ctx.lineWidth = screenStroke(op.stroke, scale);
      ctx.stroke();
    }
  }
}

function hexColor(color: number, alpha: number): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function paintMatchGamepadCanvas(
  ctx: CanvasRenderingContext2D,
  reading: MatchPadReading,
  centerX: number,
  centerY: number,
  scale: number
): void {
  const left = centerX - GAMEPAD_VIEW.cx * scale;
  const top = centerY - GAMEPAD_VIEW.cy * scale;
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(scale, scale);
  paintCanvasOps(ctx, matchDrawOps(matchPadActivity(reading)), scale);
  ctx.restore();
}
