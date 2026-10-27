import { describe, expect, it } from 'vitest';
import { createGameState } from '@/game/engine';
import { resolveMovementForStateFromCode } from '@/lib/controls/playerControls';
import {
  canSwapSoloHumanSeat,
  soloSeatSwitchHint,
  swapSoloHumanSeat,
} from '@/game/soloSeatSwitch';

describe('soloSeatSwitch', () => {
  it('swaps human seat and names while keeping soloInputSlot', () => {
    const state = createGameState({
      p1Name: 'You',
      p2Name: 'BigToshi 🌊',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'PRACTICE',
      practiceMode: true,
      p1Human: true,
      p2Human: false,
      allowSoloSeatSwitch: true,
      teamMode: 'solo',
    });

    expect(state.meta.soloInputSlot).toBe('p1');
    expect(canSwapSoloHumanSeat(state)).toBe(true);
    expect(soloSeatSwitchHint(state)).toBe('PRESS X TO SWITCH TO BLACK');

    const result = swapSoloHumanSeat(state);
    expect(result).toEqual({
      humanSeat: 'black',
      p1Name: 'BigToshi 🌊',
      p2Name: 'You',
    });
    expect(state.meta.p1Human).toBe(false);
    expect(state.meta.p2Human).toBe(true);
    expect(state.meta.soloInputSlot).toBe('p1');
    expect(soloSeatSwitchHint(state)).toBe('PRESS X TO SWITCH TO WHITE');
  });

  it('does not enable swap for dual-human local play', () => {
    const state = createGameState({
      p1Name: 'P1',
      p2Name: 'P2',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'PRACTICE',
      practiceMode: false,
      p1Human: true,
      p2Human: true,
      allowSoloSeatSwitch: true,
      teamMode: 'solo',
    });
    expect(state.meta.soloInputSlot).toBeUndefined();
    expect(canSwapSoloHumanSeat(state)).toBe(false);
  });

  it('blocks swap after countdown starts', () => {
    const state = createGameState({
      p1Name: 'You',
      p2Name: 'Bot',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'PRACTICE',
      practiceMode: true,
      p1Human: true,
      p2Human: false,
      allowSoloSeatSwitch: true,
      teamMode: 'solo',
    });
    state.countdownStart = true;
    expect(canSwapSoloHumanSeat(state)).toBe(false);
    expect(swapSoloHumanSeat(state)).toBeNull();
  });

  it('keeps WASD bindings on the black seat after swap', () => {
    const state = createGameState({
      p1Name: 'You',
      p2Name: 'Bot',
      p1Points: 1000,
      p2Points: 1000,
      modeLabel: 'PRACTICE',
      practiceMode: true,
      p1Human: true,
      p2Human: false,
      allowSoloSeatSwitch: true,
      teamMode: 'solo',
    });
    swapSoloHumanSeat(state);
    expect(resolveMovementForStateFromCode('KeyW', state)).toEqual({
      slot: 'p2',
      direction: 'Up',
    });
    expect(resolveMovementForStateFromCode('ArrowUp', state)).toEqual({
      slot: 'p2',
      direction: 'Up',
    });
  });
});
