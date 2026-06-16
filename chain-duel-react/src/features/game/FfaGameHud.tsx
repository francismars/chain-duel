import type { CSSProperties } from 'react';
import { Sponsorship } from '@/components/ui/Sponsorship';
import type { FfaHudPlayer } from '@/game/engine/types';
import {
  GameInfoLabel,
  type ChallengeHudInfo,
} from '@/features/game/GameInfoLabel';
import './ffa-game-hud.css';

interface FfaHudProps {
  players: FfaHudPlayer[];
  gameInfo: string;
  challengeHud?: ChallengeHudInfo | null;
  captureHighlights?: readonly boolean[];
}

function CaptureLine({
  player,
  alignRight,
  highlighted,
}: {
  player: FfaHudPlayer;
  alignRight?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div className={`ffa-hud-capture ${highlighted ? 'highlight' : ''}`}>
      {alignRight ? (
        <>
          capture <span className="capturingAmount">{player.capture}</span>
        </>
      ) : (
        <>
          <span className="capturingAmount">{player.capture}</span> capture
        </>
      )}
    </div>
  );
}

function DistributionBar({
  id,
  title,
  players,
  shareKey,
  live,
}: {
  id: string;
  title: string;
  players: FfaHudPlayer[];
  shareKey: 'initialShare' | 'currentShare';
  live?: boolean;
}) {
  let offset = 0;
  return (
    <div
      id={id}
      className={`distributionBarOutter ffa-distribution ${live ? 'ffa-distribution-live' : ''}`}
    >
      {!live ? <div className="distributionTitle">{title}</div> : null}
      <div className="ffa-distribution-track" aria-hidden>
        {live ? (
          <div className="distributionTitle ffa-distribution-title-in-bar">
            {title}
          </div>
        ) : null}
        {players.map((player) => {
          const width = player[shareKey];
          const segment = (
            <div
              key={player.index}
              className="distributionBar ffa-distribution-segment"
              style={{
                left: `${offset}%`,
                width: `${width}%`,
                background: player.color,
              }}
            />
          );
          offset += width;
          return segment;
        })}
      </div>
    </div>
  );
}

function PlayerName({
  player,
  index,
}: {
  player: FfaHudPlayer;
  index: number;
}) {
  const alignRight = index >= 2;
  return (
    <div className={`ffa-hud-slot ffa-hud-slot-${index}`}>
      <div
        className={`ffa-hud-name ${alignRight ? 'ffa-hud-name-right' : ''}`}
        style={{ '--ffa-color': player.color } as CSSProperties}
      >
        {alignRight ? (
          <>
            <span className="condensed">{player.name}</span>
            <span className="ffa-hud-swatch" aria-hidden />
          </>
        ) : (
          <>
            <span className="ffa-hud-swatch" aria-hidden />
            <span className="condensed">{player.name}</span>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerCapture({
  player,
  index,
  highlighted,
}: {
  player: FfaHudPlayer;
  index: number;
  highlighted?: boolean;
}) {
  return (
    <div className={`ffa-hud-slot ffa-hud-slot-${index}`}>
      <CaptureLine
        player={player}
        alignRight={index >= 2}
        highlighted={highlighted}
      />
    </div>
  );
}

function SatsSlot({ player, index }: { player: FfaHudPlayer; index: number }) {
  const alignRight = index >= 2;
  return (
    <div className={`ffa-hud-sats-slot ffa-hud-sats-slot-${index}`}>
      {alignRight ? (
        <>
          <span className="grey">sats </span>
          <span className="condensed">{player.score.toLocaleString()}</span>
        </>
      ) : (
        <>
          <span className="condensed">{player.score.toLocaleString()}</span>{' '}
          <span className="grey">sats</span>
        </>
      )}
    </div>
  );
}

/** Unified FFA HUD — stacked rows, shared 4-column grid for players and sats. */
export function FfaHud({
  players,
  gameInfo,
  challengeHud,
  captureHighlights = [],
}: FfaHudProps) {
  return (
    <div className="ffa-hud">
      <div className="ffa-hud-players">
        <div className="ffa-hud-names">
          {players.map((player, i) => (
            <PlayerName key={player.index} player={player} index={i} />
          ))}
          <GameInfoLabel
            id="gameInfo"
            className="ffa-hud-mode"
            gameInfo={gameInfo}
            challenge={challengeHud}
          />
        </div>
        <div className="ffa-hud-captures">
          {players.map((player, i) => (
            <PlayerCapture
              key={player.index}
              player={player}
              index={i}
              highlighted={captureHighlights[player.index] ?? false}
            />
          ))}
        </div>
      </div>

      <div id="distributions" className="ffa-hud-bars">
        <DistributionBar
          id="initialDistribution"
          title="Initial Distribution"
          players={players}
          shareKey="initialShare"
        />
        <DistributionBar
          id="currentDistribution"
          title="Current Distribution"
          players={players}
          shareKey="currentShare"
          live
        />
      </div>

      <div className="ffa-hud-sats-row">
        {players.map((player, i) => (
          <SatsSlot key={player.index} player={player} index={i} />
        ))}
        <div className="ffa-hud-sponsor">
          <Sponsorship id="sponsorshipGame" showLabel={false} />
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use FfaHud */
export function FfaPlayersBar(props: FfaHudProps) {
  return <FfaHud {...props} />;
}

/** @deprecated Use FfaHud */
export function FfaGameHud({ players }: { players: FfaHudPlayer[] }) {
  return (
    <div className="ffa-hud-bars-only">
      <DistributionBar
        id="initialDistribution"
        title="Initial Distribution"
        players={players}
        shareKey="initialShare"
      />
      <DistributionBar
        id="currentDistribution"
        title="Current Distribution"
        players={players}
        shareKey="currentShare"
        live
      />
    </div>
  );
}
