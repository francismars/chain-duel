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
    let challengeReceived = false;
    let confirmSent = false;

    const timeout = window.setTimeout(() => {
      cleanup();
      const hint =
        signerMode === 'nip46'
          ? ' Check that the game server is reachable and try again.'
          : '';
      reject(new Error(`Timed out linking Nostr to the game server.${hint}`));
    }, timeoutMs);

    const onChallenge = async (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resAppNostrLinkChallenge(payload);
      if (!parsed) {
        return;
      }
      challengeReceived = true;
      console.log('[NIP-46] linkAppNostrSession: signing kind-1 challenge…');
      try {
        const signed = await signOnlineSeatLinkChallenge({
          challenge: parsed.challenge,
        });
        confirmSent = true;
        console.log('[NIP-46] linkAppNostrSession: challenge signed, confirming with server…');
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
        console.log('[NIP-46] linkAppNostrSession: ✓ server linked pubkey', parsed.pubkey?.slice(0, 12) + '…');
        cleanup();
        resolve();
        return;
      }
      // Ignore stale ok:false from getAppNostrSession before we finish linking.
      if (!challengeReceived && !confirmSent) {
        return;
      }
      cleanup();
      reject(new Error(parsed.reason ?? 'Nostr session link failed'));
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('resAppNostrLinkChallenge', onChallenge);
      socket.off('resAppNostrSession', onSession);
    };

    socket.on('resAppNostrLinkChallenge', onChallenge);
    socket.on('resAppNostrSession', onSession);
    console.log('[NIP-46] linkAppNostrSession: requesting server challenge…');
    socket.emit('requestAppNostrLinkChallenge');
  });
}
