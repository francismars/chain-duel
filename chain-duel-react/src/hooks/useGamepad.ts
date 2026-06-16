import { useEffect, useRef } from 'react';
import { CHAIN_DUEL_LNURL_COMPAT_QR_EVENT } from '@/shared/constants/events';

export type GamepadInputMode = 'menu' | 'game';

export type UseGamepadOptions = {
  /**
   * `game` — fire keydown every poll while held (snake turn buffering).
   * `menu` — one step per press; hold repeats at legacy menu rate (~10 Hz).
   */
  inputMode?: GamepadInputMode;
  /**
   * P2P game menu: while held, show scanner-friendly LNURL QR (see `useLnurlCompatibleQrHold`).
   * One pad: LB = P1, RB = P2. Two pads: each pad's LB = that player.
   */
  lnurlCompatScan?: boolean;
};

const JOYSTICK_DEADZONE = 0.6;
const ARCADE_CENTER_X = 0.003921627998352051;
const ARCADE_CENTER_Y = -0.003921568393707275;
/** Legacy menus polled gamepads at 10 Hz; delay before hold-repeat kicks in. */
const MENU_REPEAT_DELAY_MS = 350;
const MENU_REPEAT_INTERVAL_MS = 100;

function dispatchKey(type: 'keydown' | 'keyup', init: { key?: string; code?: string }) {
  window.dispatchEvent(new KeyboardEvent(type, { ...init, bubbles: true }));
}

/** Per-key press / hold-repeat (menu mode only). */
class KeyRepeater {
  private held = false;
  private heldSince = 0;
  private lastFire = 0;

  tick(down: boolean, now: number, fire: () => void): void {
    if (!down) {
      this.held = false;
      return;
    }
    if (!this.held) {
      this.held = true;
      this.heldSince = now;
      this.lastFire = now;
      fire();
      return;
    }
    if (now - this.heldSince < MENU_REPEAT_DELAY_MS) return;
    if (now - this.lastFire >= MENU_REPEAT_INTERVAL_MS) {
      this.lastFire = now;
      fire();
    }
  }
}

type PlayerKeys = { up: string; down: string; left: string; right: string };

type PadPollState = {
  up: KeyRepeater;
  down: KeyRepeater;
  left: KeyRepeater;
  right: KeyRepeater;
  face: KeyRepeater;
  axis9: number | undefined;
};

function createPadPollState(): PadPollState {
  return {
    up: new KeyRepeater(),
    down: new KeyRepeater(),
    left: new KeyRepeater(),
    right: new KeyRepeater(),
    face: new KeyRepeater(),
    axis9: undefined,
  };
}

function fireDirection(
  mode: GamepadInputMode,
  state: PadPollState,
  now: number,
  which: 'up' | 'down' | 'left' | 'right',
  down: boolean,
  key: string
) {
  if (mode === 'game') {
    if (down) dispatchKey('keydown', { key });
    return;
  }
  state[which].tick(down, now, () => dispatchKey('keydown', { key }));
}

function fireFace(mode: GamepadInputMode, state: PadPollState, now: number, down: boolean, key: string) {
  if (mode === 'game') {
    if (down) dispatchKey('keydown', { key });
    return;
  }
  state.face.tick(down, now, () => dispatchKey('keydown', { key }));
}

