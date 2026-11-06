import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPollSessionState, pollGamepads } from './useGamepad';

type FakePad = {
  connected: boolean;
  buttons: { pressed: boolean }[];
  axes: number[];
};

function pad(pressed: number[] = []): FakePad {
  return {
    connected: true,
    buttons: Array.from({ length: 17 }, (_, n) => ({
      pressed: pressed.includes(n),
    })),
    axes: [0, 0, 0, 0],
  };
}

describe('pollGamepads', () => {
  let slots: Array<FakePad | null>;
  let sent: string[];

  beforeEach(() => {
    slots = [null, null];
    sent = [];
    vi.stubGlobal(
      'KeyboardEvent',
      class {
        constructor(
          public type: string,
          public init: { key?: string }
        ) {}
      }
    );
    vi.stubGlobal('window', {
      dispatchEvent: (e: { type: string; init: { key?: string } }) =>
        sent.push(`${e.type} ${e.init.key}`),
    });
    vi.stubGlobal('navigator', { getGamepads: () => slots });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('releases keys a pad was holding when it drops out', () => {
    const session = createPollSessionState();

    slots = [null, pad([12])];
    pollGamepads('game', session);
    expect(sent).toEqual(['keydown ArrowUp']);

    slots = [null, null];
    pollGamepads('game', session);
    expect(sent).toEqual(['keydown ArrowUp', 'keyup ArrowUp']);

    // Still gone: nothing more to release.
    pollGamepads('game', session);
    expect(sent).toHaveLength(2);
  });

  it('leaves the other pad alone when one drops out', () => {
    const session = createPollSessionState();

    slots = [pad([12]), pad([12])];
    pollGamepads('game', session);
    slots = [pad([12]), null];
    pollGamepads('game', session);
    slots = [pad([12]), pad([12])];
    pollGamepads('game', session);

    expect(sent).toEqual([
      'keydown w',
      'keydown ArrowUp',
      'keyup ArrowUp',
      'keydown ArrowUp',
    ]);
  });
});
