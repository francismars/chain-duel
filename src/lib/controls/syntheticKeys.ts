/**
 * Keyboard events we create ourselves (gamepad polling, on-screen touch
 * controls). Game and menu code only listens for keys, so every input source
 * speaks keyboard; this records which source a synthetic event came from.
 */
export type SyntheticKeySource = 'gamepad' | 'touch';

const sources = new WeakMap<Event, SyntheticKeySource>();

export function dispatchSyntheticKey(
  type: 'keydown' | 'keyup',
  init: { key?: string; code?: string },
  source: SyntheticKeySource
): void {
  const event = new KeyboardEvent(type, { ...init, bubbles: true });
  sources.set(event, source);
  window.dispatchEvent(event);
}

export function syntheticKeySource(event: Event): SyntheticKeySource | null {
  return sources.get(event) ?? null;
}

/** `event.key` a physical press of `code` would report (QWERTY). */
export function keyForCode(code: string): string {
  if (code === 'Space') return ' ';
  if (code === 'Enter' || code === 'NumpadEnter') return 'Enter';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
