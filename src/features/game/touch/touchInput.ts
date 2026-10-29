import {
  confirmKeyCode,
  slotBindings,
  type AxisDirection,
  type PlayerControlSlot,
} from '@/lib/controls/playerControls';
import { dispatchSyntheticKey, keyForCode } from '@/lib/controls/syntheticKeys';
import { STORAGE_KEY_TOUCH_DPAD } from '@/shared/constants/storageKeys';

/** Finger travel (CSS px) before a drag counts as a steer. */
export const SWIPE_THRESHOLD_PX = 24;
/** A press shorter than this with no steer is a tap (start / continue). */
export const TAP_MAX_MS = 300;

export const TOUCH_DPAD_EVENT = 'chainduel:touch-dpad';

export function readTouchDpad(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_TOUCH_DPAD) === '1';
  } catch {
    return false;
  }
}

export function writeTouchDpad(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_TOUCH_DPAD, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(TOUCH_DPAD_EVENT));
}

/** Dominant swipe direction once the finger has moved far enough. */
export function swipeDirection(
  dx: number,
  dy: number,
  threshold = SWIPE_THRESHOLD_PX
): AxisDirection | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Press / release a direction exactly like the player's bound key would. */
export function sendDirection(
  slot: PlayerControlSlot,
  direction: AxisDirection,
  type: 'keydown' | 'keyup'
): void {
  const code = slotBindings(slot)[direction];
  dispatchSyntheticKey(type, { code, key: keyForCode(code) }, 'touch');
}

/** Tap = the player's confirm key (start match, continue after a match). */
export function sendConfirm(slot: PlayerControlSlot): void {
  const code = confirmKeyCode(slot);
  const init = { code, key: keyForCode(code) };
  dispatchSyntheticKey('keydown', init, 'touch');
  dispatchSyntheticKey('keyup', init, 'touch');
}
