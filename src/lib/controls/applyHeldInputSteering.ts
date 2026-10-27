import {
  setExtraSnakeWantedDirection,
  setWantedDirection,
} from '@/game/engine';
import type { GameState } from '@/game/engine/types';
import type { PlayerControlSlot } from '@/lib/controls/playerControls';
import {
  engineDirectionToHeldAxis,
  resolveHeldSteeringDirection,
  type HeldInputState,
} from '@/lib/controls/heldDirectionSteering';

function slotIsActive(state: GameState, slot: PlayerControlSlot): boolean {
  switch (slot) {
    case 'p1':
      return state.meta.p1Human;
    case 'p2':
      return state.meta.p2Human;
    case 'p3':
      return state.extraSnakes[0]?.humanControlled === true;
    case 'p4':
      return state.extraSnakes[1]?.humanControlled === true;
    default:
      return false;
  }
}

function applyForSlot(
  state: GameState,
  slot: PlayerControlSlot,
  held: HeldInputState[PlayerControlSlot]
): void {
  const dir = resolveHeldSteeringDirection(
    slot === 'p1'
      ? state.p1.dir || state.p1.dirWanted
      : slot === 'p2'
        ? state.p2.dir || state.p2.dirWanted
        : slot === 'p3'
          ? state.extraSnakes[0]?.snake.dir ||
            state.extraSnakes[0]?.snake.dirWanted ||
            ''
          : state.extraSnakes[1]?.snake.dir ||
            state.extraSnakes[1]?.snake.dirWanted ||
            '',
    held.axes,
    held.lastAxis
  );
  if (!dir) return;

  switch (slot) {
    case 'p1':
      setWantedDirection(state, 'P1', dir);
      break;
    case 'p2':
      setWantedDirection(state, 'P2', dir);
      break;
    case 'p3':
      setExtraSnakeWantedDirection(state, 0, dir);
      break;
    case 'p4':
      setExtraSnakeWantedDirection(state, 1, dir);
      break;
    default:
      break;
  }
}

/** Apply held-key diagonal steering once per sim tick (local / challenge). */
export function applyHeldInputSteering(
  state: GameState,
  heldInput: HeldInputState
): void {
  if (!state.gameStarted || state.gameEnded) return;

  const slots: PlayerControlSlot[] = ['p1', 'p2', 'p3', 'p4'];
  for (const slot of slots) {
    if (!slotIsActive(state, slot)) continue;
    applyForSlot(state, slot, heldInput[slot]);
  }
}

export { engineDirectionToHeldAxis };
