import { useEffect, type MutableRefObject } from 'react';
import {
  canContinueAfterGame,
  setExtraSnakeWantedDirection,
  setWantedDirection,
  startCountdown,
  switchPlayerLayer,
} from '@/game/engine';
import type { GameState } from '@/game/engine/types';
import { NAVIGATE_AFTER_FINISH_DELAY_MS } from '@/shared/constants/timeouts';

interface UseGameInputBindingsArgs {
  stateRef: MutableRefObject<GameState | null>;
  winnerSentRef: MutableRefObject<boolean>;
  onEmitWinner: (winner: 'P1' | 'P2') => void;
  onNavigateAfterFinish: (isTournament: boolean) => void;
}

export function useGameInputBindings({
  stateRef,
  winnerSentRef,
  onEmitWinner,
  onNavigateAfterFinish,
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
        startCountdown(state);
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
        case 'Q':
          // Phase-shift between 3D board layers (Gauntlet 3D levels)
          switchPlayerLayer(state);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEmitWinner, onNavigateAfterFinish, stateRef, winnerSentRef]);
}
