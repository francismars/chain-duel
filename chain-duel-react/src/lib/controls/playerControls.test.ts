import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmKeyCode,
  DEFAULT_CONFIRM_BINDINGS,
  DEFAULT_SLOT_BINDINGS,
  inferLayoutFromKeyEvent,
  labelForKeyCode,
  resetSlotBindings,
  resolveDirectionForCode,
  resolveDirectionFromKeyboardEvent,
  slotBindingLabels,
  slotBindings,
  writeConfirmBinding,
  writeSlotBinding,
} from '@/lib/controls/playerControls';

describe('playerControls', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
    });
  });

  it('maps physical WASD codes on AZERTY labels', () => {
    const labels = slotBindingLabels('p1', 'azerty');
    expect(labels.up).toBe('Z');
    expect(labels.left).toBe('Q');
    expect(labels.down).toBe('S');
    expect(labels.right).toBe('D');
  });

  it('resolves movement by keyboard code regardless of layout character', () => {
    expect(resolveDirectionForCode('KeyW', 'p1')).toBe('up');
    expect(
      resolveDirectionFromKeyboardEvent(
        { code: 'KeyW', key: 'z' },
        'p1'
      )
    ).toBe('up');
  });

  it('labels arrow keys with glyphs', () => {
    expect(labelForKeyCode('ArrowUp', 'qwerty')).toBe('↑');
  });

  it('stores custom bindings per slot', () => {
    resetSlotBindings('p1');
    writeSlotBinding('p1', 'up', 'KeyE');
    expect(slotBindings('p1').up).toBe('KeyE');
    expect(slotBindings('p1').down).toBe(DEFAULT_SLOT_BINDINGS.p1.down);
    resetSlotBindings('p1');
    expect(slotBindings('p1')).toEqual(DEFAULT_SLOT_BINDINGS.p1);
  });

  it('stores custom confirm bindings per slot', () => {
    resetSlotBindings('p1');
    writeConfirmBinding('p1', 'KeyF');
    expect(confirmKeyCode('p1')).toBe('KeyF');
    resetSlotBindings('p1');
    expect(confirmKeyCode('p1')).toBe(DEFAULT_CONFIRM_BINDINGS.p1);
  });

  it('infers AZERTY from KeyW producing z', () => {
    expect(inferLayoutFromKeyEvent({ code: 'KeyW', key: 'z' })).toBe('azerty');
  });
});
