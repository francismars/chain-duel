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

export const ResPostGameInfoRequestSchema = SerializedGameInfoSchema.extend({
  lnurlw: z.string().optional(),
});

export const ResCancelTournamentSchema = z.object({
  depositcount: z.number(),
  lnurlw: z.string().optional(),
});
