import type { GameState, PlayerId, SnakeState } from '@/game/engine/types';

/**
 * A respawn parks the chain: direction cleared, still facing its spawn
 * direction, and a single tail segment. Elimination clears the facing too
 * and removes the body, so it does not count.
 */
export function didSnakeReset(prev: SnakeState, next: SnakeState): boolean {
  if (next.dir !== '' || next.dirWanted === '' || next.body.length !== 1) {
    return false;
  }
  const samePark =
    prev.dir === '' &&
    prev.body.length === 1 &&
    prev.head[0] === next.head[0] &&
    prev.head[1] === next.head[1] &&
    prev.body[0]?.[0] === next.body[0]?.[0] &&
    prev.body[0]?.[1] === next.body[0]?.[1];
  return !samePark;
}

/** Cues raised by the step that just ran. The engine clears them next step. */
export function resetCuesFromStep(state: GameState): PlayerId[] {
  const cues: PlayerId[] = [];
  if (state.resetCueP1) cues.push('P1');
  if (state.resetCueP2) cues.push('P2');
  return cues;
}

/**
 * Online snapshots are copies. Play when this tick raised a cue, and skip a
 * resent copy of the same tick. Older servers omit the cue; those fall back
 * to the parked-chain shape.
 */
export function resetCuesFromTransition(
  prev: GameState,
  next: GameState
): PlayerId[] {
  if (next.resetCueP1 != null || next.resetCueP2 != null) {
    if (next.tickCount === prev.tickCount) return [];
    return resetCuesFromStep(next);
  }
  const cues: PlayerId[] = [];
  if (didSnakeReset(prev.p1, next.p1)) cues.push('P1');
  if (didSnakeReset(prev.p2, next.p2)) cues.push('P2');
  return cues;
}
