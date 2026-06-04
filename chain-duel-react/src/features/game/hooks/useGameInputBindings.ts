import { useEffect, type MutableRefObject } from 'react';
import {
  canContinueAfterGame,
  setControllerTestHeld,
  setExtraControllerTestHeld,
  setExtraSnakeWantedDirection,
  setWantedDirection,
  startCountdown,
} from '@/game/engine';
import type { GameState } from '@/game/engine/types';
import { NAVIGATE_AFTER_FINISH_DELAY_MS } from '@/shared/constants/timeouts';

interface UseGameInputBindingsArgs {
  stateRef: MutableRefObject<GameState | null>;
  winnerSentRef: MutableRefObject<boolean>;
  onEmitWinner: (winner: 'P1' | 'P2') => void;
  onNavigateAfterFinish: (isTournament: boolean) => void;
  /** When provided, start-key presses are ignored until this ref is true (reveal animation gate). */
  readyToStartRef?: MutableRefObject<boolean>;
}

const P1_MOVE_KEYS = new Set(['A', 'W', 'S', 'D']);
const P2_MOVE_KEYS = new Set(['ARROWLEFT', 'ARROWRIGHT', 'ARROWUP', 'ARROWDOWN']);
const EXTRA0_MOVE_KEYS = new Set(['I', 'J', 'K', 'L']);
const EXTRA1_MOVE_KEYS = new Set(['T', 'F', 'G', 'H']);

function applyPreStartControllerTest(state: GameState, key: string, held: boolean): void {
  if (state.gameStarted) return;
  if (state.meta.p1Human && P1_MOVE_KEYS.has(key)) setControllerTestHeld(state, 'P1', held);
  if (state.meta.p2Human && P2_MOVE_KEYS.has(key)) setControllerTestHeld(state, 'P2', held);
  if (state.extraSnakes[0]?.humanControlled && EXTRA0_MOVE_KEYS.has(key)) {
    setExtraControllerTestHeld(state, 0, held);
  }
  if (state.extraSnakes[1]?.humanControlled && EXTRA1_MOVE_KEYS.has(key)) {
    setExtraControllerTestHeld(state, 1, held);
  }
}

function applyGameplayDirection(state: GameState, key: string): void {
  switch (key) {
    case 'A':
      if (state.meta.p1Human) setWantedDirection(state, 'P1', 'Left');
      break;
    case 'D':
      if (state.meta.p1Human) setWantedDirection(state, 'P1', 'Right');
      break;
    case 'W':
      if (state.meta.p1Human) setWantedDirection(state, 'P1', 'Up');
      break;
    case 'S':
      if (state.meta.p1Human) setWantedDirection(state, 'P1', 'Down');
      break;
    case 'ARROWLEFT':
      if (state.meta.p2Human) setWantedDirection(state, 'P2', 'Left');
      break;
    case 'ARROWRIGHT':
      if (state.meta.p2Human) setWantedDirection(state, 'P2', 'Right');
      break;
    case 'ARROWUP':
      if (state.meta.p2Human) setWantedDirection(state, 'P2', 'Up');
      break;
    case 'ARROWDOWN':
      if (state.meta.p2Human) setWantedDirection(state, 'P2', 'Down');
      break;
    case 'I':
      if (state.extraSnakes[0]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 0, 'Up');
      }
      break;
    case 'J':
      if (state.extraSnakes[0]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 0, 'Left');
      }
      break;
    case 'K':
      if (state.extraSnakes[0]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 0, 'Down');
      }
      break;
    case 'L':
      if (state.extraSnakes[0]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 0, 'Right');
      }
      break;
    case 'T':
      if (state.extraSnakes[1]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 1, 'Up');
      }
      break;
    case 'F':
      if (state.extraSnakes[1]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 1, 'Left');
      }
      break;
    case 'G':
      if (state.extraSnakes[1]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 1, 'Down');
      }
      break;
    case 'H':
      if (state.extraSnakes[1]?.humanControlled) {
        setExtraSnakeWantedDirection(state, 1, 'Right');
      }
      break;
    default:
      break;
  }
}

export function useGameInputBindings({
  stateRef,
  winnerSentRef,
  onEmitWinner,
  onNavigateAfterFinish,
  readyToStartRef,
}: UseGameInputBindingsArgs) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state) return;
      const key = event.key.toUpperCase();
      const isStartKey =
        key === ' ' ||
        key === 'ENTER' ||
        key === 'SPACE' ||
        key === 'SPACEBAR' ||
        event.code === 'Space' ||
        event.code === 'Enter' ||
        event.code === 'NumpadEnter';

      if (!state.gameStarted && isStartKey) {
        event.preventDefault();
        if (!readyToStartRef || readyToStartRef.current) {
          startCountdown(state);
        }
      }

      if (canContinueAfterGame(state, event.key)) {
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
        applyPreStartControllerTest(state, key, true);
        return;
      }

      applyGameplayDirection(state, key);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state || state.gameStarted) return;
      applyPreStartControllerTest(state, event.key.toUpperCase(), false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onEmitWinner, onNavigateAfterFinish, stateRef, winnerSentRef, readyToStartRef]);
}
