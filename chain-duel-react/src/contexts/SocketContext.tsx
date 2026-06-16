import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';
import { disconnectSocket, getSocket, type SocketConfig } from '@/lib/socket';
import { loadConfig } from '@/lib/config';

export type SocketContextValue = {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
  error: Error | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const SocketContext = createContext<SocketContextValue | null>(null);

/** One Socket.io connection for the whole app — mount once near the root. */
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const configRef = useRef<SocketConfig | null>(null);
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);

  const connect = useCallback(async () => {
    try {
      if (!configRef.current) {
        const config = await loadConfig();
        configRef.current = { serverIP: config.IP, serverPORT: config.PORT };
      }
      const nextSocket = getSocket(configRef.current);
      socketRef.current = nextSocket;
      setSocket(nextSocket);
      setConnected(nextSocket.connected);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectSocket();
    socketRef.current = null;
    setSocket(null);
    setConnected(false);
  }, []);

  useEffect(() => {
    void connect();
  }, [connect]);

  useEffect(() => {
    const s = socket;
    if (!s) return;

    const onConnect = () => {
      setConnected(true);
      setError(null);
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: Error) => {
      setError(new Error(`Socket connection error: ${err.message}`));
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    setConnected(s.connected);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, [socket]);

  const value = useMemo(
    () => ({ socket, connected, error, connect, disconnect }),
    [socket, connected, error, connect, disconnect]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocketContext(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocketContext must be used within SocketProvider');
  }
  return ctx;
}
