import { useEffect, useState } from 'react';
import {
  LNURL_QR_COMPAT_PULSE_DURATION_MS,
  LNURL_QR_COMPAT_PULSE_INTERVAL_MS,
} from '@/shared/constants/timeouts';

/**
 * Periodically switches LNURL QR codes into scanner-friendly mode
 * (quiet zone + standard black-on-white) for a few seconds, then reverts.
 * Cycle: normal → wait 5s → pulse 3s → repeat.
 */
export function useLnurlQrCompatiblePulse(enabled: boolean) {
  const [pulseActive, setPulseActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPulseActive(false);
      return;
    }

    let waitId = 0;
    let pulseEndId = 0;
    let cancelled = false;

    const clearTimers = () => {
      window.clearTimeout(waitId);
      window.clearTimeout(pulseEndId);
    };

    const scheduleNormalPhase = () => {
      if (cancelled) return;
      setPulseActive(false);
      waitId = window.setTimeout(() => {
        if (cancelled) return;
        setPulseActive(true);
        pulseEndId = window.setTimeout(() => {
          scheduleNormalPhase();
        }, LNURL_QR_COMPAT_PULSE_DURATION_MS);
      }, LNURL_QR_COMPAT_PULSE_INTERVAL_MS);
    };

    scheduleNormalPhase();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        cancelled = true;
        clearTimers();
        setPulseActive(false);
        return;
      }
      cancelled = false;
      clearTimers();
      scheduleNormalPhase();
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
      setPulseActive(false);
    };
  }, [enabled]);

  return pulseActive;
}
