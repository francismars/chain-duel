import type { Direction } from '@/game/engine/types';
import type { PlayerControlSlot } from '@/lib/controls/playerControls';

export type HeldAxis = 'up' | 'down' | 'left' | 'right';

export type HeldAxes = Record<HeldAxis, boolean>;

export type SlotHeldInput = {
  axes: HeldAxes;
  lastAxis?: HeldAxis;
};

export type HeldInputState = Record<PlayerControlSlot, SlotHeldInput>;

export function createEmptyHeldAxes(): HeldAxes {
  return { up: false, down: false, left: false, right: false };
}

export function createEmptyHeldInputState(): HeldInputState {
  return {
    p1: { axes: createEmptyHeldAxes() },
    p2: { axes: createEmptyHeldAxes() },
    p3: { axes: createEmptyHeldAxes() },
    p4: { axes: createEmptyHeldAxes() },
  };
}

const AXIS_TO_DIR: Record<HeldAxis, Exclude<Direction, ''>> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

function isFacingHorizontal(facing: Direction): boolean {
  return facing === 'Left' || facing === 'Right' || facing === '';
}

function collectHeldDirections(held: HeldAxes): {
  horizontal: Exclude<Direction, ''>[];
  vertical: Exclude<Direction, ''>[];
} {
  const horizontal: Exclude<Direction, ''>[] = [];
  const vertical: Exclude<Direction, ''>[] = [];
  if (held.left) horizontal.push('Left');
  if (held.right) horizontal.push('Right');
  if (held.up) vertical.push('Up');
  if (held.down) vertical.push('Down');
  return { horizontal, vertical };
}

/**
 * Pick one steering direction from held keys.
 * Two perpendicular axes (e.g. left + down) alternate each tick via facing.
 */
export function resolveHeldSteeringDirection(
  facing: Direction,
  held: HeldAxes,
  lastAxis?: HeldAxis
): Exclude<Direction, ''> | null {
  const { horizontal, vertical } = collectHeldDirections(held);
  if (horizontal.length === 0 && vertical.length === 0) {
    return null;
  }

  if (horizontal.length > 0 && vertical.length > 0) {
    const pool = isFacingHorizontal(facing) ? vertical : horizontal;
    return pool[0] ?? null;
  }

  const pool = horizontal.length > 0 ? horizontal : vertical;
  if (pool.length === 1) {
    return pool[0] ?? null;
  }

  if (lastAxis && held[lastAxis]) {
    return AXIS_TO_DIR[lastAxis];
  }
  return pool[0] ?? null;
}

export function engineDirectionToHeldAxis(
  dir: Exclude<Direction, ''>
): HeldAxis {
  switch (dir) {
    case 'Up':
      return 'up';
    case 'Down':
      return 'down';
    case 'Left':
      return 'left';
    case 'Right':
      return 'right';
  }
}
