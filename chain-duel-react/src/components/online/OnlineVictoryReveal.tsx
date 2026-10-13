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

  return (
    <div
      className="duel-finish"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <SoloZapRadiatingLines className="end-screen-rays" />
      <div className="duel-finish__sheet">
        <header className="duel-finish__masthead">
          <span>CHAIN DUEL</span>
          <span>ROUND {room.matchRound ?? 1} / FINAL</span>
        </header>
        <div className="duel-finish__hero">
          <p className="duel-finish__eyebrow">MATCH COMPLETE</p>
          <div className="duel-finish__identity">
            {winner.picture && <img src={winner.picture} alt="" />}
            <h2>{winner.name}</h2>
          </div>
          <div className="duel-finish__winning-line">
            <p className="duel-finish__wins">WINS</p>
            <p className="duel-finish__amount">
              {netPrize.toLocaleString()} <span>SATS NET</span>
            </p>
          </div>
        </div>
        <div className="duel-finish__ledger">
          <div>
            <span>FINAL SCORE · SATS</span>
            <strong>
              {winner.score.toLocaleString()}{' '}
              <small>/ {loser.score.toLocaleString()}</small>
            </strong>
          </div>
          <div>
            <span>OPPONENT</span>
            <strong className="duel-finish__opponent">{loser.name}</strong>
          </div>
        </div>
        <p className="duel-finish__footer">{footerCopy}</p>
        <div className="duel-finish__navigation">
          <span>{showExit ? 'OPENING RESULTS' : 'MATCH COMPLETE'}</span>
          {skippable && (
            <button type="button" onClick={finish}>
              CONTINUE <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
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
