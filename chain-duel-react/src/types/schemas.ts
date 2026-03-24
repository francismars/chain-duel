/**
 * Zod schemas for runtime validation of socket events
 * These ensure type safety at runtime, not just compile time
 */

import { z } from 'zod';
import { GameMode, PlayerRole } from './socket';

// ============================================================================
// Core Schemas
// ============================================================================

export const PaymentSchema = z.object({
  amount: z.number(),
  note: z.string().nullable().optional(),
});

export const PlayerInfoSchema = z.object({
  name: z.string(),
  value: z.number(),
  payments: z.array(PaymentSchema).optional(),
  picture: z.string().optional(),
  id: z.string().optional(),
  participantId: z.string().optional(),
  isAnon: z.boolean().optional(),
  nostrPubkey: z.string().optional(),
  fallbackLabel: z.string().optional(),
});

export const SerializedGameInfoSchema = z.object({
  mode: z.nativeEnum(GameMode),
  players: z.record(z.string(), PlayerInfoSchema),
  winners: z.array(z.nativeEnum(PlayerRole)).optional(),
  numberOfPlayers: z.number().optional(),
  champion: z.string().optional(),
});

// ============================================================================
// LNURL Schemas
// ============================================================================

export const LNURLPSchema = z.object({
  id: z.string(),
  lnurlp: z.string(),
  description: z.string(),
  min: z.number(),
  mode: z.nativeEnum(GameMode).optional(),
  hostLNAddress: z.string().optional(),
});

export const LNURLWSchema = z.object({
  id: z.string(),
  lnurlw: z.string(),
  maxWithdrawals: z.number().optional(),
  claimedCount: z.number().optional(),
});

// ============================================================================
// Event Payload Schemas
// ============================================================================

export const SessionDataSchema = z.object({
  sessionID: z.string(),
  userID: z.string(),
});

export const ResGetGameMenuInfosSchema = z.union([
  z.array(LNURLPSchema),
  z.object({ lnurlw: LNURLWSchema }),
  z.array(
    z.object({
      id: z.string(),
      note1: z.string(),
      emojis: z.string(),
      min: z.number(),
      mode: z.string(),
      hostLNAddress: z.string().optional(),
    })
  ),
]);

export const ResGetTournamentInfosSchema = z.object({
  gameInfo: SerializedGameInfoSchema.optional(),
  lnurlp: z.string().optional(),
  lnurlw: z.string().optional(),
  min: z.number().optional(),
  claimedCount: z.number().optional(),
});

export const TournamentNostrMetaSchema = z.object({
  note1: z.string(),
  emojis: z.string(),
  min: z.number(),
  mode: z.string(),
  playersNeeded: z.number(),
  currentAdmissions: z.number(),
});

export const OnlineNostrMetaSchema = z.object({
  note1: z.string(),
  emojis: z.string(),
  min: z.number(),
  mode: z.string(),
});

export const OnlineRoomSnapshotSchema = z.object({
  tick: z.number(),
  phase: z.enum(['lobby', 'playing', 'postgame', 'finished', 'cancelled']),
  state: z.object({}).passthrough(),
  hud: z.object({
    p1Points: z.number(),
    p2Points: z.number(),
    captureP1: z.string(),
    captureP2: z.string(),
    initialWidthP1: z.number(),
    initialWidthP2: z.number(),
    currentWidthP1: z.number(),
    currentWidthP2: z.number(),
  }),
});

export const OnlineSeatStateSchema = z.object({
  role: z.union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)]),
  sessionID: z.string().optional(),
  socketID: z.string().optional(),
  status: z.union([z.literal('open'), z.literal('paid')]),
  paidAmount: z.number().optional(),
  paidAt: z.number().optional(),
  ready: z.boolean().optional(),
  disconnectedAt: z.number().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
  pubkey: z.string().optional(),
  lnAddress: z.string().optional(),
  pingMs: z.number().optional(),
});

