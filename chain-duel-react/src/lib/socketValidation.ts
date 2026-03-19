/**
 * Runtime validation utilities for socket events
 * Uses Zod schemas to validate incoming socket data
 */

import { z } from 'zod';
import {
  OnlineDoubleOrNothingUpdateSchema,
  OnlinePinInvalidSchema,
  OnlineRoomSnapshotEventSchema,
  OnlineRoomStateSchema,
  OnlineSeatAssignedSchema,
  ResCreateOnlineNostrPayoutSchema,
  ResCreateOnlineWithdrawalSchema,
  ResCreateOnlineRoomSchema,
  ResGetGameMenuInfosSchema,
  ResOnlinePostGameInfoSchema,
  ResJoinOnlineRoomSchema,
  ResListOnlineRoomsSchema,
  ResGetTournamentInfosSchema,
  ResGetTournamentInfosNostrSchema,
  ResPostGameInfoRequestSchema,
  ResCancelTournamentSchema,
  SessionDataSchema,
  SerializedGameInfoSchema,
} from '@/types/schemas';

/**
 * Validate socket event data with error handling
 * Returns validated data or null if validation fails
 */
export function validateSocketEvent<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  eventName: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      console.error(`[Socket Validation] ${eventName} validation failed:`, result.error);
      return {
        success: false,
        error: `Invalid ${eventName} payload: ${result.error.message}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Socket Validation] ${eventName} validation error:`, message);
    return {
      success: false,
      error: `Validation error for ${eventName}: ${message}`,
    };
  }
}

/**
 * Type-safe event validators
 */
export const SocketValidators = {
  session: (data: unknown) =>
    validateSocketEvent(SessionDataSchema, data, 'session'),

  resGetGameMenuInfos: (data: unknown) =>
    validateSocketEvent(ResGetGameMenuInfosSchema, data, 'resGetGameMenuInfos'),

  resGetTournamentInfos: (data: unknown) =>
    validateSocketEvent(
      ResGetTournamentInfosSchema,
      data,
      'resGetTournamentInfos'
    ),

  resGetDuelInfos: (data: unknown) =>
    validateSocketEvent(SerializedGameInfoSchema, data, 'resGetDuelInfos'),

  resGetTournamentInfosNostr: (data: unknown) =>
    validateSocketEvent(
      ResGetTournamentInfosNostrSchema,
      data,
      'resGetTournamentInfosNostr'
    ),

  resPostGameInfoRequest: (data: unknown) =>
    validateSocketEvent(
      ResPostGameInfoRequestSchema,
      data,
      'resPostGameInfoRequest'
    ),

  updatePayments: (data: unknown) =>
    validateSocketEvent(SerializedGameInfoSchema, data, 'updatePayments'),

  rescanceltourn: (data: unknown) =>
    validateSocketEvent(ResCancelTournamentSchema, data, 'rescanceltourn'),

  resCreateOnlineRoom: (data: unknown) =>
    validateSocketEvent(ResCreateOnlineRoomSchema, data, 'resCreateOnlineRoom'),

  resListOnlineRooms: (data: unknown) =>
    validateSocketEvent(ResListOnlineRoomsSchema, data, 'resListOnlineRooms'),

  resJoinOnlineRoom: (data: unknown) =>
    validateSocketEvent(ResJoinOnlineRoomSchema, data, 'resJoinOnlineRoom'),

  onlineRoomUpdated: (data: unknown) =>
    validateSocketEvent(OnlineRoomStateSchema, data, 'onlineRoomUpdated'),

  onlineRoomSnapshot: (data: unknown) =>
    validateSocketEvent(OnlineRoomSnapshotEventSchema, data, 'onlineRoomSnapshot'),

  onlineSeatAssigned: (data: unknown) =>
    validateSocketEvent(OnlineSeatAssignedSchema, data, 'onlineSeatAssigned'),

  onlinePinInvalid: (data: unknown) =>
    validateSocketEvent(OnlinePinInvalidSchema, data, 'onlinePinInvalid'),

  resOnlinePostGameInfo: (data: unknown) =>
    validateSocketEvent(ResOnlinePostGameInfoSchema, data, 'resOnlinePostGameInfo'),

  resCreateOnlineWithdrawal: (data: unknown) =>
    validateSocketEvent(ResCreateOnlineWithdrawalSchema, data, 'resCreateOnlineWithdrawal'),

  resCreateOnlineNostrPayout: (data: unknown) =>
    validateSocketEvent(ResCreateOnlineNostrPayoutSchema, data, 'resCreateOnlineNostrPayout'),

  onlineDoubleOrNothingUpdate: (data: unknown) =>
    validateSocketEvent(OnlineDoubleOrNothingUpdateSchema, data, 'onlineDoubleOrNothingUpdate'),
};
