import type { Socket } from 'socket.io-client';
import type { AppNostrProfile } from '@/types/schemas';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';
import { SocketBoundaryParsers } from '@/shared/socket/socketBoundary';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Kind-0 profile via marspay (no client relay reads). */
export function fetchProfileFromServer(
  socket: GameSocket,
  pubkey: string
): Promise<AppNostrProfile | null> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, 20_000);

    const onProfile = (payload: unknown) => {
      const parsed = SocketBoundaryParsers.resNostrProfile(payload);
      if (!parsed) {
        return;
      }
      cleanup();
      resolve(parsed.ok && parsed.profile ? parsed.profile : null);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('resNostrProfile', onProfile);
    };

    socket.on('resNostrProfile', onProfile);
    socket.emit('getNostrProfile', { pubkey });
  });
}
