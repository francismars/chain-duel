/**
 * React hook for the app-wide Socket.io connection.
 * Connection is owned by SocketProvider — this hook only reads shared state.
 */

import { useEffect } from 'react';
import {
  useSocketContext,
  type SocketContextValue,
} from '@/contexts/SocketContext';

export interface UseSocketOptions {
  /** @deprecated Connection is always managed by SocketProvider at the app root. */
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export type UseSocketReturn = SocketContextValue;

/**
 * Access the shared Socket.io client. Mount SocketProvider once at the app root.
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const ctx = useSocketContext();
  const { onConnect, onDisconnect, onError } = options;

  useEffect(() => {
    const s = ctx.socket;
    if (!s) return;

    const handleConnect = () => onConnect?.();
    const handleDisconnect = () => onDisconnect?.();
    const handleError = (err: Error) =>
      onError?.(new Error(`Socket connection error: ${err.message}`));

    if (onConnect) s.on('connect', handleConnect);
    if (onDisconnect) s.on('disconnect', handleDisconnect);
    if (onError) s.on('connect_error', handleError);

    return () => {
      if (onConnect) s.off('connect', handleConnect);
      if (onDisconnect) s.off('disconnect', handleDisconnect);
      if (onError) s.off('connect_error', handleError);
    };
  }, [ctx.socket, onConnect, onDisconnect, onError]);

  return ctx;
}
