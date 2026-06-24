import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSocket } from '@/hooks/useSocket';
import { reportClientEvent } from '@/lib/telemetry/reportClientEvent';

export function useClientTelemetry(): void {
  const { socket } = useSocket();
  const location = useLocation();
  const lastRouteRef = useRef<string | null>(null);

  useEffect(() => {
    const route = `${location.pathname}${location.search}`;
    if (lastRouteRef.current === route) return;
    lastRouteRef.current = route;
    reportClientEvent(socket, 'client.page.view', { route });
  }, [location.pathname, location.search, socket]);
}
