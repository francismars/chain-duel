import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { OnlineRoomState } from '@/types/socket';
import { buildVictoryRevealData } from '@/lib/online/buildVictoryRevealData';
import {
  MATCH_REVEAL_EXIT_MS,
  MATCH_REVEAL_MS,
  MATCH_REVEAL_SKIP_AFTER_MS,
} from '@/lib/online/matchRevealTiming';
import { SoloZapRadiatingLines } from '@/features/game/SoloZapRadiatingLines';

export type OnlineVictoryRevealProps = {
  room: OnlineRoomState;
  sessionID?: string;
  socketID?: string;
  onComplete: () => void;
};

export function OnlineVictoryReveal({
  room,
  sessionID = '',
  socketID = '',
  onComplete,
}: OnlineVictoryRevealProps) {
  const data = useMemo(
    () => buildVictoryRevealData(room, { sessionID, socketID }),
    [room, sessionID, socketID]
  );
  const completedRef = useRef(false);
  const [skippable, setSkippable] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = useCallback(() => {
    if (completedRef.current) {
      return;
    }
    completedRef.current = true;
    onCompleteRef.current();
  }, []);

  useEffect(() => {
    completedRef.current = false;
    setSkippable(false);
    setShowExit(false);

    const skipTimer = window.setTimeout(() => {
      setSkippable(true);
    }, MATCH_REVEAL_SKIP_AFTER_MS);

    const exitTimer = window.setTimeout(() => {
      setShowExit(true);
    }, MATCH_REVEAL_MS - MATCH_REVEAL_EXIT_MS);

    const completeTimer = window.setTimeout(() => {
      finish();
    }, MATCH_REVEAL_MS);

    return () => {
      window.clearTimeout(skipTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(completeTimer);
    };
  }, [finish, room.roomId, room.matchRound]);

  useEffect(() => {
    if (!skippable) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    };
    const onPointerDown = () => {
      finish();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [finish, skippable]);

  useEffect(() => {
    if (!data) {
      finish();
    }
  }, [data, finish]);

  if (!data) {
    return null;
  }

  const { winner, loser, netPrize, footerCopy } = data;

  const ariaLabel = `${winner.name} wins. ${netPrize.toLocaleString()} sats net prize.`;

  const prompt = showExit
    ? 'OPENING RESULTS'
    : skippable
      ? 'PRESS ANY BUTTON TO CONTINUE'
      : '';

  return (
    <div
      className="match-end-layer"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <SoloZapRadiatingLines
        className="end-screen-rays match-end-layer__rays match-end-layer__rays--instant"
      />
      <div className="match-end-card match-end-card--instant">
        <p className="match-end-card__kicker">
          ROUND {room.matchRound ?? 1} / FINAL / MATCH COMPLETE
        </p>
        <p className="match-end-card__name">{winner.name.toUpperCase()}</p>
        <p className="match-end-card__wins">WINS</p>
        <p className="match-end-card__sats">
          {netPrize.toLocaleString()} SATS
        </p>
        <p className="match-end-card__note">
          {winner.score.toLocaleString()} / {loser.score.toLocaleString()} ·{' '}
          {loser.name.toUpperCase()}
        </p>
        <p className="match-end-card__note">{footerCopy}</p>
        {prompt ? (
          skippable ? (
            <button
              type="button"
              className="match-end-card__prompt duel-finish__continue"
              onClick={finish}
            >
              {prompt}
            </button>
          ) : (
            <p className="match-end-card__prompt">{prompt}</p>
          )
        ) : null}
        {showExit && (
          <div
            className="duel-finish__progress"
            aria-hidden="true"
            style={
              {
                '--reveal-exit-ms': `${MATCH_REVEAL_EXIT_MS}ms`,
              } as CSSProperties
            }
          />
        )}
      </div>
    </div>
  );
}
