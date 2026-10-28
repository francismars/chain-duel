/**
 * SN30 Pro shell: two circular grips joined by a short waist.
 * Left center (112, 130) r=70, right center (328, 130) r=70.
 */
export const GAMEPAD_BODY_PATH = [
  'M 112 60',
  'A 70 70 0 1 0 151 188',
  'L 289 188',
  'A 70 70 0 1 0 328 60',
  'L 112 60',
  'Z',
].join(' ');

/** Point on a circle; angles in degrees, SVG y-down (270 = straight up). */
function polar(cx: number, cy: number, r: number, deg: number): string {
  const t = (deg * Math.PI) / 180;
  return `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
}

/**
 * Left-side shoulder band that hugs the grip circle centred on (cx, cy):
 * an arc from `startDeg` up to the top of the grip, then straight to `endX`.
 * Corners are softened with radius `rc`. Mirror it for the right side.
 */
function shoulderBand(
  cx: number,
  cy: number,
  ri: number,
  ro: number,
  startDeg: number,
  endX: number,
  rc = 3
): string {
  const degO = ((rc / ro) * 180) / Math.PI;
  const degI = ((rc / ri) * 180) / Math.PI;
  const top = cy - ro;
  const bottom = cy - ri;
  return [
    `M ${polar(cx, cy, ro, startDeg + degO)}`,
    `A ${ro} ${ro} 0 0 1 ${cx} ${top}`,
    `L ${endX - rc} ${top}`,
    `Q ${endX} ${top} ${endX} ${top + rc}`,
    `L ${endX} ${bottom - rc}`,
    `Q ${endX} ${bottom} ${endX - rc} ${bottom}`,
    `L ${cx} ${bottom}`,
    `A ${ri} ${ri} 0 0 0 ${polar(cx, cy, ri, startDeg + degI)}`,
    `Q ${polar(cx, cy, ri, startDeg)} ${polar(cx, cy, ri + rc, startDeg)}`,
    `L ${polar(cx, cy, ro - rc, startDeg)}`,
    `Q ${polar(cx, cy, ro, startDeg)} ${polar(cx, cy, ro, startDeg + degO)}`,
    'Z',
  ].join(' ');
}

/** L1 sits on the shell outline. L2 sits on L1's outer edge. */
export const GAMEPAD_L1_PATH = shoulderBand(112, 130, 70, 80, 220, 166);
export const GAMEPAD_L2_PATH = shoulderBand(112, 130, 80, 89, 234, 154);
/** Mirror across the controller's centre line (x = 220). */
export const GAMEPAD_MIRROR = 'translate(440 0) scale(-1 1)';

export const GAMEPAD_L_STICK = { cx: 176, cy: 158 };
export const GAMEPAD_R_STICK = { cx: 264, cy: 158 };

export const GAMEPAD_FACE: Record<
  'x' | 'y' | 'a' | 'b',
  { cx: number; cy: number; index: number }
> = {
  x: { cx: 324, cy: 88, index: 3 },
  y: { cx: 300, cy: 112, index: 2 },
  a: { cx: 348, cy: 112, index: 1 },
  b: { cx: 324, cy: 136, index: 0 },
};

export const GAMEPAD_DPAD_ORIGIN = { x: 94, y: 90 };

export const GAMEPAD_DPAD_UP =
  'M 16 18 V 4 Q 16 0 20 0 H 28 Q 32 0 32 4 V 18 Z';
export const GAMEPAD_DPAD_DOWN =
  'M 16 30 V 44 Q 16 48 20 48 H 28 Q 32 48 32 44 V 30 Z';
export const GAMEPAD_DPAD_LEFT =
  'M 18 16 H 4 Q 0 16 0 20 V 28 Q 0 32 4 32 H 18 Z';
export const GAMEPAD_DPAD_RIGHT =
  'M 30 16 H 44 Q 48 16 48 20 V 28 Q 48 32 44 32 H 30 Z';
export const GAMEPAD_DPAD_OUTLINE =
  'M 16 4 Q 16 0 20 0 H 28 Q 32 0 32 4 V 16 H 44 Q 48 16 48 20 V 28 Q 48 32 44 32 H 32 V 44 Q 32 48 28 48 H 20 Q 16 48 16 44 V 32 H 4 Q 0 32 0 28 V 20 Q 0 16 4 16 H 16 Z';

export const GAMEPAD_VIEW = { w: 440, h: 230, cx: 220, cy: 115 };

/** Outer edge of the two grips, inside the 440×230 view. */
export const GAMEPAD_SHELL = { left: 42, top: 60, right: 398, bottom: 200 };

export function gamepadStickDot(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius = 7
): { cx: number; cy: number; active: boolean } {
  const clampedX = Math.max(-1, Math.min(1, x));
  const clampedY = Math.max(-1, Math.min(1, y));
  return {
    cx: cx + clampedX * radius,
    cy: cy - clampedY * radius,
    active: Math.hypot(clampedX, clampedY) > 0.12,
  };
}
