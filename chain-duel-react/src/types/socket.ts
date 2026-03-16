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
}
