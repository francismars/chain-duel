import type { Direction } from '@/game/engine/types';
import type { GameState } from '@/game/engine/types';

export type PlayerControlSlot = 'p1' | 'p2' | 'p3' | 'p4';

export type KeyboardLayoutId = 'qwerty' | 'azerty' | 'qwertz';

type AxisDirection = 'up' | 'down' | 'left' | 'right';
type EngineDirection = Exclude<Direction, ''>;

function toEngineDirection(direction: AxisDirection): EngineDirection {
  switch (direction) {
    case 'up':
      return 'Up';
    case 'down':
      return 'Down';
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
  }
}

export const STORAGE_KEY_KEYBOARD_LAYOUT = 'chainduel_keyboardLayout';
export const STORAGE_KEY_LAYOUT_SOURCE = 'chainduel_keyboardLayoutSource';
export const STORAGE_KEY_PLAYER_BINDINGS = 'chainduel_playerBindings';

export const KEYBOARD_LAYOUT_LABELS: Record<KeyboardLayoutId, string> = {
  qwerty: 'QWERTY',
  azerty: 'AZERTY',
  qwertz: 'QWERTZ',
};

export const DEFAULT_SLOT_BINDINGS: Record<
  PlayerControlSlot,
  Record<AxisDirection, string>
> = {
  p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
  p2: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
  },
  p3: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL' },
  p4: { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH' },
};

/** Letter printed on the key cap for each physical code (movement cluster). */
const LAYOUT_CODE_LABELS: Record<
  KeyboardLayoutId,
  Partial<Record<string, string>>
> = {
  qwerty: {},
  azerty: {
    KeyW: 'Z',
    KeyA: 'Q',
    KeyS: 'S',
    KeyD: 'D',
  },
  qwertz: {},
};

const ARROW_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

type SlotOverrides = Partial<Record<AxisDirection, string>> & {
  confirm?: string;
};

type StoredBindings = Partial<Record<PlayerControlSlot, SlotOverrides>>;

export const DEFAULT_CONFIRM_BINDINGS: Record<PlayerControlSlot, string> = {
  p1: 'Space',
  p2: 'Enter',
  p3: 'Enter',
  p4: 'Enter',
};

export function normalizeKeyboardLayoutId(
  raw: string | null | undefined
): KeyboardLayoutId {
  if (raw === 'azerty' || raw === 'qwertz') return raw;
  return 'qwerty';
}

export function readKeyboardLayoutId(): KeyboardLayoutId {
  try {
    return normalizeKeyboardLayoutId(
      localStorage.getItem(STORAGE_KEY_KEYBOARD_LAYOUT)
    );
  } catch {
    return 'qwerty';
  }
}

export function readLayoutSource(): 'auto' | 'manual' {
  try {
    return localStorage.getItem(STORAGE_KEY_LAYOUT_SOURCE) === 'manual'
      ? 'manual'
      : 'auto';
  } catch {
    return 'auto';
  }
}

function dispatchControlsEvent(name: string, detail?: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, detail != null ? { detail } : undefined));
}

export function writeKeyboardLayoutId(
  layout: KeyboardLayoutId,
  source: 'auto' | 'manual' = readLayoutSource()
): void {
  try {
    localStorage.setItem(STORAGE_KEY_KEYBOARD_LAYOUT, layout);
    localStorage.setItem(STORAGE_KEY_LAYOUT_SOURCE, source);
  } catch {
    /* ignore */
  }
  dispatchControlsEvent('chainduel:keyboard-layout', { layout });
}

function readStoredBindings(): StoredBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLAYER_BINDINGS);
    if (!raw) return {};
    return JSON.parse(raw) as StoredBindings;
  } catch {
    return {};
  }
}

function writeStoredBindings(bindings: StoredBindings): void {
  try {
    if (Object.keys(bindings).length === 0) {
      localStorage.removeItem(STORAGE_KEY_PLAYER_BINDINGS);
    } else {
      localStorage.setItem(STORAGE_KEY_PLAYER_BINDINGS, JSON.stringify(bindings));
    }
  } catch {
    /* ignore */
  }
  dispatchControlsEvent('chainduel:player-bindings');
}

export function slotBindings(
  slot: PlayerControlSlot
): Record<AxisDirection, string> {
  const stored = readStoredBindings()[slot] ?? {};
  const defaults = DEFAULT_SLOT_BINDINGS[slot];
  return {
    up: stored.up ?? defaults.up,
    down: stored.down ?? defaults.down,
    left: stored.left ?? defaults.left,
    right: stored.right ?? defaults.right,
  };
}

export function isRebindableKeyCode(code: string): boolean {
  return (
    code.startsWith('Key') ||
    code.startsWith('Arrow') ||
    code.startsWith('Numpad')
  );
}

export function isBindableKeyCode(code: string): boolean {
  return (
    isRebindableKeyCode(code) ||
    code === 'Space' ||
    code === 'Enter' ||
    code === 'NumpadEnter'
  );
}

