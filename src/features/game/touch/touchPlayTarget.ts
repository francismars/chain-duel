import type { PlayerControlSlot } from '@/lib/controls/playerControls';

/** Fired when the seat or the pause flag the stick should follow changes. */
export const TOUCH_PLAY_TARGET_EVENT = 'chainduel:touch-play-target';

type TouchPlayTarget = {
  getSlot: () => PlayerControlSlot | null;
  active: () => boolean;
};

let target: TouchPlayTarget | null = null;

export function setTouchPlayTarget(next: TouchPlayTarget | null): void {
  target = next;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOUCH_PLAY_TARGET_EVENT));
  }
}

/**
 * Slot the landscape stick should drive, or null when touch play is paused
 * (replay, intro, exit) or when this screen has no single local player.
 */
export function readTouchPlaySlot(): PlayerControlSlot | null {
  if (!target || !target.active()) return null;
  return target.getSlot();
}
