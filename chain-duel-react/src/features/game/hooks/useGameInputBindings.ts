import { useEffect, type MutableRefObject } from 'react';
import {
  canContinueAfterGame,
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
          setWantedDirection(state, 'P1', 'Left');
          break;
        case 'D':
          setWantedDirection(state, 'P1', 'Right');
          break;
        case 'W':
          setWantedDirection(state, 'P1', 'Up');
          break;
        case 'S':
          setWantedDirection(state, 'P1', 'Down');
          break;
        case 'ARROWLEFT':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Left');
          break;
        case 'ARROWRIGHT':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Right');
          break;
        case 'ARROWUP':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Up');
          break;
        case 'ARROWDOWN':
          if (!state.meta.practiceMode) setWantedDirection(state, 'P2', 'Down');
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
