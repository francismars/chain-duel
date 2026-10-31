import {
  PlayerRole,
  type OnlineRoomState,
  type OnlineSeatState,
} from '@/types/socket';

export const DEBUG_P1_SESSION = 'debug-p1';
export const DEBUG_P2_SESSION = 'debug-p2';

export type OnlineUiDebugScene = 'seat' | 'loading';
export type OnlinePreviewSide = 'winner' | 'loser';

export function parseOnlineUiDebugScene(
  preview: string | null
): OnlineUiDebugScene | null {
  if (preview === 'seat' || preview === 'loading') {
    return preview;
  }
  return null;
}

export function parseOnlinePreviewSide(
  side: string | null
): OnlinePreviewSide | null {
  if (side === 'winner' || side === 'loser') {
    return side;
  }
  return null;
}

export function previewViewerSession(side: OnlinePreviewSide | null): string {
  if (side === 'winner') {
    return DEBUG_P1_SESSION;
  }
  if (side === 'loser') {
    return DEBUG_P2_SESSION;
  }
  return '';
}

const PREVIEW_P1_PICTURE = '/images/preview/player-lena.jpg';
const PREVIEW_P2_PICTURE = '/images/preview/player-samir.jpg';

function paidSeat(
  role: PlayerRole.Player1 | PlayerRole.Player2,
  name: string,
  sessionID: string,
  extra: Partial<OnlineSeatState> = {}
): OnlineSeatState {
  return {
    role,
    name,
    sessionID,
    status: 'paid',
    paidAmount: 10000,
    ready: true,
    ...extra,
  };
}

function snapshot(
  phase: OnlineRoomState['phase'],
  names: { p1: string; p2: string } = { p1: 'Satoshi', p2: 'Hal' }
): OnlineRoomState['snapshot'] {
  return {
    tick: 0,
    phase,
    state: {
      gameStarted: false,
      score: [0, 0],
      p1Name: names.p1,
      p2Name: names.p2,
    },
    hud: {
      p1Points: 0,
      p2Points: 0,
      captureP1: '',
      captureP2: '',
      initialWidthP1: 1,
      initialWidthP2: 1,
      currentWidthP1: 1,
      currentWidthP2: 1,
    },
  };
}

export function buildOnlineUiDebugRoom(
  scene: OnlineUiDebugScene,
  roomCode: string
): OnlineRoomState {
  const code = roomCode.trim().toUpperCase() || 'DEBUG';
  const liveMatch = scene === 'loading';
  const p1Name = 'Satoshi';
  const p2Name = 'Hal';
  const p1 = paidSeat(PlayerRole.Player1, p1Name, DEBUG_P1_SESSION, {
    picture: liveMatch ? PREVIEW_P1_PICTURE : undefined,
    pubkey: liveMatch
      ? '7f3c1a9e4b28d6c0a15e8f42b9d3076ac4e1f8502d6b9a73c8e0145f2a6d91b0'
      : undefined,
    pingMs: liveMatch ? 36 : undefined,
    paidAt: liveMatch ? Date.now() - 48_000 : undefined,
    payMethod: liveMatch ? 'lightning' : undefined,
    startConfirmed: liveMatch ? true : undefined,
  });
  const p2 = liveMatch
    ? paidSeat(PlayerRole.Player2, p2Name, DEBUG_P2_SESSION, {
        picture: PREVIEW_P2_PICTURE,
        pubkey:
          'c2e84b17a90d3f65e1b8c4a27d0591f6e3a8b0c54d1729e6f0a3b8c1d5e74920',
        pingMs: 94,
        paidAt: Date.now() - 12_000,
        payMethod: 'nostr_web',
        startConfirmed: true,
      })
    : ({
        role: PlayerRole.Player2,
        status: 'open',
      } satisfies OnlineSeatState);
  return {
    roomId: 'preview',
    roomCode: code,
    hostSessionID: DEBUG_P1_SESSION,
    buyin: 10000,
    matchRound: 1,
    phase: 'lobby',
    seats: {
      [PlayerRole.Player1]: p1,
      [PlayerRole.Player2]: p2,
    },
    spectators: liveMatch
      ? ['watch-1', 'watch-2', 'watch-3', 'watch-4', 'watch-5', 'watch-6']
      : [],
    snapshot: snapshot('lobby', {
      p1: p1Name,
      p2: liveMatch ? p2Name : 'Hal',
    }),
  };
}
