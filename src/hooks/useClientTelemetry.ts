import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSocket } from '@/hooks/useSocket';
import { reportClientEvent } from '@/lib/telemetry/reportClientEvent';

function referrerHostname(): string | undefined {
  try {
    const ref = document.referrer?.trim();
    if (!ref) return undefined;
    return new URL(ref).hostname.slice(0, 120);
  } catch {
    return undefined;
  }
}

export function useClientTelemetry(): void {
  const { socket, connected } = useSocket();
  const location = useLocation();

  // Once per socket connection: session context (referrer, platform).
  useEffect(() => {
    if (!socket) return;

    const sendSessionContext = () => {
      reportClientEvent(socket, 'client.session.context', {
        platform:
          typeof navigator !== 'undefined' ? navigator.platform : undefined,
        referrer: referrerHostname(),
      });
    };

    socket.on('connect', sendSessionContext);
    if (socket.connected) {
      sendSessionContext();
    }

    return () => {
      socket.off('connect', sendSessionContext);
    };
  }, [socket]);

  // Page view on route change and when the socket first connects (fixes pre-connect queue drop).
  useEffect(() => {
    const route = `${location.pathname}${location.search}`;
    reportClientEvent(socket, 'client.page.view', { route });
  }, [location.pathname, location.search, socket, connected]);
}
