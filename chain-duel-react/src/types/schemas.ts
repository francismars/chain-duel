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
  phase: z.enum(['lobby', 'playing', 'finished', 'cancelled']),
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
  name: z.string().optional(),
  picture: z.string().optional(),
  pubkey: z.string().optional(),
});

export const OnlineRoomStateSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  hostSessionID: z.string(),
  buyin: z.number(),
  phase: z.enum(['lobby', 'playing', 'finished', 'cancelled']),
  kind1EventId: z.string().optional(),
  nostrMeta: OnlineNostrMetaSchema.optional(),
  seats: z.record(z.string(), OnlineSeatStateSchema),
  spectators: z.array(z.string()),
  snapshot: OnlineRoomSnapshotSchema,
  postGame: z
    .object({
      winnerRole: z.union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)]).optional(),
      winnerSessionID: z.string().optional(),
      winnerName: z.string(),
      winnerPicture: z.string().optional(),
      winnerPoints: z.number(),
      totalPrize: z.number(),
      lnurlw: z.string().optional(),
      doubleOrNothingVotes: z.number(),
    })
    .optional(),
});

export const OnlineRoomListItemSchema = z.object({
  roomId: z.string(),
  roomCode: z.string(),
  buyin: z.number(),
  createdAt: z.number(),
  phase: z.enum(['lobby', 'playing', 'finished', 'cancelled']),
  playersPaid: z.number(),
  seatsTotal: z.number(),
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

export const ResOnlinePostGameInfoSchema = z.object({
  roomId: z.string(),
  phase: z.literal('finished'),
  p1Name: z.string(),
  p2Name: z.string(),
  p1Picture: z.string().optional(),
  p2Picture: z.string().optional(),
  p1Points: z.number(),
  p2Points: z.number(),
  winnerRole: z.union([z.literal(PlayerRole.Player1), z.literal(PlayerRole.Player2)]).optional(),
  winnerSessionID: z.string().optional(),
  winnerName: z.string(),
  winnerPicture: z.string().optional(),
  winnerPoints: z.number(),
  totalPrize: z.number(),
  lnurlw: z.string().optional(),
  doubleOrNothingVotes: z.number(),
});

export const ResCreateOnlineWithdrawalSchema = z.object({
  roomId: z.string(),
  lnurlw: z.string(),
});

export const OnlineDoubleOrNothingUpdateSchema = z.object({
  roomId: z.string(),
  votes: z.number(),
  required: z.number(),
  agreed: z.boolean(),
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
