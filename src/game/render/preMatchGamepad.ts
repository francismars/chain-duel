import { buttonIsActive } from '@/features/config/gamepadLabels';
import {
  GAMEPAD_FACE,
  GAMEPAD_L_STICK,
  GAMEPAD_VIEW,
  gamepadStickDot,
} from '@/features/config/gamepadDiagramGeometry';
import type { PlayerControlSlot } from '@/lib/controls/playerControls';

export type MatchPadReading = {
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
};

export type MatchFaceId = 'b' | 'a' | 'x' | 'y';

export type MatchPadActivity = {
  dpad: { up: boolean; down: boolean; left: boolean; right: boolean };
  stick: { cx: number; cy: number; active: boolean };
  faces: {
    id: MatchFaceId;
    label: string;
    cx: number;
    cy: number;
    active: boolean;
  }[];
};

const MATCH_FACES: {
  id: MatchFaceId;
  label: string;
  key: MatchFaceId;
}[] = [
  { id: 'b', label: 'B', key: 'b' },
  { id: 'a', label: 'A', key: 'a' },
  { id: 'x', label: 'X', key: 'x' },
  { id: 'y', label: 'Y', key: 'y' },
];

function buttonDown(pad: MatchPadReading, index: number): boolean {
  const button = pad.buttons[index];
  if (!button) return false;
  return buttonIsActive(button.value, button.pressed);
}

/** D-pad, left stick, and the face buttons shown before the match. */
export function matchPadActivity(pad: MatchPadReading): MatchPadActivity {
  const stick = gamepadStickDot(
    pad.axes[0] ?? 0,
    pad.axes[1] ?? 0,
    GAMEPAD_L_STICK.cx,
    GAMEPAD_L_STICK.cy
  );
  return {
    dpad: {
      up: buttonDown(pad, 12),
      down: buttonDown(pad, 13),
      left: buttonDown(pad, 14),
      right: buttonDown(pad, 15),
    },
    stick,
    faces: MATCH_FACES.map((face) => {
      const point = GAMEPAD_FACE[face.key];
      return {
        id: face.id,
        label: face.label,
        cx: point.cx,
        cy: point.cy,
        active: buttonDown(pad, point.index),
      };
    }),
  };
}

/**
 * Pad 0 drives player 1, pad 1 drives player 2.
 * A single human cluster uses whichever of those pads is connected.
 * Players 3 and 4 stay on the keyboard.
 */
export function preMatchGamepadIndex(
  slot: PlayerControlSlot,
  slots: readonly PlayerControlSlot[],
  connected: readonly number[]
): number | null {
  if (slot !== 'p1' && slot !== 'p2') return null;
  const has = (index: number) => connected.includes(index);
  const paired = slots.includes('p1') && slots.includes('p2');
  if (paired) {
    const index = slot === 'p1' ? 0 : 1;
    return has(index) ? index : null;
  }
  if (has(0)) return 0;
  if (has(1)) return 1;
  return null;
}

export function connectedPreMatchPadIndices(): number[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  const pads = navigator.getGamepads();
  const out: number[] = [];
  for (let i = 0; i < 2; i += 1) {
    const pad = pads[i];
    if (pad?.connected) out.push(i);
  }
  return out;
}

export function readMatchPad(index: number): MatchPadReading | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pad = navigator.getGamepads()[index];
  if (!pad?.connected) return null;
  return {
    buttons: Array.from(pad.buttons, (button) => ({
      pressed: button.pressed,
      value: button.value,
    })),
    axes: Array.from(pad.axes),
  };
}

export function matchFaceOffset(
  face: { cx: number; cy: number },
  scale: number
): { x: number; y: number } {
  return {
    x: (face.cx - GAMEPAD_VIEW.cx) * scale,
    y: (face.cy - GAMEPAD_VIEW.cy) * scale,
  };
}

export function matchFaceFontPx(scale: number): number {
  return Math.max(1, 11 * scale);
}
