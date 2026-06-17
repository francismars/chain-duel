import { useEffect, useState } from 'react';

export type GamepadButtonSnapshot = {
  pressed: boolean;
  value: number;
};

export type GamepadSnapshot = {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  timestamp: number;
  buttons: GamepadButtonSnapshot[];
  axes: number[];
};

function readGamepad(pad: Gamepad): GamepadSnapshot {
  return {
    id: pad.id,
    index: pad.index,
    connected: pad.connected,
    mapping: pad.mapping,
    timestamp: pad.timestamp,
    buttons: Array.from(pad.buttons, (b) => ({
      pressed: b.pressed,
      value: b.value,
    })),
    axes: Array.from(pad.axes),
  };
}

function readConnectedGamepads(): GamepadSnapshot[] {
  const pads = navigator.getGamepads();
  const out: GamepadSnapshot[] = [];
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (pad?.connected) out.push(readGamepad(pad));
  }
  return out;
}

/**
 * Polls connected gamepads for display only — does not dispatch keyboard events.
 */
export function useGamepadSnapshot(active: boolean): GamepadSnapshot[] {
  const [gamepads, setGamepads] = useState<GamepadSnapshot[]>(() =>
    active ? readConnectedGamepads() : []
  );

  useEffect(() => {
    if (!active) {
      setGamepads([]);
      return;
    }

    const refresh = () => setGamepads(readConnectedGamepads());
    refresh();

    const onConnect = () => refresh();
    const onDisconnect = () => refresh();
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    let rafId = 0;
    const tick = () => {
      refresh();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      window.cancelAnimationFrame(rafId);
    };
  }, [active]);

  return gamepads;
}
