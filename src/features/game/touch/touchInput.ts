import {
  slotBindings,
  type AxisDirection,
  type PlayerControlSlot,
} from '@/lib/controls/playerControls';
import { createStickKeyEvent } from '@/features/game/touchStick';
import { STORAGE_KEY_TOUCH_DPAD } from '@/shared/constants/storageKeys';

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

/**
 * Press or release a direction the same way the landscape stick does, so a
 * phone that blanks `KeyboardEvent.code` still turns.
 */
export function sendDirection(
  slot: PlayerControlSlot,
  direction: AxisDirection,
  type: 'keydown' | 'keyup'
): void {
  const code = slotBindings(slot)[direction];
  window.dispatchEvent(createStickKeyEvent(type, code));
}
