import { useEffect, type MutableRefObject } from 'react';
import {
  canContinueAfterGame,
  setWantedDirection,
  setStrategyShift,
  startCountdown,
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

      // Strategy mode: Shift keys control per-player chain speed
      if (state.meta.strategyMode) {
        if (event.code === 'ShiftLeft')  { setStrategyShift(state, 'P1', true); event.preventDefault(); }
        if (event.code === 'ShiftRight') { setStrategyShift(state, 'P2', true); event.preventDefault(); }
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
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state?.meta.strategyMode) return;
      if (event.code === 'ShiftLeft')  setStrategyShift(state, 'P1', false);
      if (event.code === 'ShiftRight') setStrategyShift(state, 'P2', false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onEmitWinner, onNavigateAfterFinish, stateRef, winnerSentRef]);
}
