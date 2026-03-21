/**
 * Socket event type definitions
 * These types match the backend socket events in marspayTS
 */

// ============================================================================
// Enums (matching backend)
// ============================================================================

export enum GameMode {
  P2P = 'P2P',
  P2PNOSTR = 'P2PNOSTR',
  PRACTICE = 'PRACTICE',
  TOURNAMENT = 'TOURNAMENT',
  TOURNAMENTNOSTR = 'TOURNAMENTNOSTR',
  ONLINE = 'ONLINE',
}

export enum PlayerRole {
  Player1 = 'Player 1',
  Player2 = 'Player 2',
  Player3 = 'Player 3',
  Player4 = 'Player 4',
  Player5 = 'Player 5',
  Player6 = 'Player 6',
  Player7 = 'Player 7',
  Player8 = 'Player 8',
  Player9 = 'Player 9',
  Player10 = 'Player 10',
  Player11 = 'Player 11',
  Player12 = 'Player 12',
  Player13 = 'Player 13',
  Player14 = 'Player 14',
  Player15 = 'Player 15',
  Player16 = 'Player 16',
}

// ============================================================================
// Core Types
// ============================================================================

export interface Payment {
  amount: number;
  note?: string | null;
}

export interface PlayerInfo {
  name: string;
  value: number;
  payments?: Payment[];
  picture?: string;
  id?: string;
  participantId?: string;
  isAnon?: boolean;
  nostrPubkey?: string;
  fallbackLabel?: string;
}

/**
 * Serialized GameInfo (as sent over socket)
 * Note: players is Record<string, PlayerInfo> not Map (serialized)
 */
export interface SerializedGameInfo {
  mode: GameMode;
  players: Record<string, PlayerInfo>;
  winners?: PlayerRole[];
  numberOfPlayers?: number;
  champion?: string;
}

// ============================================================================
// LNURL Types
// ============================================================================

export interface LNURLP {
  id: string;
  lnurlp: string;
  description: string;
  min: number;
  mode?: GameMode;
  hostLNAddress?: string;
}

export interface LNURLW {
  id: string;
  lnurlw: string;
  maxWithdrawals?: number;
  claimedCount?: number;
}

// ============================================================================
// Nostr Types
// ============================================================================

export interface Kind1 {
  id: string;
  note1: string;
  emojis: string;
  min: number;
  mode: string;
  hostLNAddress?: string;
  numberOfPlayers?: number;
}

export interface TournamentNostrMeta {
  note1: string;
  emojis: string;
  min: number;
  mode: string;
  playersNeeded: number;
  currentAdmissions: number;
}

export interface OnlineNostrMeta {
  note1: string;
  emojis: string;
  min: number;
  mode: string;
}

export interface OnlineInputState {
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
}

/** Replay: frame-aligned block cosmetics (server `room.replay.blockEvents`). */
export interface OnlineReplayBlockEvent {
  frameIndex: number;
  blockHeight: number;
  medianFeeSatPerVb: number;
}

export interface OnlineRoomSnapshot {
  tick: number;
  phase: 'lobby' | 'playing' | 'postgame' | 'finished' | 'cancelled';
  state: any;
  hud: {
    p1Points: number;
    p2Points: number;
    captureP1: string;
    captureP2: string;
    initialWidthP1: number;
    initialWidthP2: number;
    currentWidthP1: number;
    currentWidthP2: number;
  };
}

export interface OnlineSeatState {
  role: PlayerRole.Player1 | PlayerRole.Player2;
  sessionID?: string;
  socketID?: string;
  status: 'open' | 'paid';
  paidAmount?: number;
  paidAt?: number;
  ready?: boolean;
  disconnectedAt?: number;
  name?: string;
  picture?: string;
  pubkey?: string;
  lnAddress?: string;
  /** Reported RTT (ms) for this seat; set by server from `reportOnlineRoomPing`. */
  pingMs?: number;
}

export interface OnlineRoomState {
  roomId: string;
  roomCode: string;
  hostSessionID: string;
  buyin: number;
  matchRound?: number;
  /** Present on server-serialized rooms (live + archived). */
  createdAt?: number;
  finishedAt?: number;
  phase: 'lobby' | 'playing' | 'postgame' | 'finished' | 'cancelled';
  kind1EventId?: string;
  nostrMeta?: OnlineNostrMeta;
  seats: Record<string, OnlineSeatState>;
  spectators: string[];
  snapshot: OnlineRoomSnapshot;
  result?: {
    winnerName: string;
    p1Name: string;
    p2Name: string;
    p1Score: number;
    p2Score: number;
    netPrize: number;
  };
  replay?: {
    available: boolean;
    frameCount: number;
    tickMs: number;
    durationMs: number;
  };
  postGame?: {
    p1Picture?: string;
    p2Picture?: string;
    winnerRole?: PlayerRole.Player1 | PlayerRole.Player2;
    winnerSessionID?: string;
    winnerName: string;
    winnerPicture?: string;
    winnerPoints: number;
    totalPrize: number;
    lnurlw?: string;
    payoutMethod?: 'withdraw_qr' | 'nostr_zap';
    payoutTarget?: string;
    winnerLnAddress?: string;
    rematchRequested?: boolean;
    rematchRequiredAmount?: number;
    rematchEventId?: string;
    rematchNote1?: string;
    rematchWaitingForSessionID?: string;
    doubleOrNothingVotes: number;
  };
}

