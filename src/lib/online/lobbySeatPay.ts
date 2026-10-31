import { decodeBolt11ExpiresAt } from '@/lib/lightning/decodeBolt11ExpiresAt';
import type { LobbyPaymentMode } from '@/lib/online/resolveLobbyPaymentMode';

const SEAT_ZAP_FALLBACK_EXPIRY_MS = 60 * 60 * 1000;

const ZAP_LINK_CLEAR_REASONS = new Set(['nostr_not_linked', 'no_session']);

export type LobbyPayFailureSource = 'pin' | 'lightning' | 'zap' | 'sign';

export type LobbyPayFailureRoute =
  | { action: 'ignore' }
  | {
      action: 'show';
      slot: 'nostr' | 'generic';
      message: string;
      clearStoredNostrLink: boolean;
    };

export type StoredNostrLink = {
  expiresAt: number;
  pubkey: string;
  name: string;
  picture: string | null;
};

export type ParsedStoredNostrLink =
  | { action: 'absent' }
  | { action: 'drop' }
  | { action: 'restore'; link: StoredNostrLink };

export type ZapAutoPrepare = 'reset' | 'hold' | 'prepare';

export type NostrLinkAutoStart = 'reset' | 'hold' | 'start';

export function formatZapPayError(reason: string): string {
  switch (reason) {
    case 'pubkey_mismatch':
      return 'Zap signature pubkey does not match your linked identity. Sign out in Settings, sign in again with Nostr Connect, then retry.';
    case 'nostr_not_linked':
      return 'Nostr room link expired or missing. Tap Link & pay again.';
    case 'host_ln_unknown':
      return 'Could not resolve the host Lightning address from the room note.';
    case 'recipient_lnurl_no_zap':
      return 'Host Lightning address does not accept Nostr zaps.';
    case 'kind1_not_ready':
      return 'Room note is not ready yet. Wait a moment and try again.';
    case 'no_nostr_signer':
      return 'No Nostr signer available. Reconnect Nostr Connect in Settings.';
    case 'already_seated':
      return 'You already have a paid seat in this room.';
    case 'seats_full':
      return 'Both seats are already taken.';
    case 'not_loser':
      return 'That zap did not come from the losing player. Use the same identity or payment method as your buy-in.';
    case 'amount_too_low':
      return 'Zap amount is too low for double or nothing. Pay the exact rematch amount on the rematch note.';
    case 'rematch_use_rematch_note':
      return 'Zap the rematch note (published after both players agreed), not the original room note.';
    case 'rematch_not_requested':
      return 'Double or nothing is no longer waiting for payment.';
    case 'rematch_not_ready':
      return 'Rematch note is still publishing. Wait a moment — payment will open automatically.';
    case 'room_not_finished':
      return 'The room is not in postgame — rematch payment cannot be applied.';
    case 'no_session':
      return 'Lost connection to game server. Refresh the page and try again.';
    default:
      return reason.replace(/_/g, ' ');
  }
}

/**
 * Pin, Lightning, zap, and signer failures do not share one slot rule.
 * `rematch_not_ready` is ignored only for Lightning and zap.
 * A signer exception stays raw on the generic slot.
 * Only zap reasons `nostr_not_linked` and `no_session` clear the stored link,
 * and only after the ignore check.
 */
