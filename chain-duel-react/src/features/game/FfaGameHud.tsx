import type { CSSProperties } from 'react';
import { Sponsorship } from '@/components/ui/Sponsorship';
import type { FfaHudPlayer } from '@/game/engine/types';
import {
  GameInfoLabel,
  type ChallengeHudInfo,
} from '@/features/game/GameInfoLabel';
import {
  captureHitStyleVars,
  distributionSurgeDurationMs,
  type FfaPlayerIndex,
} from '@/features/game/hudCaptureFeedback';
import './ffa-game-hud.css';

interface FfaBarCaptureHit {
  playerIndex: FfaPlayerIndex;
  intensity: number;
  generation: number;
  glow: 'light' | 'dark';
}

interface FfaHudProps {
  players: FfaHudPlayer[];
  gameInfo: string;
  challengeHud?: ChallengeHudInfo | null;
  captureHighlights?: readonly boolean[];
  barCaptureHit?: FfaBarCaptureHit | null;
  satsSurge?: { playerIndex: FfaPlayerIndex; intensity: number } | null;
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
  players,
  shareKey,
  live,
  barCaptureHit,
}: {
  id: string;
  players: FfaHudPlayer[];
  shareKey: 'initialShare' | 'currentShare';
  live?: boolean;
  barCaptureHit?: FfaBarCaptureHit | null;
}) {
  let offset = 0;
  const hasLightHit =
    live &&
    barCaptureHit?.glow === 'light' &&
    players.some((p) => p.index === barCaptureHit.playerIndex);
  return (
    <div
      id={id}
      className={`distributionBarOutter ffa-distribution ${live ? 'ffa-distribution-live' : ''}`}
    >
      <div
        className={`ffa-distribution-track${hasLightHit ? ' ffa-distribution-track--outer-glow' : ''}`}
        aria-hidden
      >
        {players.map((player) => {
          const width = player[shareKey];
          const isHit =
            live &&
            barCaptureHit?.playerIndex === player.index;
          const segment = (
            <div
              key={`${player.index}-${isHit ? barCaptureHit!.generation : 'idle'}`}
              className={`distributionBar ffa-distribution-segment${
                isHit
                  ? barCaptureHit!.glow === 'light'
                    ? ' ffa-distribution-segment--capture-hit-light'
                    : ' ffa-distribution-segment--capture-hit-dark'
                  : ''
              }`}
              style={{
                left: `${offset}%`,
                width: `${width}%`,
                background: player.color,
                ...(isHit ? captureHitStyleVars(barCaptureHit!.intensity) : {}),
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

function SatsSlot({
  player,
  index,
  surgeIntensity,
}: {
  player: FfaHudPlayer;
  index: number;
  surgeIntensity?: number;
}) {
  const alignRight = index >= 2;
  const surging = surgeIntensity !== undefined;
  return (
    <div
      className={`ffa-hud-sats-slot ffa-hud-sats-slot-${index}${
        surging ? ' ffa-hud-sats-slot--surge' : ''
      }`}
      style={
        surging
          ? ({
              ...captureHitStyleVars(surgeIntensity),
              '--stakes-surge-ms': `${distributionSurgeDurationMs(surgeIntensity)}ms`,
            } as CSSProperties)
          : undefined
      }
    >
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
  barCaptureHit = null,
  satsSurge = null,
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
          id="currentDistribution"
          players={players}
          shareKey="currentShare"
          live
          barCaptureHit={barCaptureHit}
        />
      </div>

      <div className="ffa-hud-sats-row">
        {players.map((player, i) => (
          <SatsSlot
            key={player.index}
            player={player}
            index={i}
            surgeIntensity={
              satsSurge?.playerIndex === player.index
                ? satsSurge.intensity
                : undefined
            }
          />
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
        id="currentDistribution"
        players={players}
        shareKey="currentShare"
        live
      />
    </div>
  );
}
