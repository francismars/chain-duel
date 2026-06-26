import type { Direction } from '@/game/engine/types';
import type { PlayerControlSlot } from '@/lib/controls/playerControls';
import {
  confirmKeyCode,
  resolveMovementForStateFromKeyboardEvent,
} from '@/lib/controls/playerControls';
import type { GameState } from '@/game/engine/types';

export type PreMatchKeyDir = 'up' | 'down' | 'left' | 'right' | 'confirm';

const held: Partial<Record<PlayerControlSlot, Partial<Record<PreMatchKeyDir, boolean>>>> =
  {};
const pressAt: Partial<Record<string, number>> = {};

function keyId(slot: PlayerControlSlot, dir: PreMatchKeyDir): string {
  return `${slot}:${dir}`;
}

export function clearPreMatchKeyHighlight(): void {
  for (const slot of Object.keys(held) as PlayerControlSlot[]) {
    delete held[slot];
  }
  for (const id of Object.keys(pressAt)) {
    delete pressAt[id];
  }
}

export function setPreMatchKeyHeld(
  slot: PlayerControlSlot,
  dir: PreMatchKeyDir,
  isHeld: boolean
): void {
  if (!held[slot]) held[slot] = {};
  const wasHeld = held[slot]![dir] === true;
  held[slot]![dir] = isHeld;
  if (isHeld && !wasHeld) {
    pressAt[keyId(slot, dir)] = performance.now();
  }
  if (!isHeld) {
    delete pressAt[keyId(slot, dir)];
  }
}

export function isPreMatchKeyHeld(
  slot: PlayerControlSlot,
  dir: PreMatchKeyDir
): boolean {
  return held[slot]?.[dir] === true;
}

function directionToKey(dir: Direction): PreMatchKeyDir | null {
  switch (dir) {
    case 'Up':
      return 'up';
    case 'Down':
      return 'down';
    case 'Left':
      return 'left';
    case 'Right':
      return 'right';
    default:
      return null;
  }
}

/** Sync highlight state from keyboard / gamepad events during pre-match. */
export function applyPreMatchKeyEvent(
  event: Pick<KeyboardEvent, 'code' | 'key'>,
  state: GameState,
  isHeld: boolean
): void {
  if (state.gameStarted) return;

  const movement = resolveMovementForStateFromKeyboardEvent(event, state);
  if (movement) {
    const dir = directionToKey(movement.direction);
    if (dir) setPreMatchKeyHeld(movement.slot, dir, isHeld);
  }

  const slots: PlayerControlSlot[] = ['p1', 'p2', 'p3', 'p4'];
  for (const slot of slots) {
    if (event.code === confirmKeyCode(slot)) {
      setPreMatchKeyHeld(slot, 'confirm', isHeld);
    }
  }
}

export function applyPreMatchAxisHeld(
  slot: PlayerControlSlot,
  axes: { up: boolean; down: boolean; left: boolean; right: boolean }
): void {
  setPreMatchKeyHeld(slot, 'up', axes.up);
  setPreMatchKeyHeld(slot, 'down', axes.down);
  setPreMatchKeyHeld(slot, 'left', axes.left);
  setPreMatchKeyHeld(slot, 'right', axes.right);
}

/** Pop scale + highlight pulse while a key is held. */
export function preMatchKeyCapScale(
  slot: PlayerControlSlot,
  dir: PreMatchKeyDir,
  now = performance.now()
): number {
  if (!isPreMatchKeyHeld(slot, dir)) return 1;
  const started = pressAt[keyId(slot, dir)] ?? now;
  const elapsed = now - started;
  const popIn = Math.min(1, elapsed / 110);
  const popEase = 1 - Math.pow(1 - popIn, 3);
  const pulse = 1 + 0.04 * Math.sin((elapsed / 220) * Math.PI);
  return 1 + 0.09 * popEase * pulse;
}
