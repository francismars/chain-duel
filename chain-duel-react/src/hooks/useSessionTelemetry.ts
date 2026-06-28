import { useEffect, useRef } from 'react';
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

/** Once per browser tab session: referrer + platform context. */
export function useSessionTelemetry(): void {
  const { socket } = useSocket();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    reportClientEvent(socket, 'client.session.context', {
      platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
      referrer: referrerHostname(),
    });
  }, [socket]);
}
