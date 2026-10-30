import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '@/game/engine';
import {
  touchControlSlotForState,
  writeSlotBinding,
} from '@/lib/controls/playerControls';
import { keyForCode } from '@/lib/controls/syntheticKeys';
import { sendDirection } from './touchInput';

class FakeKeyboardEvent {
  type: string;
  key: string;
  code: string;
  constructor(type: string, init: { key?: string; code?: string }) {
    this.type = type;
    this.key = init.key ?? '';
    this.code = init.code ?? '';
  }
}

let dispatched: FakeKeyboardEvent[] = [];

beforeEach(() => {
  dispatched = [];
  const store = new Map<string, string>();
  vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent);
  vi.stubGlobal('window', {
    dispatchEvent: (event: unknown) => {
      // Only record key presses; bindings writes fire their own change event.
      if (event instanceof FakeKeyboardEvent) dispatched.push(event);
    },
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('keyForCode', () => {
  it('maps codes to the key a physical press reports', () => {
    expect(keyForCode('Space')).toBe(' ');
    expect(keyForCode('Enter')).toBe('Enter');
    expect(keyForCode('KeyW')).toBe('w');
    expect(keyForCode('ArrowUp')).toBe('ArrowUp');
  });
});

describe('touch key dispatch', () => {
  it('sends the slot’s bound key the way the stick does', () => {
    sendDirection('p1', 'up', 'keydown');
    sendDirection('p1', 'up', 'keyup');
    expect(dispatched.map((e) => [e.type, e.code, e.key])).toEqual([
      ['keydown', 'KeyW', 'w'],
      ['keyup', 'KeyW', 'w'],
    ]);
  });

  it('follows custom bindings', () => {
    writeSlotBinding('p1', 'left', 'KeyJ');
    sendDirection('p1', 'left', 'keydown');
    expect(dispatched[0].code).toBe('KeyJ');
  });
});

describe('touchControlSlotForState', () => {
  const base = {
    p1Name: 'A',
    p2Name: 'B',
    p1Points: 1000,
    p2Points: 1000,
    modeLabel: 'PRACTICE',
    practiceMode: true,
    teamMode: 'solo' as const,
  };

  it('drives the solo human’s input slot', () => {
    const state = createGameState({ ...base, p1Human: true, p2Human: false });
    expect(touchControlSlotForState(state)).toBe('p1');
  });

  it('is off when two local humans share the screen', () => {
    const state = createGameState({
      ...base,
      practiceMode: false,
      p1Human: true,
      p2Human: true,
    });
    expect(touchControlSlotForState(state)).toBeNull();
  });
});