export function routeLobbyPayFailure(input: {
  source: LobbyPayFailureSource;
  reason: string;
  paymentMode: LobbyPaymentMode | null;
  rematchPending: boolean;
}): LobbyPayFailureRoute {
  const { source, reason, paymentMode, rematchPending } = input;

  if (
    (source === 'lightning' || source === 'zap') &&
    reason === 'rematch_not_ready'
  ) {
    return { action: 'ignore' };
  }

  const formatted = formatZapPayError(reason);
  const clearStoredNostrLink =
    source === 'zap' && ZAP_LINK_CLEAR_REASONS.has(reason);
  const nostrSlot =
    source === 'pin'
      ? paymentMode === 'nostr' || rematchPending
      : source === 'lightning'
        ? false
        : paymentMode === 'nostr';

  if (source === 'sign' && !nostrSlot) {
    return {
      action: 'show',
      slot: 'generic',
      message: reason,
      clearStoredNostrLink: false,
    };
  }

  return {
    action: 'show',
    slot: nostrSlot ? 'nostr' : 'generic',
    message: formatted,
    clearStoredNostrLink,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Missing storage is absent. Bad or stale JSON is drop. A live link is restore. */
export function parseStoredNostrLink(
  raw: string | null,
  now: number,
  currentSessionId: string
): ParsedStoredNostrLink {
  if (!raw) {
    return { action: 'absent' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { action: 'drop' };
  }
  if (!isRecord(parsed)) {
    return { action: 'drop' };
  }

  const storedSession = parsed.sessionID;
  if (storedSession && currentSessionId && storedSession !== currentSessionId) {
    return { action: 'drop' };
  }

  const expiresAt = parsed.expiresAt;
  const pubkey = parsed.pubkey;
  if (
    typeof expiresAt !== 'number' ||
    !(expiresAt > now) ||
    typeof pubkey !== 'string'
  ) {
    return { action: 'drop' };
  }

  const name = parsed.name;
  const picture = parsed.picture;
  return {
    action: 'restore',
    link: {
      expiresAt,
      pubkey,
      name: typeof name === 'string' ? name : `${pubkey.slice(0, 12)}…`,
      picture: typeof picture === 'string' ? picture : null,
    },
  };
}

/** A live `session` event clears the link only when a previous id exists and differs. */
export function sessionReplacesNostrLink(
  prev: string | null,
  next: string
): boolean {
  return Boolean(prev && prev !== next);
}

/**
 * Once-ref stays in the lobby. `reset` clears it, `hold` leaves it,
 * `prepare` emits only when it was clear.
 * Rematch-not-ready resets so the zap can fire after the note lands.
 * An existing invoice, a busy zap, or a signed-out session only holds.
 */
export function nextZapAutoPrepare(input: {
  paymentMode: LobbyPaymentMode | null;
  nostrLinkActive: boolean;
  hasSeatZapInvoice: boolean;
  zapPayBusy: boolean;
  signedIn: boolean;
  rematchLoserPay: boolean;
  rematchReady: boolean;
}): ZapAutoPrepare {
  if (input.paymentMode !== 'nostr' || !input.nostrLinkActive) {
    return 'reset';
  }
  if (input.hasSeatZapInvoice || input.zapPayBusy || !input.signedIn) {
    return 'hold';
  }
  if (input.rematchLoserPay && !input.rematchReady) {
    return 'reset';
  }
  return 'prepare';
}

/**
 * Once-ref stays in the lobby. Reset only when the mode leaves Nostr
 * or the session signs out. Other blockers hold the existing latch.
 */
export function nextNostrLinkAutoStart(input: {
  paymentMode: LobbyPaymentMode | null;
  signedIn: boolean;
  nostrLinkActive: boolean;
  hasSeatZapInvoice: boolean;
  linkBusy: boolean;
  canEmit: boolean;
  payError: boolean;
  signerAvailable: boolean;
}): NostrLinkAutoStart {
  if (input.paymentMode !== 'nostr' || !input.signedIn) {
    return 'reset';
  }
  if (
    input.nostrLinkActive ||
    input.hasSeatZapInvoice ||
    input.linkBusy ||
    !input.canEmit ||
    input.payError ||
    !input.signerAvailable
  ) {
    return 'hold';
  }
  return 'start';
}

/** Immediate zap after link confirmation. Does not consult rematch readiness. */
export function prepareZapOnLinkConfirmed(
  mode: LobbyPaymentMode | null
): boolean {
  return mode === 'nostr';
}

export function resolveSeatZapExpiresAt(
  pr: string,
  lightningUri: string,
  now: number
): number {
  return (
    decodeBolt11ExpiresAt(pr) ??
    decodeBolt11ExpiresAt(lightningUri) ??
    now + SEAT_ZAP_FALLBACK_EXPIRY_MS
  );
}
