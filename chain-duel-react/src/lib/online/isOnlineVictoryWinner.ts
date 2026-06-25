export type OnlineVictoryWinnerInfo = {
  winnerRole?: 'Player 1' | 'Player 2';
  winnerSessionID?: string;
  p1SessionID?: string;
  p2SessionID?: string;
  p1SocketID?: string;
  p2SocketID?: string;
};

/** Match server `isOnlineRoomWinnerViewer` + lobby seat ownership checks. */
export function isOnlineVictoryWinner(
  info: OnlineVictoryWinnerInfo | null | undefined,
  sessionID: string,
  socketID: string
): boolean {
  if (!info) {
    return false;
  }
  if (info.winnerSessionID && sessionID && info.winnerSessionID === sessionID) {
    return true;
  }
  const role = info.winnerRole;
  if (!role) {
    return false;
  }
  if (role === 'Player 1') {
    return Boolean(
      (info.p1SessionID && sessionID && info.p1SessionID === sessionID) ||
        (info.p1SocketID && socketID && info.p1SocketID === socketID)
    );
  }
  if (role === 'Player 2') {
    return Boolean(
      (info.p2SessionID && sessionID && info.p2SessionID === sessionID) ||
        (info.p2SocketID && socketID && info.p2SocketID === socketID)
    );
  }
  return false;
}
