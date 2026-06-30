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
import '@/styles/components/onlineVictoryReveal.css';

const CONFETTI_COUNT = 18;

function VictoryCrown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
      strokeLinecap="round"
      className="online-reveal__crown-svg"
      aria-hidden="true"
    >
      <path d="M1 15h18V9L15 12L10 2L5 12L1 9Z" />
      <circle cx="10" cy="2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="1" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="9" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

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
  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
        id: index,
        left: `${8 + ((index * 37) % 84)}%`,
        delay: `${0.75 + (index % 7) * 0.07}s`,
        hue: 38 + (index % 5) * 14,
        rotate: (index % 5) * 72,
      })),
    []
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

  const { winner, loser, teaseHeadline, teaseSubline, netPrize, footerCopy } =
    data;

  const ariaLabel = `${winner.name} wins. ${netPrize.toLocaleString()} sats net prize.`;

  return (
    <div
      className={[
        'online-reveal',
        'online-reveal--victory',
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
      <div className="online-reveal__burst" aria-hidden="true" />

      <div className="online-reveal__confetti" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className="online-reveal__confetti-piece"
            style={
              {
                left: piece.left,
                animationDelay: piece.delay,
                '--confetti-hue': piece.hue,
                '--confetti-rotate': `${piece.rotate}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <p className="online-reveal__kicker">Match settled</p>

      <div className="online-reveal__matchup">
        <article
          className={[
            'online-reveal__player',
            'online-reveal__player--left',
            'online-reveal__player--loser',
            loser.side === 'p1'
              ? 'online-reveal__player--white'
              : 'online-reveal__player--black',
          ].join(' ')}
        >
          <p className="online-reveal__role online-reveal__role--defeated">
            Defeated
          </p>
          {loser.picture ? (
            <img
              className="online-reveal__avatar"
              src={loser.picture}
              alt=""
            />
          ) : (
            <div className="online-reveal__avatar online-reveal__avatar--empty" />
          )}
          <h3 className="online-reveal__name">{loser.name}</h3>
          <p className="online-reveal__score">
            {loser.score.toLocaleString()}
            <span className="online-reveal__score-denom"> sats</span>
          </p>
          <p className="online-reveal__tease-headline">{teaseHeadline}</p>
          <p className="online-reveal__tease-subline">{teaseSubline}</p>
        </article>

        <div className="online-reveal__vs" aria-hidden="true">
          <span>VS</span>
        </div>

        <article
          className={[
            'online-reveal__player',
            'online-reveal__player--right',
            'online-reveal__player--winner',
            winner.side === 'p1'
              ? 'online-reveal__player--white'
              : 'online-reveal__player--black',
          ].join(' ')}
        >
          <div className="online-reveal__crown-wrap" aria-hidden="true">
            <VictoryCrown />
          </div>
          <p className="online-reveal__role online-reveal__role--victor">
            Victor
          </p>
          {winner.picture ? (
            <img
              className="online-reveal__avatar online-reveal__avatar--winner"
              src={winner.picture}
              alt=""
            />
          ) : (
            <div className="online-reveal__avatar online-reveal__avatar--empty online-reveal__avatar--winner" />
          )}
          <h2 className="online-reveal__name online-reveal__name--winner">
            {winner.name}
          </h2>
          <p className="online-reveal__score online-reveal__score--winner">
            {winner.score.toLocaleString()}
            <span className="online-reveal__score-denom"> sats</span>
          </p>
        </article>
      </div>

      <p className="online-reveal__stakes">
        +{netPrize.toLocaleString()}
        <span className="online-reveal__stakes-denom"> sats net</span>
        {' · '}
        {winner.name} wins
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
          <p className="online-reveal__exit-label">Opening results</p>
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
