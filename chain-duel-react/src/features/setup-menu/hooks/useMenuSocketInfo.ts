import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { parseMenuResponse, type MenuParseResult } from '@/lib/menuAdapters';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@/types/socket';
import {
  LOADING_FALLBACK_TIMEOUT_MS,
  SOCKET_RETRY_DELAY_MS,
} from '@/shared/constants/timeouts';

interface UseMenuSocketInfoArgs {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  responseEvent: 'resGetGameMenuInfos';
  requestEvent: 'getGameMenuInfos' | 'getGameMenuInfosNostr';
  connected?: boolean;
  maxRetries?: number;
  onParsed: (parsed: MenuParseResult) => void;
  onLoadingTimeout: () => void;
}

export function useMenuSocketInfo({
  socket,
  responseEvent,
  requestEvent,
  connected = true,
  maxRetries = 0,
  onParsed,
  onLoadingTimeout,
}: UseMenuSocketInfoArgs) {
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!socket || !connected) return;

    const hostLNAddress = localStorage.getItem('hostLNAddress');
    const hostInfo = hostLNAddress ? { LNAddress: hostLNAddress } : undefined;

    const requestInfos = () => {
      if (hostInfo) socket.emit(requestEvent, hostInfo);
      else socket.emit(requestEvent);
    };

    const onPayload = (body: unknown) => {
      const parsed = parseMenuResponse(body);
      onParsed(parsed);

      if (parsed.payLinks.length > 0) {
        retryCountRef.current = 0;
        return;
      }
      if (retryCountRef.current >= maxRetries) return;
      retryCountRef.current += 1;
      window.setTimeout(requestInfos, SOCKET_RETRY_DELAY_MS);
    };

    socket.on(responseEvent, onPayload);
    const emitTimer = window.setTimeout(requestInfos, 0);
    const fallbackTimer = window.setTimeout(onLoadingTimeout, LOADING_FALLBACK_TIMEOUT_MS);

    return () => {
      socket.off(responseEvent, onPayload);
      window.clearTimeout(emitTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [
    connected,
    maxRetries,
    onLoadingTimeout,
    onParsed,
    requestEvent,
    responseEvent,
    socket,
  ]);
}
