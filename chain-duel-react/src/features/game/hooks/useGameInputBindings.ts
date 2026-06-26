import { useEffect, type MutableRefObject } from 'react';
import {
  resolveMovementForStateFromKeyboardEvent,
  isConfirmKeyForState,
} from '@/lib/controls/playerControls';
import { engineDirectionToHeldAxis } from '@/lib/controls/applyHeldInputSteering';
import {
  createEmptyHeldInputState,
  type HeldAxis,
  type HeldInputState,
} from '@/lib/controls/heldDirectionSteering';
import {
  canContinueAfterGame,
  setControllerTestHeld,
  setExtraControllerTestHeld,
  setExtraSnakeWantedDirection,
  setWantedDirection,
  startCountdown,
} from '@/game/engine';
import { applyPreMatchKeyEvent } from '@/game/render/preMatchKeyHighlight';
import type { GameState } from '@/game/engine/types';
import { NAVIGATE_AFTER_FINISH_DELAY_MS } from '@/shared/constants/timeouts';

interface UseGameInputBindingsArgs {
  stateRef: MutableRefObject<GameState | null>;
  winnerSentRef: MutableRefObject<boolean>;
  onEmitWinner: (winner: 'P1' | 'P2') => void;
  onNavigateAfterFinish: (isTournament: boolean) => void;
  /** When provided, start-key presses are ignored until this ref is true (reveal animation gate). */
  readyToStartRef?: MutableRefObject<boolean>;
  /** When true, ignore continue keys (e.g. challenge win validating on server). */
  blockContinueAfterGameRef?: MutableRefObject<boolean>;
  /** Tracks keys held for diagonal steering (applied each sim tick). */
  heldInputRef?: MutableRefObject<HeldInputState>;
}

function applyPreStartControllerTest(
  state: GameState,
  event: Pick<KeyboardEvent, 'code' | 'key'>,
  held: boolean
): void {
  if (state.gameStarted) return;
  applyPreMatchKeyEvent(event, state, held);
  const movement = resolveMovementForStateFromKeyboardEvent(event, state);
  if (!movement) return;

  switch (movement.slot) {
    case 'p1':
      setControllerTestHeld(state, 'P1', held);
      break;
    case 'p2':
      setControllerTestHeld(state, 'P2', held);
      break;
    case 'p3':
      setExtraControllerTestHeld(state, 0, held);
      break;
    case 'p4':
      setExtraControllerTestHeld(state, 1, held);
      break;
    default:
      break;
  }
}

function applyGameplayDirection(
  state: GameState,
  event: Pick<KeyboardEvent, 'code' | 'key'>
): void {
  const movement = resolveMovementForStateFromKeyboardEvent(event, state);
  if (!movement) return;

  switch (movement.slot) {
    case 'p1':
      setWantedDirection(state, 'P1', movement.direction);
      break;
    case 'p2':
      setWantedDirection(state, 'P2', movement.direction);
      break;
    case 'p3':
      setExtraSnakeWantedDirection(state, 0, movement.direction);
      break;
    case 'p4':
      setExtraSnakeWantedDirection(state, 1, movement.direction);
      break;
    default:
      break;
  }
}

function setHeldAxis(
  heldInput: HeldInputState,
  slot: keyof HeldInputState,
  axis: HeldAxis,
  isDown: boolean,
  trackLastAxis: boolean
): void {
  heldInput[slot].axes[axis] = isDown;
  if (isDown && trackLastAxis) {
    heldInput[slot].lastAxis = axis;
  }
}

function syncHeldFromMovement(
  heldInput: HeldInputState,
  event: Pick<KeyboardEvent, 'code' | 'key'>,
  state: GameState,
  isDown: boolean
): void {
  const movement = resolveMovementForStateFromKeyboardEvent(event, state);
  if (!movement) return;
  const axis = engineDirectionToHeldAxis(movement.direction);
  setHeldAxis(heldInput, movement.slot, axis, isDown, isDown);
}

export function useGameInputBindings({
  stateRef,
  winnerSentRef,
  onEmitWinner,
  onNavigateAfterFinish,
  readyToStartRef,
  blockContinueAfterGameRef,
  heldInputRef,
}: UseGameInputBindingsArgs) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state) return;
      if (!state.gameStarted && isConfirmKeyForState(event, state)) {
        event.preventDefault();
        if (!readyToStartRef || readyToStartRef.current) {
          startCountdown(state);
        }
      }

      if (canContinueAfterGame(state, event.key)) {
        if (blockContinueAfterGameRef?.current) return;
        if (!winnerSentRef.current && state.winnerPlayer) {
          onEmitWinner(state.winnerPlayer);
          winnerSentRef.current = true;
        }
        window.setTimeout(
          () => onNavigateAfterFinish(state.meta.isTournament),
          NAVIGATE_AFTER_FINISH_DELAY_MS
        );
        return;
      }

      if (!state.gameStarted) {
        applyPreStartControllerTest(state, event, true);
        return;
      }

      if (heldInputRef) {
        syncHeldFromMovement(heldInputRef.current, event, state, true);
      }
      applyGameplayDirection(state, event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state) return;
      if (!state.gameStarted) {
        applyPreStartControllerTest(state, event, false);
        return;
      }
      if (heldInputRef) {
        syncHeldFromMovement(heldInputRef.current, event, state, false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    onEmitWinner,
    onNavigateAfterFinish,
    stateRef,
    winnerSentRef,
    readyToStartRef,
    blockContinueAfterGameRef,
    heldInputRef,
  ]);
}

export { createEmptyHeldInputState };
