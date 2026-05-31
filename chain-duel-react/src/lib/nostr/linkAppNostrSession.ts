import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';
import type { StoredSignerMode } from '@/lib/nostr/signerSession';
import { signOnlineSeatLinkChallenge } from '@/lib/nostr/signOnlineSeatLink';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Bind the active local signer to the marspay socket session (kind-1 challenge).
 */
const LINK_TIMEOUT_MS = 50_000;
const NIP46_LINK_TIMEOUT_MS = 90_000;

export function linkAppNostrSession(
  socket: GameSocket,
  signerMode: StoredSignerMode
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutMs = signerMode === 'nip46' ? NIP46_LINK_TIMEOUT_MS : LINK_TIMEOUT_MS;
    const timeout = window.setTimeout(() => {
      cleanup();
      const hint =
        signerMode === 'nip46'
          ? ' Open Primal on your phone and tap Allow when prompted.'
          : '';
      reject(new Error(`Timed out waiting for Nostr session link.${hint}`));
    }, timeoutMs);

    const onChallenge = async (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resAppNostrLinkChallenge(payload);
      if (!parsed) {
        return;
      }
      try {
        const signed = await signOnlineSeatLinkChallenge({
          challenge: parsed.challenge,
        });
        socket.emit('confirmAppNostrLink', {
          event: signed as unknown as Record<string, unknown>,
          signerMode,
        });
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error('Signing failed'));
      }
    };

    const onSession = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resAppNostrSession(payload);
      if (!parsed) {
        return;
      }
      if (parsed.ok) {
        cleanup();
        resolve();
        return;
      }
      if (parsed.reason && parsed.reason !== 'challenge_denied') {
        cleanup();
        reject(new Error(parsed.reason));
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('resAppNostrLinkChallenge', onChallenge);
      socket.off('resAppNostrSession', onSession);
    };

    socket.on('resAppNostrLinkChallenge', onChallenge);
    socket.on('resAppNostrSession', onSession);
    socket.emit('requestAppNostrLinkChallenge');
  });
}
