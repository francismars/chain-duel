import type { OnlineRoomSnapshot } from '@/types/socket';

/**
 * Re-hydrates wire-pruned `onlineRoomSnapshot` payloads before merge/render.
 * Safe for full snapshots (replay / older servers): idempotent.
 */
export function normalizeOnlineRoomSnapshot(snapshot: OnlineRoomSnapshot): OnlineRoomSnapshot {
  const state = snapshot.state as Record<string, unknown> | null;
  if (!state) {
    return snapshot;
  }
  const hud = snapshot.hud;
  const metaRaw = state.meta as {
    modeLabel?: string;
    isTournament?: boolean;
    practiceMode?: boolean;
    p1Human?: boolean;
    p2Human?: boolean;
  } | undefined;
  const practiceMode =
    typeof metaRaw?.practiceMode === 'boolean' ? metaRaw.practiceMode : false;
  const meta = {
    modeLabel: typeof metaRaw?.modeLabel === 'string' ? metaRaw.modeLabel : 'ONLINE',
    isTournament: typeof metaRaw?.isTournament === 'boolean' ? metaRaw.isTournament : false,
    practiceMode,
    p1Human: typeof metaRaw?.p1Human === 'boolean' ? metaRaw.p1Human : true,
    p2Human:
      typeof metaRaw?.p2Human === 'boolean' ? metaRaw.p2Human : !practiceMode,
  };

  return {
    ...snapshot,
    state: {
      ...state,
      currentCaptureP1:
        typeof state.currentCaptureP1 === 'string' ? state.currentCaptureP1 : hud.captureP1,
      currentCaptureP2:
        typeof state.currentCaptureP2 === 'string' ? state.currentCaptureP2 : hud.captureP2,
      meta,
      p1Name: typeof state.p1Name === 'string' ? state.p1Name : 'Player 1',
      p2Name: typeof state.p2Name === 'string' ? state.p2Name : 'Player 2',
      sentWinner: typeof state.sentWinner === 'boolean' ? state.sentWinner : false,
      pointChanges: Array.isArray(state.pointChanges) ? state.pointChanges : [],
    },
  };
}
