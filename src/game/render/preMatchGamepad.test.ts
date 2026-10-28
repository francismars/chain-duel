import { describe, expect, it } from 'vitest';
import {
  matchPadActivity,
  preMatchGamepadIndex,
  type MatchPadReading,
} from '@/game/render/preMatchGamepad';

function pad(
  pressed: number[] = [],
  axes: number[] = [0, 0, 0, 0]
): MatchPadReading {
  return {
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: pressed.includes(index),
      value: pressed.includes(index) ? 1 : 0,
    })),
    axes,
  };
}

describe('preMatchGamepadIndex', () => {
  it('gives each human their own pad when both are playing', () => {
    expect(preMatchGamepadIndex('p1', ['p1', 'p2'], [0, 1])).toBe(0);
    expect(preMatchGamepadIndex('p2', ['p1', 'p2'], [0, 1])).toBe(1);
    expect(preMatchGamepadIndex('p1', ['p1', 'p2'], [1])).toBeNull();
    expect(preMatchGamepadIndex('p2', ['p1', 'p2'], [0])).toBeNull();
  });

  it('uses the connected pad for a single human', () => {
    expect(preMatchGamepadIndex('p2', ['p2'], [0])).toBe(0);
    expect(preMatchGamepadIndex('p1', ['p1'], [1])).toBe(1);
    expect(preMatchGamepadIndex('p1', ['p1'], [])).toBeNull();
  });

  it('leaves extra humans on the keyboard', () => {
    expect(preMatchGamepadIndex('p3', ['p1', 'p3'], [0])).toBeNull();
    expect(preMatchGamepadIndex('p4', ['p4'], [0, 1])).toBeNull();
  });
});

describe('matchPadActivity', () => {
  it('lights the d-pad, left stick, and confirm faces only', () => {
    const activity = matchPadActivity(
      pad([0, 2, 12, 6], [0.6, -0.4, 0.9, 0.9])
    );
    expect(activity.dpad).toEqual({
      up: true,
      down: false,
      left: false,
      right: false,
    });
    expect(activity.stick.active).toBe(true);
    expect(activity.faces.map((face) => face.label)).toEqual(['B', 'A', 'X']);
    expect(activity.faces.map((face) => face.active)).toEqual([
      true,
      false,
      false,
    ]);
  });
});
