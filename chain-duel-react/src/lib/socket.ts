/**
 * Socket.io client wrapper with proper typing
 * Handles connection, reconnection, and session management
 */

import { Socket, io } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export interface SocketConfig {
  serverIP: string;
  serverPORT: string;
}

/**
 * Get or create socket connection
 * Manages session persistence and reconnection
 */
export function getSocket(config: SocketConfig): Socket<
  ServerToClientEvents,
  ClientToServerEvents
> {
  // Return existing connected socket
  if (socket?.connected) {
    return socket;
  }

  // Get existing session ID
  const sessionID = sessionStorage.getItem('sessionID');

  // Build socket URL: backend may return full URL (e.g. wss://marspay.chainduel.net) in IP with empty PORT
  const socketUrl =
    config.serverIP.includes('://')
      ? config.serverIP
      : config.serverPORT
        ? `${config.serverIP}:${config.serverPORT}`
        : config.serverIP;

  // Create new socket connection
  socket = io(socketUrl, {
    transports: ['websocket'],
    autoConnect: false,
    auth: sessionID ? { sessionID } : undefined,
  });

  // Handle session persistence
  socket.on('session', ({ sessionID: newSessionID }) => {
    sessionStorage.setItem('sessionID', newSessionID);
    socket!.auth = { sessionID: newSessionID };
  });

  // Connect
  socket.connect();

  return socket;
}

/**
 * Disconnect socket
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

/**
 * Get current socket instance (may be null)
 */
export function getCurrentSocket(): Socket<
  ServerToClientEvents,
  ClientToServerEvents
> | null {
  return socket;
}