function pollArcadeAxis9(
  mode: GamepadInputMode,
  state: PadPollState,
  now: number,
  axis9: number | undefined,
  keys: PlayerKeys
) {
  if (axis9 === undefined) {
    state.axis9 = undefined;
    return;
  }

  const fireKeys = (mapping: Array<keyof PlayerKeys>) => {
    for (const dir of mapping) {
      fireDirection(mode, state, now, dir, true, keys[dir]);
    }
  };

  if (mode === 'game') {
    switch (axis9) {
      case -1:
        dispatchKey('keydown', { key: keys.up });
        break;
      case 1:
        dispatchKey('keydown', { key: keys.up });
        dispatchKey('keydown', { key: keys.left });
        break;
      case 0.14285719394683838:
        dispatchKey('keydown', { key: keys.down });
        break;
      case -0.1428571343421936:
        dispatchKey('keydown', { key: keys.down });
        dispatchKey('keydown', { key: keys.right });
        break;
      case 0.7142857313156128:
        dispatchKey('keydown', { key: keys.left });
        break;
      case -0.7142857313156128:
        dispatchKey('keydown', { key: keys.up });
        dispatchKey('keydown', { key: keys.right });
        break;
      case -0.4285714030265808:
        dispatchKey('keydown', { key: keys.right });
        break;
      case 0.4285714626312256:
        dispatchKey('keydown', { key: keys.down });
        dispatchKey('keydown', { key: keys.left });
        break;
      default:
        break;
    }
    return;
  }

  if (state.axis9 !== axis9) {
    state.axis9 = axis9;
    switch (axis9) {
      case -1:
        fireKeys(['up']);
        break;
      case 1:
        fireKeys(['up', 'left']);
        break;
      case 0.14285719394683838:
        fireKeys(['down']);
        break;
      case -0.1428571343421936:
        fireKeys(['down', 'right']);
        break;
      case 0.7142857313156128:
        fireKeys(['left']);
        break;
      case -0.7142857313156128:
        fireKeys(['up', 'right']);
        break;
      case -0.4285714030265808:
        fireKeys(['right']);
        break;
      case 0.4285714626312256:
        fireKeys(['down', 'left']);
        break;
      default:
        break;
    }
    return;
  }

  switch (axis9) {
    case -1:
      fireDirection(mode, state, now, 'up', true, keys.up);
      break;
    case 1:
      fireDirection(mode, state, now, 'up', true, keys.up);
      fireDirection(mode, state, now, 'left', true, keys.left);
      break;
    case 0.14285719394683838:
      fireDirection(mode, state, now, 'down', true, keys.down);
      break;
    case -0.1428571343421936:
      fireDirection(mode, state, now, 'down', true, keys.down);
      fireDirection(mode, state, now, 'right', true, keys.right);
      break;
    case 0.7142857313156128:
      fireDirection(mode, state, now, 'left', true, keys.left);
      break;
    case -0.7142857313156128:
      fireDirection(mode, state, now, 'up', true, keys.up);
      fireDirection(mode, state, now, 'right', true, keys.right);
      break;
    case -0.4285714030265808:
      fireDirection(mode, state, now, 'right', true, keys.right);
      break;
    case 0.4285714626312256:
      fireDirection(mode, state, now, 'down', true, keys.down);
      fireDirection(mode, state, now, 'left', true, keys.left);
      break;
    default:
      break;
  }
}

function pollPlayerPad(
  pad: Gamepad,
  mode: GamepadInputMode,
  state: PadPollState,
  now: number,
  keys: PlayerKeys,
  faceKey: string,
  controlCode: 'ControlLeft' | 'ControlRight'
) {
  const faceDown =
    !!pad.buttons[0]?.pressed ||
    !!pad.buttons[1]?.pressed ||
    !!pad.buttons[2]?.pressed ||
    !!pad.buttons[3]?.pressed;
  fireFace(mode, state, now, faceDown, faceKey);

  const upDown = !!pad.buttons[12]?.pressed || pad.axes[1] < -JOYSTICK_DEADZONE;
  const downDown = !!pad.buttons[13]?.pressed || pad.axes[1] > JOYSTICK_DEADZONE;
  const leftDown = !!pad.buttons[14]?.pressed || pad.axes[0] < -JOYSTICK_DEADZONE;
  const rightDown = !!pad.buttons[15]?.pressed || pad.axes[0] > JOYSTICK_DEADZONE;

  fireDirection(mode, state, now, 'up', upDown, keys.up);
  fireDirection(mode, state, now, 'down', downDown, keys.down);
  fireDirection(mode, state, now, 'left', leftDown, keys.left);
  fireDirection(mode, state, now, 'right', rightDown, keys.right);

  if (mode === 'game') {
    if (pad.buttons[12] && pad.buttons[13] && pad.buttons[14] && pad.buttons[15]) {
      if (
        !pad.buttons[12].pressed &&
        !pad.buttons[13].pressed &&
        !pad.buttons[14].pressed &&
        !pad.buttons[15].pressed
      ) {
        dispatchKey('keyup', { key: keys.up });
      }
    }
    if (pad.axes[0] === ARCADE_CENTER_X && pad.axes[1] === ARCADE_CENTER_Y) {
      dispatchKey('keyup', { key: keys.up });
    }
  } else if (!upDown && !downDown && !leftDown && !rightDown) {
    state.up.tick(false, now, () => {});
    state.down.tick(false, now, () => {});
    state.left.tick(false, now, () => {});
    state.right.tick(false, now, () => {});
    state.axis9 = undefined;
  }

  pollArcadeAxis9(mode, state, now, pad.axes[9], keys);

  if (pad.buttons[6]?.pressed || pad.buttons[7]?.pressed) {
    dispatchKey('keydown', { code: controlCode });
  } else {
    dispatchKey('keyup', { code: controlCode });
  }
}

