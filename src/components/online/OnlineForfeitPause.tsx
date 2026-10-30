import {
  forfeitPauseCopy,
  idleSeatBadges,
  type ForfeitViewer,
} from '@/lib/online/forfeitPause';
import type { OnlineForfeitPause as OnlineForfeitPauseState } from '@/types/socket';

const HIDDEN_PHASES = new Set(['postgame', 'finished', 'cancelled']);

/** Pause plate when the server paused the match. Idle is a side badge. */
export function OnlineForfeitPause({
  forfeit,
  phase,
  viewer,
  p1Name,
  p2Name,
}: {
  forfeit: OnlineForfeitPauseState | null;
  phase?: string;
  viewer: ForfeitViewer;
  p1Name: string;
  p2Name: string;
}) {
  if (!forfeit || (phase != null && HIDDEN_PHASES.has(phase))) {
    return null;
  }
  const badges = idleSeatBadges({ forfeit, viewer, p1Name, p2Name });
  const copy = forfeit.paused
    ? forfeitPauseCopy({ forfeit, viewer, p1Name, p2Name })
    : null;
  if (!copy && badges.length === 0) {
    return null;
  }
  return (
    <>
      {badges.map((badge) => (
        <p
          key={badge.seat}
          className={`online-idle-badge online-idle-badge--${badge.seat}`}
          role="status"
        >
          {badge.label}
        </p>
      ))}
      {copy ? <ForfeitPausePlate copy={copy} /> : null}
    </>
  );
}

function ForfeitPausePlate({
  copy,
}: {
  copy: NonNullable<ReturnType<typeof forfeitPauseCopy>>;
}) {
  const split = copy.lines.length > 1;
  return (
    <div
      className={[
        'online-forfeit',
        `online-forfeit--${copy.tone}`,
        split ? 'online-forfeit--split' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="off"
      aria-label={copy.lines
        .map((line) => `${line.kicker} ${line.timeLabel}. ${line.message}`)
        .join(' ')}
    >
      <div className="online-forfeit__plate">
        {copy.lines.map((line) => (
          <div
            key={line.kicker}
            className={`online-forfeit__line online-forfeit__line--${line.tone}`}
          >
            <p className="online-forfeit__kicker">{line.kicker}</p>
            <p className="online-forfeit__time">{line.timeLabel}</p>
            <p className="online-forfeit__body">{line.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
