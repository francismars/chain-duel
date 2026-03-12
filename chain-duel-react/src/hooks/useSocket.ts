/**
 * React hook for Socket.io connection
 * Manages socket lifecycle and provides typed event handlers
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';
import { getSocket, disconnectSocket, SocketConfig } from '@/lib/socket';
import { loadConfig } from '@/lib/config';

export interface UseSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface UseSocketReturn {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * React hook for Socket.io connection
 * 
 * @example
 * ```tsx
 * const { socket, connected } = useSocket({
 *   onConnect: () => console.log('Connected!'),
 * });
 * 
 * useEffect(() => {
 *   if (!socket) return;
 *   
 *   socket.on('resGetDuelInfos', (data) => {
 *     console.log('Game info:', data);
 *   });
 *   
 *   return () => {
 *     socket.off('resGetDuelInfos');
 *   };
 * }, [socket]);
 * ```
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const {
    autoConnect = true,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [socket, setSocket] = useState<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const lifecycleHandlersRef = useRef<{
    connect?: () => void;
    disconnect?: () => void;
    connectError?: (err: Error) => void;
  }>({});
  const configRef = useRef<SocketConfig | null>(null);

  const connect = useCallback(async () => {
    try {
      // Load config if not already loaded
      if (!configRef.current) {
        const config = await loadConfig();
        configRef.current = { serverIP: config.IP, serverPORT: config.PORT };
      }

      // Get socket connection (may be existing and already connected when navigating)
      const nextSocket = getSocket(configRef.current!);
      socketRef.current = nextSocket;
      setSocket(nextSocket);
      setConnected(nextSocket.connected);

      // Remove only handlers attached by this hook instance.
      if (lifecycleHandlersRef.current.connect) {
        nextSocket.off('connect', lifecycleHandlersRef.current.connect);
      }
      if (lifecycleHandlersRef.current.disconnect) {
        nextSocket.off('disconnect', lifecycleHandlersRef.current.disconnect);
      }
      if (lifecycleHandlersRef.current.connectError) {
        nextSocket.off('connect_error', lifecycleHandlersRef.current.connectError);
      }

      const onSocketConnect = () => {
        setConnected(true);
        setError(null);
        onConnect?.();
      };

      const onSocketDisconnect = () => {
        setConnected(false);
        onDisconnect?.();
      };

      const onSocketConnectError = (err: Error) => {
        const error = new Error(`Socket connection error: ${err.message}`);
        setError(error);
        onError?.(error);
      };

      lifecycleHandlersRef.current.connect = onSocketConnect;
      lifecycleHandlersRef.current.disconnect = onSocketDisconnect;
      lifecycleHandlersRef.current.connectError = onSocketConnectError;

      nextSocket.on('connect', onSocketConnect);
      nextSocket.on('disconnect', onSocketDisconnect);
      nextSocket.on('connect_error', onSocketConnectError);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
    }
  }, [onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    socketRef.current = null;
    setSocket(null);
    setConnected(false);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      // Cleanup only lifecycle listeners owned by this hook.
      if (socketRef.current) {
        if (lifecycleHandlersRef.current.connect) {
          socketRef.current.off('connect', lifecycleHandlersRef.current.connect);
        }
        if (lifecycleHandlersRef.current.disconnect) {
          socketRef.current.off('disconnect', lifecycleHandlersRef.current.disconnect);
        }
        if (lifecycleHandlersRef.current.connectError) {
          socketRef.current.off('connect_error', lifecycleHandlersRef.current.connectError);
        }
      }
    };
  }, [autoConnect, connect]);

  return {
    socket,
    connected,
    error,
    connect,
    disconnect,
  };
}
