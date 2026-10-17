import { PlayerRole, type OnlineRoomState, type OnlineSeatState } from '@/types/socket';

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

function paidSeat(
  role: PlayerRole.Player1 | PlayerRole.Player2,
  name: string,
  sessionID: string
): OnlineSeatState {
  return {
    role,
    name,
    sessionID,
    status: 'paid',
    paidAmount: 10000,
    ready: true,
  };
}

function snapshot(phase: OnlineRoomState['phase']): OnlineRoomState['snapshot'] {
  return {
    tick: 0,
    phase,
    state: {
      gameStarted: false,
      score: [0, 0],
      p1Name: 'Satoshi',
      p2Name: 'Hal',
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
  const p1 = paidSeat(PlayerRole.Player1, 'Satoshi', DEBUG_P1_SESSION);
  const p2 =
    scene === 'loading'
      ? paidSeat(PlayerRole.Player2, 'Hal', DEBUG_P2_SESSION)
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
    spectators: [],
    snapshot: snapshot('lobby'),
  };
}
