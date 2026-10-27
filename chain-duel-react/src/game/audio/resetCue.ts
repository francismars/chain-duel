import type { GameState, SnakeState } from '@/game/engine/types';

/** P3 is the first extra chain, P4 the second. Each plays its own crash sample. */
export type ResetCue = 'P1' | 'P2' | 'P3' | 'P4';

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

function extraResetCues(state: GameState): ResetCue[] {
  const cues: ResetCue[] = [];
  state.resetCueExtra?.forEach((flag, index) => {
    if (!flag) return;
    if (index === 0) cues.push('P3');
    else if (index === 1) cues.push('P4');
  });
  return cues;
}

function extraResetsFromShape(prev: GameState, next: GameState): ResetCue[] {
  const cues: ResetCue[] = [];
  const count = Math.max(prev.extraSnakes.length, next.extraSnakes.length);
  for (let index = 0; index < count; index += 1) {
    const before = prev.extraSnakes[index]?.snake;
    const after = next.extraSnakes[index]?.snake;
    if (!before || !after || !didSnakeReset(before, after)) continue;
    if (index === 0) cues.push('P3');
    else if (index === 1) cues.push('P4');
  }
  return cues;
}

/** Cues raised by the step that just ran. The engine clears them next step. */
export function resetCuesFromStep(state: GameState): ResetCue[] {
  const cues: ResetCue[] = [];
  if (state.resetCueP1) cues.push('P1');
  if (state.resetCueP2) cues.push('P2');
  cues.push(...extraResetCues(state));
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
): ResetCue[] {
  const flagged = next.resetCueP1 != null || next.resetCueP2 != null;
  if (flagged) {
    if (next.tickCount === prev.tickCount) return [];
    const cues = resetCuesFromStep(next);
    if (next.resetCueExtra == null) cues.push(...extraResetsFromShape(prev, next));
    return cues;
  }
  const cues: ResetCue[] = [];
  if (didSnakeReset(prev.p1, next.p1)) cues.push('P1');
  if (didSnakeReset(prev.p2, next.p2)) cues.push('P2');
  cues.push(...extraResetsFromShape(prev, next));
  return cues;
}