export const OnlineRoomStateSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  hostSessionID: z.string(),
  buyin: z.number(),
  matchRound: z.number().optional(),
  createdAt: z.number().optional(),
  finishedAt: z.number().optional(),
  phase: z.enum(['lobby', 'playing', 'postgame', 'finished', 'cancelled']),
  kind1EventId: z.string().optional(),
  nostrMeta: OnlineNostrMetaSchema.optional(),
  seats: z.record(z.string(), OnlineSeatStateSchema),
  spectators: z.array(z.string()),
  snapshot: OnlineRoomSnapshotSchema,
  result: z
    .object({
      winnerName: z.string(),
      p1Name: z.string(),
      p2Name: z.string(),
      p1Score: z.number(),
      p2Score: z.number(),
      netPrize: z.number(),
      p1Picture: z.string().optional(),
      p2Picture: z.string().optional(),
      winnerPicture: z.string().optional(),
      winnerRole: z
        .union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)])
        .optional(),
    })
    .optional(),
  replay: z
    .object({
      available: z.boolean(),
      frameCount: z.number(),
      tickMs: z.number(),
      durationMs: z.number(),
    })
    .optional(),
  postGame: z
    .object({
      p1Picture: z.string().optional(),
      p2Picture: z.string().optional(),
      winnerRole: z.union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)]).optional(),
      winnerSessionID: z.string().optional(),
      winnerName: z.string(),
      winnerPicture: z.string().optional(),
      winnerPoints: z.number(),
      totalPrize: z.number(),
      lnurlw: z.string().optional(),
      payoutMethod: z.enum(['withdraw_qr', 'nostr_zap']).optional(),
      payoutTarget: z.string().optional(),
      winnerLnAddress: z.string().optional(),
      rematchRequested: z.boolean().optional(),
      rematchRequiredAmount: z.number().optional(),
      rematchEventId: z.string().optional(),
      rematchNote1: z.string().optional(),
      rematchWaitingForSessionID: z.string().optional(),
      doubleOrNothingVotes: z.number(),
    })
    .optional(),
});

export const OnlineRoomListItemSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  buyin: z.number(),
  createdAt: z.number(),
  finishedAt: z.number().optional(),
  phase: z.enum(['lobby', 'playing', 'postgame', 'finished', 'cancelled']),
  playersPaid: z.number(),
  seatsTotal: z.number(),
  spectators: z.number(),
  archived: z.boolean().optional(),
  matchRound: z.number().optional(),
  archiveKind: z.enum(['match', 'session']).optional(),
  replay: z
    .object({
      available: z.boolean(),
      frameCount: z.number(),
      tickMs: z.number(),
      durationMs: z.number(),
    })
    .optional(),
  result: z
    .object({
      winnerName: z.string(),
      p1Name: z.string(),
      p2Name: z.string(),
      p1Score: z.number(),
      p2Score: z.number(),
      netPrize: z.number(),
      p1Picture: z.string().optional(),
      p2Picture: z.string().optional(),
      winnerPicture: z.string().optional(),
      winnerRole: z
        .union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)])
        .optional(),
    })
    .optional(),
});

export const ResCreateOnlineRoomSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  joinPin: z.string(),
  pinExpiresAt: z.number(),
  nostrMeta: OnlineNostrMetaSchema.optional(),
  room: OnlineRoomStateSchema,
});

export const ResListOnlineRoomsSchema = z.object({
  rooms: z.array(OnlineRoomListItemSchema),
});

export const ResListOnlineArchivedRoomsSchema = z.object({
  rooms: z.array(OnlineRoomListItemSchema),
});

/** Merged history: archived index + finished rooms still in RAM (same shape). */
export const ResOnlineHistorySchema = z.object({
  rooms: z.array(OnlineRoomListItemSchema),
});

export const ResJoinOnlineRoomSchema = ResCreateOnlineRoomSchema;

export const OnlineRoomSnapshotEventSchema = z.object({
  roomId: z.string(),
  snapshot: OnlineRoomSnapshotSchema,
});

export const OnlineSeatAssignedSchema = z.object({
  roomId: z.string(),
  playerRole: z.union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)]),
  sessionId: z.string(),
});

export const OnlinePinInvalidSchema = z.object({
  reason: z.string(),
});

export const ResOnlineNostrLinkChallengeSchema = z.object({
  roomId: z.string(),
  challenge: z.string(),
  expiresAt: z.number(),
});

export const NostrLinkedProfileSchema = z.object({
  pubkey: z.string(),
  name: z.string(),
  picture: z.string().nullable().optional(),
});

export type NostrLinkedProfile = z.infer<typeof NostrLinkedProfileSchema>;

