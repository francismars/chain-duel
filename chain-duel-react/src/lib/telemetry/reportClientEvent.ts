import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket';

export type ClientTelemetrySocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

const ALLOWED_EVENTS = new Set([
  'client.page.view',
  'client.funnel.abandon',
  'client.ui.error',
]);

export function reportClientEvent(
  socket: ClientTelemetrySocket | null,
  event: string,
  detail?: { route?: string; detail?: string }
): void {
  if (!socket?.connected) return;
  if (!ALLOWED_EVENTS.has(event)) return;
  socket.emit('reportClientEvent', {
    event,
    route: detail?.route,
    detail: detail?.detail,
  });
}
