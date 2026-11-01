/** WebSocket.CLOSING and WebSocket.CLOSED. */
const TRANSPORT_CLOSING = 2;
const TRANSPORT_CLOSED = 3;

export interface VisibleSocket {
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  /** socket.io's engine transport. `ws` is only present on the websocket transport. */
  io?: {
    engine?: {
      transport?: unknown;
    };
  };
}

function transportReadyState(transport: unknown): number | undefined {
  if (transport == null || typeof transport !== 'object') return undefined;
  const ws = (transport as { ws?: { readyState?: unknown } }).ws;
  return typeof ws?.readyState === 'number' ? ws.readyState : undefined;
}

/**
 * Resume a socket the browser froze while the tab was hidden.
 * A live transport is left alone. A closed one is replaced immediately
 * instead of waiting out the ping timeout.
 */
export function reconnectSocketOnVisible(
  socket: VisibleSocket | null,
  visibilityState: DocumentVisibilityState
): void {
  if (visibilityState !== 'visible' || !socket) return;
  const readyState = transportReadyState(socket.io?.engine?.transport);
  const transportDead =
    readyState === TRANSPORT_CLOSING || readyState === TRANSPORT_CLOSED;
  if (transportDead) {
    socket.disconnect();
    socket.connect();
    return;
  }
  if (!socket.connected) socket.connect();
}
