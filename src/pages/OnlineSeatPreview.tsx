import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import OnlineRoomLobby from '@/pages/OnlineRoomLobby';
import { buildOnlineUiDebugRoom, DEBUG_P2_SESSION } from '@/lib/online/onlineUiDebug';
import { PlayerRole, type OnlineRoomState } from '@/types/socket';

const filled = buildOnlineUiDebugRoom('seat', 'DEBUG');

function openSeatRoom(): OnlineRoomState {
  const p1 = filled.seats[PlayerRole.Player1];
  return {
    ...filled,
    seats: {
      ...filled.seats,
      [PlayerRole.Player1]: {
        ...p1,
        status: 'open',
        name: undefined,
        ready: false,
      },
    },
  };
}

function bothSeatsPaid(): OnlineRoomState {
  return {
    ...filled,
    seats: {
      ...filled.seats,
      [PlayerRole.Player2]: {
        role: PlayerRole.Player2,
        name: 'Hal',
        sessionID: DEBUG_P2_SESSION,
        status: 'paid',
        paidAmount: 10000,
        ready: true,
      },
    },
  };
}

/** Lobby fills both seats, reveals the full-room stamp, then opens the match. */
export default function OnlineSeatPreview() {
  const navigate = useNavigate();
  const [room, setRoom] = useState<OnlineRoomState>(openSeatRoom);
  const [showFullRoomNotice, setShowFullRoomNotice] = useState(false);

  useEffect(() => {
    const fillP1 = window.setTimeout(() => setRoom(filled), 1600);
    const fillP2 = window.setTimeout(() => setRoom(bothSeatsPaid()), 3200);
    const reveal = window.setTimeout(() => setShowFullRoomNotice(true), 4000);
    const enterGame = window.setTimeout(() => {
      navigate('/online/r/DEBUG?preview=loading&enter=1');
    }, 7200);
    return () => {
      window.clearTimeout(fillP1);
      window.clearTimeout(fillP2);
      window.clearTimeout(reveal);
      window.clearTimeout(enterGame);
    };
  }, [navigate]);

  return (
    <OnlineRoomLobby
      embedded
      roomCode="DEBUG"
      roomId="preview"
      externalRoom={room}
      showFullRoomNotice={showFullRoomNotice}
    />
  );
}
