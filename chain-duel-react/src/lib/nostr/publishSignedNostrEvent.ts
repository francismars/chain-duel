import type { Event } from 'nostr-tools';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Publish a client-signed event via marspay (no client relay writes). */
export function publishSignedNostrEvent(
  socket: GameSocket,
  event: Event
): Promise<{ ok: true; eventId: string } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve({ ok: false, reason: 'publish_timeout' });
    }, 25_000);

    const onRes = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resPublishNostrEvent(payload);
      if (!parsed) {
        return;
      }
      cleanup();
      if (parsed.ok && parsed.eventId) {
        resolve({ ok: true, eventId: parsed.eventId });
      } else {
        resolve({ ok: false, reason: parsed.reason ?? 'publish_failed' });
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('resPublishNostrEvent', onRes);
    };

    socket.on('resPublishNostrEvent', onRes);
    socket.emit('publishSignedNostrEvent', {
      event: event as unknown as Record<string, unknown>,
    });
  });
}