type PollSessionState = {
  p1: PadPollState;
  p2: PadPollState;
};

function createPollSessionState(): PollSessionState {
  return { p1: createPadPollState(), p2: createPadPollState() };
}

/**
 * Poll gamepads and dispatch keyboard events.
 * Use `inputMode: 'game'` during snake gameplay; default `menu` for navigation pages.
 */
export function pollGamepads(mode: GamepadInputMode = 'menu', session = createPollSessionState()) {
  const now = performance.now();
  const gamepads = navigator.getGamepads();
  const pad1 = gamepads[0];
  const pad2 = gamepads[1];

  if (pad1) {
    pollPlayerPad(pad1, mode, session.p1, now, { up: 'w', down: 's', left: 'a', right: 'd' }, ' ', 'ControlLeft');
  }
  if (pad2) {
    pollPlayerPad(
      pad2,
      mode,
      session.p2,
      now,
      { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
      'Enter',
      'ControlRight'
    );
  }
}

/**
 * Hook for gamepad support.
 * Polls on requestAnimationFrame (game) or the same loop with menu-friendly repeat rules.
 */
export function useGamepad(enabled: boolean = true, options?: UseGamepadOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;
  const sessionRef = useRef<PollSessionState>(createPollSessionState());

  useEffect(() => {
    if (!enabled) return;

    let compatP1Pad = false;
    let compatP2Pad = false;

    const dispatchLnurlCompat = (player: 1 | 2, pressed: boolean) => {
      window.dispatchEvent(
        new CustomEvent(CHAIN_DUEL_LNURL_COMPAT_QR_EVENT, {
          detail: { player, pressed },
        })
      );
    };

    const tick = () => {
      const mode = optsRef.current?.inputMode ?? 'menu';
      pollGamepads(mode, sessionRef.current);

      const compatEnabled = optsRef.current?.lnurlCompatScan === true;
      if (compatEnabled) {
        const gamepads = navigator.getGamepads();
        const g1 = gamepads[0] || null;
        const g2 = gamepads[1] || null;
        let p1Want = false;
        let p2Want = false;
        if (g1 && g2) {
          p1Want = !!g1.buttons[4]?.pressed;
          p2Want = !!g2.buttons[4]?.pressed;
        } else if (g1) {
          p1Want = !!g1.buttons[4]?.pressed;
          p2Want = !!g1.buttons[5]?.pressed;
        } else if (g2) {
          p2Want = !!g2.buttons[4]?.pressed;
        }
        if (p1Want !== compatP1Pad) {
          dispatchLnurlCompat(1, p1Want);
          compatP1Pad = p1Want;
        }
        if (p2Want !== compatP2Pad) {
          dispatchLnurlCompat(2, p2Want);
          compatP2Pad = p2Want;
        }
      } else {
        if (compatP1Pad) {
          dispatchLnurlCompat(1, false);
          compatP1Pad = false;
        }
        if (compatP2Pad) {
          dispatchLnurlCompat(2, false);
          compatP2Pad = false;
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    let rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      sessionRef.current = createPollSessionState();
      dispatchLnurlCompat(1, false);
      dispatchLnurlCompat(2, false);
    };
  }, [enabled]);
}
