export type OnlineSeatPayMethod = 'lightning' | 'nostr_web' | 'nostr_app';
export type LobbyPaymentMode = 'anon' | 'nostr' | 'pin-zap';

const STORAGE_PREFIX = 'onlineSeatPayMethod:';

export function lobbyPaymentModeFromSeatPayMethod(
  payMethod?: OnlineSeatPayMethod | string | null
): LobbyPaymentMode | null {
  switch (payMethod) {
    case 'lightning':
      return 'anon';
    case 'nostr_web':
      return 'nostr';
    case 'nostr_app':
      return 'pin-zap';
    default:
      return null;
  }
}

export function readStoredLobbyPaymentMode(
  roomId: string
): LobbyPaymentMode | null {
  if (typeof window === 'undefined' || !roomId) return null;
  const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${roomId}`);
  if (raw === 'anon' || raw === 'nostr' || raw === 'pin-zap') {
    return raw;
  }
  return null;
}

export function storeLobbyPaymentMode(
  roomId: string,
  mode: LobbyPaymentMode
): void {
  if (typeof window === 'undefined' || !roomId) return;
  sessionStorage.setItem(`${STORAGE_PREFIX}${roomId}`, mode);
}

export function resolveLobbyPaymentModeForSeat(params: {
  roomId: string;
  payMethod?: OnlineSeatPayMethod | string | null;
}): LobbyPaymentMode | null {
  return (
    lobbyPaymentModeFromSeatPayMethod(params.payMethod) ??
    readStoredLobbyPaymentMode(params.roomId)
  );
}