export const ResOnlineNostrLinkOkSchema = z.object({
  expiresAt: z.number(),
  profile: NostrLinkedProfileSchema.optional(),
});

export const ResOnlineKind1PostOkSchema = z.object({
  roomId: z.string(),
  ok: z.literal(true),
  content: z.string(),
  created_at: z.number(),
  pubkey: z.string(),
  npubDisplay: z.string(),
});

export const ResOnlineKind1PostErrSchema = z.object({
  roomId: z.string(),
  ok: z.literal(false),
  reason: z.string(),
});

export const ResOnlineKind1PostSchema = z.discriminatedUnion('ok', [
  ResOnlineKind1PostOkSchema,
  ResOnlineKind1PostErrSchema,
]);

export const ResOnlineSeatLightningSchema = z.object({
  lnurl: z.string(),
  lightningUri: z.string(),
  buyin: z.number(),
  expiresAt: z.number(),
});

export const ResOnlineSeatLightningErrorSchema = z.object({
  reason: z.string(),
});

export const ResOnlineSeatLightningCancelledSchema = z.object({});

export const OnlineMatchRoundSummarySchema = z.object({
  matchRound: z.number(),
  finishedAt: z.number(),
  winnerName: z.string(),
  p1Name: z.string(),
  p2Name: z.string(),
  p1Score: z.number(),
  p2Score: z.number(),
  netPrize: z.number(),
  winnerRole: z.union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)]).optional(),
});

export const ResOnlinePostGameInfoSchema = z.object({
  roomId: z.string(),
  phase: z.enum(['postgame', 'finished']),
  p1Name: z.string(),
  p2Name: z.string(),
  p1Picture: z.string().optional(),
  p2Picture: z.string().optional(),
  p1SessionID: z.string().optional(),
  p2SessionID: z.string().optional(),
  p1Points: z.number(),
  p2Points: z.number(),
  winnerRole: z.union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)]).optional(),
  winnerSessionID: z.string().optional(),
  winnerName: z.string(),
  winnerPicture: z.string().optional(),
  winnerPoints: z.number(),
  totalPrize: z.number(),
  lnurlw: z.string().optional(),
  payoutMethod: z.enum(['withdraw_qr', 'nostr_zap']).optional(),
  payoutTarget: z.string().optional(),
  winnerLnAddress: z.string().optional(),
  rematchRequested: z.boolean().optional(),
  rematchRequiredAmount: z.number().optional(),
  rematchEventId: z.string().optional(),
  rematchNote1: z.string().optional(),
  rematchWaitingForSessionID: z.string().optional(),
  doubleOrNothingVotes: z.number(),
  matchRounds: z.array(OnlineMatchRoundSummarySchema).optional(),
});

export const ResCreateOnlineWithdrawalSchema = z.object({
  roomId: z.string(),
  lnurlw: z.string(),
});

export const ResCreateOnlineNostrPayoutSchema = z.object({
  roomId: z.string(),
  lnAddress: z.string(),
  amount: z.number(),
  ok: z.boolean(),
});

export const OnlineDoubleOrNothingUpdateSchema = z.object({
  roomId: z.string(),
  votes: z.number(),
  required: z.number(),
  agreed: z.boolean(),
});

export const OnlineReplayBlockEventSchema = z.object({
  frameIndex: z.number(),
  blockHeight: z.number(),
  medianFeeSatPerVb: z.number(),
});

export const ResOnlineReplaySchema = z.object({
  roomId: z.string(),
  tickMs: z.number(),
  format: z.literal('compact-v2'),
  gzipBase64: z.string(),
  frameCount: z.number(),
  matchRound: z.number().optional(),
  blockEvents: z.array(OnlineReplayBlockEventSchema).optional(),
});

export const ResGetTournamentInfosNostrSchema = z.object({
  gameInfo: SerializedGameInfoSchema.optional(),
  nostrMeta: TournamentNostrMetaSchema,
  lnurlw: z.string().optional(),
  claimedCount: z.number().optional(),
});

export const ResPostGameInfoRequestSchema = SerializedGameInfoSchema.extend({
  lnurlw: z.string().optional(),
});

export const ResCancelTournamentSchema = z.object({
  depositcount: z.number(),
  lnurlw: z.string().optional(),
});
