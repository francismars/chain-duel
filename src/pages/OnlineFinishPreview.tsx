import { useSearchParams } from 'react-router';
import { OnlineVictoryReveal } from '@/components/online/OnlineVictoryReveal';
import {
  DEBUG_P1_SESSION,
  DEBUG_P2_SESSION,
  parseOnlinePreviewSide,
  previewViewerSession,
} from '@/lib/online/onlineUiDebug';
import { PlayerRole, type OnlineRoomState } from '@/types/socket';

const room = {
  roomId: 'preview',
  roomCode: 'PREVIEW',
  hostSessionID: 'preview',
  buyin: 10000,
  matchRound: 1,
  phase: 'postgame',
  seats: {
    [PlayerRole.Player1]: {
      role: PlayerRole.Player1,
      name: 'Satoshi',
      sessionID: DEBUG_P1_SESSION,
      status: 'paid',
    },
    [PlayerRole.Player2]: {
      role: PlayerRole.Player2,
      name: 'Hal',
      sessionID: DEBUG_P2_SESSION,
      status: 'paid',
    },
  },
  spectators: [],
  snapshot: {
    tick: 0,
    phase: 'postgame',
    state: { score: [42000, 18000], p1Name: 'Satoshi', p2Name: 'Hal' },
    hud: {
      p1Points: 42000,
      p2Points: 18000,
      captureP1: '',
      captureP2: '',
      initialWidthP1: 1,
      initialWidthP2: 1,
      currentWidthP1: 1,
      currentWidthP2: 1,
    },
  },
  result: {
    winnerName: 'Satoshi',
    p1Name: 'Satoshi',
    p2Name: 'Hal',
    p1Score: 42000,
    p2Score: 18000,
    netPrize: 39900,
    winnerRole: PlayerRole.Player1,
  },
  postGame: {
    winnerRole: PlayerRole.Player1,
    winnerName: 'Satoshi',
    winnerPoints: 42000,
    totalPrize: 60000,
    doubleOrNothingVotes: 0,
  },
} as OnlineRoomState;

export default function OnlineFinishPreview() {
  const [searchParams] = useSearchParams();
  const sessionID = previewViewerSession(
    parseOnlinePreviewSide(searchParams.get('side'))
  );
  return (
    <OnlineVictoryReveal
      room={room}
      sessionID={sessionID}
      onComplete={() => undefined}
    />
  );
}