export interface OnlineRoomListItem {
  roomId: string;
  roomCode: string;
  buyin: number;
  createdAt: number;
  finishedAt?: number;
  phase: 'lobby' | 'playing' | 'postgame' | 'finished' | 'cancelled';
  playersPaid: number;
  seatsTotal: number;
  spectators: number;
  /** From disk archive (vs in-memory finished). */
  archived?: boolean;
  matchRound?: number;
  archiveKind?: 'match' | 'session';
  replay?: {
    available: boolean;
    frameCount: number;
    tickMs: number;
    durationMs: number;
  };
  result?: {
    winnerName: string;
    p1Name: string;
    p2Name: string;
    p1Score: number;
    p2Score: number;
    netPrize: number;
  };
}

// ============================================================================
// Socket Event Payloads
// ============================================================================

// Client -> Server Events
export interface ClientToServerEvents {
  // Menu events
  getGameMenuInfos: (hostInfo?: { LNAddress: string }) => void;
  getPracticeMenuInfos: (hostInfo?: { LNAddress: string }) => void;
  getGameMenuInfosNostr: (hostInfo?: { LNAddress: string }) => void;
  getTournamentInfos: (data?: {
    buyin: number;
    players: number;
    hostLNAddress?: string;
  }) => void;
  getTournamentInfosNostr: (data?: {
    buyin: number;
    players: number;
    hostLNAddress?: string;
  }) => void;

  // Game events
  getDuelInfos: () => void;
  gameFinished: (winnerP: PlayerRole) => void;

  // Post-game events
  postGameInfoRequest: () => void;
  createWithdrawalPostGame: () => void;
  doubleornothing: () => void;

  // Cancel events
  cancelp2p: () => void;
  canceltournament: () => void;

  // Online mode events
  createOnlineRoom: (payload?: { buyin?: number; hostLNAddress?: string }) => void;
  listOnlineRooms: () => void;
  listOnlineArchivedRooms: () => void;
  /** Merged history (archived + finished still in RAM). Preferred over listOnlineArchivedRooms alone. */
  listOnlineHistory: () => void;
  joinOnlineRoom: (payload: { roomId: string }) => void;
  joinOnlineRoomByCode: (payload: { roomCode: string }) => void;
  spectateOnlineRoom: (payload: { roomId: string }) => void;
  leaveOnlineRoom: (payload?: { roomId?: string }) => void;
  cancelOnlineRoom: (payload: { roomId: string }) => void;
  getOnlineRoomState: (payload: { roomId: string }) => void;
  roomInput: (payload: { roomId: string; input: OnlineInputState }) => void;
  startOnlineGame: (payload: { roomId: string }) => void;
  onlineSetReady: (payload: { roomId: string; ready: boolean }) => void;
  getOnlinePostGame: (payload: { roomId: string }) => void;
  createOnlineWithdrawal: (payload: { roomId: string }) => void;
  createOnlineNostrPayout: (payload: { roomId: string }) => void;
  onlineDoubleOrNothing: (payload: { roomId: string }) => void;
  getOnlineReplay: (payload: { roomId: string; matchRound?: number }) => void;
  /** NIP-07: request hex challenge to sign (kind 1) to bind pubkey → session before zap without PIN. */
  requestOnlineNostrLinkChallenge: (payload: { roomId: string }) => void;
  confirmOnlineNostrLink: (payload: { roomId: string; event: Record<string, unknown> }) => void;
  /** Round-trip probe; last arg is ack: `emit('pingLatency', () => { ... })` */
  pingLatency: (ack: () => void) => void;
  /** After measuring RTT, send so server can broadcast both players' ping via `onlineRoomUpdated`. */
  reportOnlineRoomPing: (payload: { roomId: string; latencyMs: number }) => void;
}

// Server -> Client Events
export interface ServerToClientEvents {
  // Session management
  session: (data: { sessionID: string; userID: string }) => void;

