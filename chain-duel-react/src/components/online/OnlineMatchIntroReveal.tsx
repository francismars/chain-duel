import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { OnlineRoomState } from '@/types/socket';
import { buildMatchIntroData } from '@/lib/online/buildMatchIntroData';
import {
  MATCH_REVEAL_EXIT_MS,
  MATCH_REVEAL_MS,
  MATCH_REVEAL_SKIP_AFTER_MS,
} from '@/lib/online/matchRevealTiming';
import '@/styles/components/onlineMatchIntroReveal.css';

export { MATCH_REVEAL_MS as MATCH_INTRO_MS };
export { MATCH_REVEAL_SKIP_AFTER_MS as MATCH_INTRO_SKIP_AFTER_MS };

export type OnlineMatchIntroRevealProps = {
  room: OnlineRoomState;
  sessionID?: string;
  socketID?: string;
  onComplete: () => void;
};

export function OnlineMatchIntroReveal({
  room,
  sessionID = '',
  socketID = '',
  onComplete,
}: OnlineMatchIntroRevealProps) {
  const data = useMemo(
    () => buildMatchIntroData(room, { sessionID, socketID }),
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

  if (!data) {
    return null;
  }

  const footerCopy =
    data.viewerRole === 'duelist'
      ? 'You are dueling · Press Space or Enter when the board opens'
      : data.spectatorCount > 0
        ? `${data.spectatorCount} watching · spectating this duel`
        : 'Spectating this duel';

  const ariaLabel = `${data.p1.name} versus ${data.p2.name}. ${data.buyinEach.toLocaleString()} sats each. ${data.netPrize.toLocaleString()} sats to the winner.`;

  return (
    <div
      className={[
        'online-reveal',
        'online-reveal--intro',
        skippable ? 'online-reveal--skippable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="online-reveal__scrim" aria-hidden="true" />
      <div className="online-reveal__vignette" aria-hidden="true" />
      <div className="online-reveal__pulse" aria-hidden="true" />

      <p className="online-reveal__kicker">{data.kicker}</p>

      <div className="online-reveal__matchup">
        <article
          className={[
            'online-reveal__player',
            'online-reveal__player--left',
            'online-reveal__player--white',
          ].join(' ')}
        >
          <p className="online-reveal__role">Player 1</p>
          {data.p1.picture ? (
            <img
              className="online-reveal__avatar"
              src={data.p1.picture}
              alt=""
            />
          ) : (
            <div className="online-reveal__avatar online-reveal__avatar--empty" />
          )}
          <h2 className="online-reveal__name">{data.p1.name}</h2>
        </article>

        <div className="online-reveal__vs" aria-hidden="true">
          <span>VS</span>
        </div>

        <article
          className={[
            'online-reveal__player',
            'online-reveal__player--right',
            'online-reveal__player--black',
          ].join(' ')}
        >
          <p className="online-reveal__role">Player 2</p>
          {data.p2.picture ? (
            <img
              className="online-reveal__avatar"
              src={data.p2.picture}
              alt=""
            />
          ) : (
            <div className="online-reveal__avatar online-reveal__avatar--empty" />
          )}
          <h2 className="online-reveal__name">{data.p2.name}</h2>
        </article>
      </div>

      <p className="online-reveal__stakes">
        {data.buyinEach.toLocaleString()}
        <span className="online-reveal__stakes-denom"> sats each</span>
        {' · '}
        {data.netPrize.toLocaleString()}
        <span className="online-reveal__stakes-denom"> sats to winner</span>
      </p>

      <p className="online-reveal__footer">{footerCopy}</p>

      {showExit ? (
        <div
          className="online-reveal__exit"
          style={
            {
              '--reveal-exit-ms': `${MATCH_REVEAL_EXIT_MS}ms`,
            } as CSSProperties
          }
        >
          <p className="online-reveal__exit-label">Entering arena</p>
          <div className="online-reveal__progress" aria-hidden="true">
            <div className="online-reveal__progress-fill" />
          </div>
        </div>
      ) : null}

      {skippable ? (
        <p className="online-reveal__skip">Press any key to continue</p>
      ) : null}
    </div>
  );
}
