import {
  forfeitPauseCopy,
  type ForfeitViewer,
} from '@/lib/online/forfeitPause';
import type { OnlineForfeitPause as OnlineForfeitPauseState } from '@/types/socket';

const HIDDEN_PHASES = new Set(['postgame', 'finished', 'cancelled']);

/** Board overlay for a server-paused match. The clock is whatever just arrived. */
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
  if (!forfeit?.paused || (phase != null && HIDDEN_PHASES.has(phase))) {
    return null;
  }
  const copy = forfeitPauseCopy({ forfeit, viewer, p1Name, p2Name });
  if (!copy) {
    return null;
  }
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
