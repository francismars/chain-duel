import { useMemo, type CSSProperties } from 'react';
import type { OnlineRoomState } from '@/types/socket';
import { buildVictoryRevealData } from '@/lib/online/buildVictoryRevealData';
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
      className="online-victory-reveal__crown-svg"
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
};

export function OnlineVictoryReveal({ room }: OnlineVictoryRevealProps) {
  const data = useMemo(() => buildVictoryRevealData(room), [room]);
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

  if (!data) {
    return null;
  }

  const { winner, loser, teaseHeadline, teaseSubline, netPrize } = data;

  return (
    <div
      className="online-victory-reveal"
      role="status"
      aria-live="polite"
      aria-label={`${winner.name} wins`}
    >
      <div className="online-victory-reveal__vignette" aria-hidden="true" />
      <div className="online-victory-reveal__burst" aria-hidden="true" />

      <div className="online-victory-reveal__confetti" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className="online-victory-reveal__confetti-piece"
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

      <p className="online-victory-reveal__kicker">Match settled</p>

      <div className="online-victory-reveal__matchup">
        <article
          className={[
            'online-victory-reveal__player',
            'online-victory-reveal__player--loser',
            loser.side === 'p1'
              ? 'online-victory-reveal__player--white'
              : 'online-victory-reveal__player--black',
          ].join(' ')}
        >
          <p className="online-victory-reveal__role">Defeated</p>
          {loser.picture ? (
            <img
              className="online-victory-reveal__avatar"
              src={loser.picture}
              alt=""
            />
          ) : (
            <div className="online-victory-reveal__avatar online-victory-reveal__avatar--empty" />
          )}
          <h3 className="online-victory-reveal__name">{loser.name}</h3>
          <p className="online-victory-reveal__score">
            {loser.score.toLocaleString()}
            <span className="online-victory-reveal__score-denom"> sats</span>
          </p>
          <p className="online-victory-reveal__tease-headline">{teaseHeadline}</p>
          <p className="online-victory-reveal__tease-subline">{teaseSubline}</p>
        </article>

        <div className="online-victory-reveal__vs" aria-hidden="true">
          <span>VS</span>
        </div>

        <article
          className={[
            'online-victory-reveal__player',
            'online-victory-reveal__player--winner',
            winner.side === 'p1'
              ? 'online-victory-reveal__player--white'
              : 'online-victory-reveal__player--black',
          ].join(' ')}
        >
          <div className="online-victory-reveal__crown-wrap" aria-hidden="true">
            <VictoryCrown />
          </div>
          <p className="online-victory-reveal__role online-victory-reveal__role--winner">
            Victor
          </p>
          {winner.picture ? (
            <img
              className="online-victory-reveal__avatar online-victory-reveal__avatar--winner"
              src={winner.picture}
              alt=""
            />
          ) : (
            <div className="online-victory-reveal__avatar online-victory-reveal__avatar--empty online-victory-reveal__avatar--winner" />
          )}
          <h2 className="online-victory-reveal__name online-victory-reveal__name--winner">
            {winner.name}
          </h2>
          <p className="online-victory-reveal__score online-victory-reveal__score--winner">
            {winner.score.toLocaleString()}
            <span className="online-victory-reveal__score-denom"> sats</span>
          </p>
          <p className="online-victory-reveal__prize">
            +{netPrize.toLocaleString()} net
          </p>
        </article>
      </div>
    </div>
  );
}
