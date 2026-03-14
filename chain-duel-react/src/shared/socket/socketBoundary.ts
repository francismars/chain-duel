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
  cancelTournament: (payload: unknown) =>
    parseWithValidator(payload, SocketValidators.rescanceltourn),
};