export function writeSlotBinding(
  slot: PlayerControlSlot,
  direction: AxisDirection,
  code: string
): void {
  const all = readStoredBindings();
  const slotOverrides = { ...all[slot], [direction]: code };
  writeStoredBindings({ ...all, [slot]: slotOverrides });
}

export function confirmKeyCode(slot: PlayerControlSlot): string {
  return readStoredBindings()[slot]?.confirm ?? DEFAULT_CONFIRM_BINDINGS[slot];
}

export function writeConfirmBinding(
  slot: PlayerControlSlot,
  code: string
): void {
  const all = readStoredBindings();
  const slotOverrides = { ...all[slot], confirm: code };
  writeStoredBindings({ ...all, [slot]: slotOverrides });
}

export function resetSlotBindings(slot: PlayerControlSlot): void {
  const all = { ...readStoredBindings() };
  delete all[slot];
  writeStoredBindings(all);
}

export function resetAllPlayerBindings(): void {
  writeStoredBindings({});
}

export function slotHasCustomBindings(slot: PlayerControlSlot): boolean {
  const stored = readStoredBindings()[slot];
  if (!stored) return false;
  const movementDefaults = DEFAULT_SLOT_BINDINGS[slot];
  for (const direction of ['up', 'down', 'left', 'right'] as const) {
    if (
      stored[direction] != null &&
      stored[direction] !== movementDefaults[direction]
    ) {
      return true;
    }
  }
  return (
    stored.confirm != null &&
    stored.confirm !== DEFAULT_CONFIRM_BINDINGS[slot]
  );
}

export async function detectKeyboardLayoutFromApi(): Promise<KeyboardLayoutId | null> {
  try {
    const nav = navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
    };
    if (!nav.keyboard?.getLayoutMap) return null;
    const map = await nav.keyboard.getLayoutMap();
    const keyQ = map.get('KeyQ')?.toLowerCase();
    if (keyQ === 'a') return 'azerty';
    const keyY = map.get('KeyY')?.toLowerCase();
    if (keyY === 'z') return 'qwertz';
    return 'qwerty';
  } catch {
    return null;
  }
}

export function inferLayoutFromKeyEvent(
  event: Pick<KeyboardEvent, 'code' | 'key'>
): KeyboardLayoutId | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : '';
  if (event.code === 'KeyQ' && key === 'a') return 'azerty';
  if (event.code === 'KeyY' && key === 'z') return 'qwertz';
  if (event.code === 'KeyW' && key === 'z') return 'azerty';
  return null;
}

export async function autodetectAndApplyLayout(): Promise<KeyboardLayoutId> {
  const fromApi = await detectKeyboardLayoutFromApi();
  const layout = fromApi ?? readKeyboardLayoutId();
  writeKeyboardLayoutId(layout, 'auto');
  return layout;
}

export function applyInferredLayoutFromKeyEvent(
  event: Pick<KeyboardEvent, 'code' | 'key'>
): KeyboardLayoutId | null {
  if (readLayoutSource() === 'manual') return null;
  const inferred = inferLayoutFromKeyEvent(event);
  if (!inferred) return null;
  if (inferred === readKeyboardLayoutId()) return inferred;
  writeKeyboardLayoutId(inferred, 'auto');
  return inferred;
}

export function labelForKeyCode(
  code: string,
  layout: KeyboardLayoutId = readKeyboardLayoutId()
): string {
  if (ARROW_LABELS[code]) return ARROW_LABELS[code]!;
  const override = LAYOUT_CODE_LABELS[layout][code];
  if (override) return override;
  if (code.startsWith('Key')) return code.slice(3);
  if (code === 'Space') return 'Space';
  if (code === 'Enter' || code === 'NumpadEnter') return 'Enter';
  if (code.startsWith('Numpad')) return code.slice(6);
  return code;
}

export function slotBindingLabels(
  slot: PlayerControlSlot,
  layout: KeyboardLayoutId = readKeyboardLayoutId()
): Record<AxisDirection, string> {
  const bindings = slotBindings(slot);
  return {
    up: labelForKeyCode(bindings.up, layout),
    down: labelForKeyCode(bindings.down, layout),
    left: labelForKeyCode(bindings.left, layout),
    right: labelForKeyCode(bindings.right, layout),
  };
}

export function confirmKeyLabel(
  slot: PlayerControlSlot,
  layout: KeyboardLayoutId = readKeyboardLayoutId()
): string {
  return labelForKeyCode(confirmKeyCode(slot), layout);
}

export function isConfirmKeyForState(
  event: Pick<KeyboardEvent, 'code'>,
  state: GameState
): boolean {
  const code = event.code;
  if (state.meta.p1Human && code === confirmKeyCode('p1')) return true;
  if (state.meta.p2Human && code === confirmKeyCode('p2')) return true;
  if (state.extraSnakes[0]?.humanControlled && code === confirmKeyCode('p3')) {
    return true;
  }
  if (state.extraSnakes[1]?.humanControlled && code === confirmKeyCode('p4')) {
    return true;
  }
  return false;
}

