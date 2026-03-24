import { SocketValidators } from '@/lib/socketValidation';

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type SocketLike = {
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
  once?: (event: string, cb: (...args: unknown[]) => void) => void;
  connect?: () => void;
  connected?: boolean;
};

export function asSocketBoundary(socket: unknown): SocketLike | null {
  if (!socket || typeof socket !== 'object') return null;
  const candidate = socket as Partial<SocketLike>;
  if (
    typeof candidate.emit !== 'function' ||
    typeof candidate.on !== 'function' ||
    typeof candidate.off !== 'function'
  ) {
    return null;
  }
  return candidate as SocketLike;
}

export function parseWithValidator<T>(
  payload: unknown,
  validator: (data: unknown) => ValidationResult<T>
): T | null {
  const parsed = validator(payload);
  if (!parsed.success) return null;
  return parsed.data;
}

export const SocketBoundaryParsers = {
  duelInfos: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resGetDuelInfos),
  payments: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.updatePayments),
  tournamentInfos: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resGetTournamentInfos),
  tournamentInfosNostr: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resGetTournamentInfosNostr),
  cancelTournament: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.rescanceltourn),
  createOnlineRoom: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resCreateOnlineRoom),
  listOnlineRooms: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resListOnlineRooms),
  listOnlineArchivedRooms: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resListOnlineArchivedRooms),
  onlineHistory: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineHistory),
  joinOnlineRoom: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resJoinOnlineRoom),
  onlineRoomUpdated: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.onlineRoomUpdated),
  onlineRoomSnapshot: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.onlineRoomSnapshot),
  onlineSeatAssigned: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.onlineSeatAssigned),
  onlinePinInvalid: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.onlinePinInvalid),
  resOnlineNostrLinkChallenge: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineNostrLinkChallenge),
  resOnlineNostrLinkOk: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineNostrLinkOk),
  resOnlineKind1Post: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineKind1Post),
  resOnlineSeatZapPayPrepare: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineSeatZapPayPrepare),
  resOnlineSeatZapPayInvoice: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineSeatZapPayInvoice),
  resOnlineSeatZapPayError: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineSeatZapPayError),
  resOnlineSeatLightning: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineSeatLightning),
  resOnlineSeatLightningError: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineSeatLightningError),
  resOnlineSeatLightningCancelled: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineSeatLightningCancelled),
  onlinePostGameInfo: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlinePostGameInfo),
  createOnlineWithdrawal: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resCreateOnlineWithdrawal),
  createOnlineNostrPayout: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resCreateOnlineNostrPayout),
  onlineDoubleOrNothingUpdate: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.onlineDoubleOrNothingUpdate),
  onlineReplay: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.resOnlineReplay),
};