  // Menu responses
  resGetGameMenuInfos: (
    data: LNURLP[] | { lnurlw: LNURLW } | Kind1[]
  ) => void;
  resGetPracticeMenuInfos: (
    data: LNURLP[] | { lnurlw: LNURLW }
  ) => void;
  resGetTournamentInfos: (data: {
    gameInfo?: SerializedGameInfo;
    lnurlp?: string;
    lnurlw?: string;
    min?: number;
    claimedCount?: number;
  }) => void;
  resGetTournamentInfosNostr: (data: {
    gameInfo?: SerializedGameInfo;
    nostrMeta: TournamentNostrMeta;
    lnurlw?: string;
    claimedCount?: number;
  }) => void;

  // Game responses
  resGetDuelInfos: (data: SerializedGameInfo) => void;

  // Post-game responses
  resPostGameInfoRequest: (data: SerializedGameInfo & { lnurlw?: string }) => void;
  resCreateWithdrawalPostGame: (data: string) => void; // 'pass' or lnurlw string

  // Payment updates
  updatePayments: (data: SerializedGameInfo) => void;
  updatePaymentsNostrTournament: (data: SerializedGameInfo) => void;

  // Tournament cancellation
  rescanceltourn: (data: {
    depositcount: number;
    lnurlw?: string;
  }) => void;

  // Nostr events
  zapReceived: (data: unknown) => void;
  prizeWithdrawn: () => void;

  // Online mode events
  resCreateOnlineRoom: (data: {
    roomId: string;
    roomCode: string;
    joinPin: string;
    pinExpiresAt: number;
    nostrMeta?: OnlineNostrMeta;
    room: OnlineRoomState;
  }) => void;
  resListOnlineRooms: (data: { rooms: OnlineRoomListItem[] }) => void;
  resListOnlineArchivedRooms: (data: { rooms: OnlineRoomListItem[] }) => void;
  resOnlineHistory: (data: { rooms: OnlineRoomListItem[] }) => void;
  resJoinOnlineRoom: (data: {
    roomId: string;
    roomCode: string;
    joinPin: string;
    pinExpiresAt: number;
    nostrMeta?: OnlineNostrMeta;
    room: OnlineRoomState;
  }) => void;
  onlineRoomUpdated: (data: OnlineRoomState) => void;
  onlineRoomSnapshot: (data: { roomId: string; snapshot: OnlineRoomSnapshot }) => void;
  /** New mempool tip block: server already spawned food; use for SFX / UI flash only. */
  onlineBitcoinBlock: (data: {
    roomId: string;
    blockHeight: number;
    medianFeeSatPerVb: number;
  }) => void;
  onlineSeatAssigned: (data: {
    roomId: string;
    playerRole: PlayerRole.Player1 | PlayerRole.Player2;
    sessionId: string;
  }) => void;
  onlinePinInvalid: (data: { reason: string }) => void;
  resOnlineNostrLinkChallenge: (data: { roomId: string; challenge: string; expiresAt: number }) => void;
  resOnlineNostrLinkOk: (data: { expiresAt: number }) => void;
  resOnlinePostGameInfo: (data: {
    roomId: string;
    phase: 'postgame' | 'finished';
    p1Name: string;
    p2Name: string;
    p1Picture?: string;
    p2Picture?: string;
    p1SessionID?: string;
    p2SessionID?: string;
    p1Points: number;
    p2Points: number;
    winnerRole?: PlayerRole.Player1 | PlayerRole.Player2;
    winnerSessionID?: string;
    winnerName: string;
    winnerPicture?: string;
    winnerPoints: number;
    totalPrize: number;
    lnurlw?: string;
    payoutMethod?: 'withdraw_qr' | 'nostr_zap';
    payoutTarget?: string;
    winnerLnAddress?: string;
    rematchRequested?: boolean;
    rematchRequiredAmount?: number;
    rematchEventId?: string;
    rematchNote1?: string;
    rematchWaitingForSessionID?: string;
    doubleOrNothingVotes: number;
  }) => void;
  resCreateOnlineWithdrawal: (data: { roomId: string; lnurlw: string }) => void;
  resCreateOnlineNostrPayout: (data: {
    roomId: string;
    lnAddress: string;
    amount: number;
    ok: boolean;
  }) => void;
  onlineDoubleOrNothingUpdate: (data: {
    roomId: string;
    votes: number;
    required: number;
    agreed: boolean;
  }) => void;
  resOnlineReplay: (data: {
    roomId: string;
    tickMs: number;
    format: 'compact-v2';
    gzipBase64: string;
    frameCount: number;
    matchRound?: number;
    blockEvents?: OnlineReplayBlockEvent[];
  }) => void;
}