export function resolveDirectionForCode(
  code: string,
  slot: PlayerControlSlot
): AxisDirection | null {
  const bindings = slotBindings(slot);
  for (const direction of ['up', 'down', 'left', 'right'] as const) {
    if (bindings[direction] === code) return direction;
  }
  return null;
}

/** Map keyboard event to direction for local play (code-first, key fallback for gamepad). */
export function resolveDirectionFromKeyboardEvent(
  event: Pick<KeyboardEvent, 'code' | 'key'>,
  slot: PlayerControlSlot
): AxisDirection | null {
  const fromCode = resolveDirectionForCode(event.code, slot);
  if (fromCode) return fromCode;

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const legacy = resolveDirectionForLegacyKey(key, slot);
  return legacy;
}

function resolveDirectionForLegacyKey(
  key: string,
  slot: PlayerControlSlot
): AxisDirection | null {
  switch (slot) {
    case 'p1':
      if (key === 'W') return 'up';
      if (key === 'S') return 'down';
      if (key === 'A') return 'left';
      if (key === 'D') return 'right';
      return null;
    case 'p2':
      if (key === 'ArrowUp') return 'up';
      if (key === 'ArrowDown') return 'down';
      if (key === 'ArrowLeft') return 'left';
      if (key === 'ArrowRight') return 'right';
      return null;
    case 'p3':
      if (key === 'I') return 'up';
      if (key === 'K') return 'down';
      if (key === 'J') return 'left';
      if (key === 'L') return 'right';
      return null;
    case 'p4':
      if (key === 'T') return 'up';
      if (key === 'G') return 'down';
      if (key === 'F') return 'left';
      if (key === 'H') return 'right';
      return null;
    default:
      return null;
  }
}

export function isMovementCodeForState(
  code: string,
  state: GameState
): boolean {
  return resolveMovementForStateFromCode(code, state) != null;
}

export function resolveMovementForStateFromCode(
  code: string,
  state: GameState
): { slot: PlayerControlSlot; direction: EngineDirection } | null {
  if (state.meta.p1Human) {
    const direction = resolveDirectionForCode(code, 'p1');
    if (direction) return { slot: 'p1', direction: toEngineDirection(direction) };
  }
  if (state.meta.p2Human) {
    const direction = resolveDirectionForCode(code, 'p2');
    if (direction) return { slot: 'p2', direction: toEngineDirection(direction) };
  }
  if (state.extraSnakes[0]?.humanControlled) {
    const direction = resolveDirectionForCode(code, 'p3');
    if (direction) return { slot: 'p3', direction: toEngineDirection(direction) };
  }
  if (state.extraSnakes[1]?.humanControlled) {
    const direction = resolveDirectionForCode(code, 'p4');
    if (direction) return { slot: 'p4', direction: toEngineDirection(direction) };
  }
  return null;
}

export function resolveMovementForStateFromKeyboardEvent(
  event: Pick<KeyboardEvent, 'code' | 'key'>,
  state: GameState
): { slot: PlayerControlSlot; direction: EngineDirection } | null {
  const fromCode = resolveMovementForStateFromCode(event.code, state);
  if (fromCode) return fromCode;

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (state.meta.p1Human) {
    const direction = resolveDirectionForLegacyKey(key, 'p1');
    if (direction) return { slot: 'p1', direction: toEngineDirection(direction) };
  }
  if (state.meta.p2Human) {
    const direction = resolveDirectionForLegacyKey(key, 'p2');
    if (direction) return { slot: 'p2', direction: toEngineDirection(direction) };
  }
  if (state.extraSnakes[0]?.humanControlled) {
    const direction = resolveDirectionForLegacyKey(key, 'p3');
    if (direction) return { slot: 'p3', direction: toEngineDirection(direction) };
  }
  if (state.extraSnakes[1]?.humanControlled) {
    const direction = resolveDirectionForLegacyKey(key, 'p4');
    if (direction) return { slot: 'p4', direction: toEngineDirection(direction) };
  }
  return null;
}

export function humanControlSlotsFromConfig(
  cfg: Record<string, unknown>
): PlayerControlSlot[] {
  const isPracticeMode = Boolean(cfg.practiceMode);
  let p1Human = true;
  let p2Human = !isPracticeMode;
  if (typeof cfg.p1Human === 'boolean') p1Human = cfg.p1Human;
  if (typeof cfg.p2Human === 'boolean') p2Human = cfg.p2Human;

  const slots: PlayerControlSlot[] = [];
  if (p1Human) slots.push('p1');
  if (p2Human) slots.push('p2');
  if (cfg.p3Human === true) slots.push('p3');
  if (cfg.p4Human === true) slots.push('p4');
  return slots;
}

export const PLAYER_SLOT_INDEX: Record<PlayerControlSlot, number> = {
  p1: 0,
  p2: 1,
  p3: 2,
  p4: 3,
};

export function onlineSlotForLocalSeat(
  isP1: boolean,
  isP2: boolean
): PlayerControlSlot | null {
  if (isP1) return 'p1';
  if (isP2) return 'p2';
  return null;
}
