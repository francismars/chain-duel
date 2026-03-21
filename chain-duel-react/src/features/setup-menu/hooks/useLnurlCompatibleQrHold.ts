import { useEffect, useState } from 'react';
import { CHAIN_DUEL_LNURL_COMPAT_QR_EVENT } from '@/shared/constants/events';

type CompatDetail = { player: 1 | 2; pressed: boolean };

/**
 * While held: LNURL QR uses high-contrast black-on-white + quiet zone (see CSS).
 * Keyboard: Left Alt = P1, Right Alt = P2.
 * Gamepad: see `useGamepad` (LB/RB on one pad, or LB on each pad when two connected).
 */
export function useLnurlCompatibleQrHold(enabled: boolean) {
  const [compatibleP1, setCompatibleP1] = useState(false);
  const [compatibleP2, setCompatibleP2] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCompatibleP1(false);
      setCompatibleP2(false);
      return;
    }

    const onCompat = (e: Event) => {
      const ce = e as CustomEvent<CompatDetail>;
      const d = ce.detail;
      if (!d || (d.player !== 1 && d.player !== 2)) return;
      if (d.player === 1) setCompatibleP1(d.pressed);
      else setCompatibleP2(d.pressed);
    };

    window.addEventListener(CHAIN_DUEL_LNURL_COMPAT_QR_EVENT, onCompat);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'AltLeft') {
        e.preventDefault();
        setCompatibleP1(true);
      }
      if (e.code === 'AltRight') {
        e.preventDefault();
        setCompatibleP2(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'AltLeft') setCompatibleP1(false);
      if (e.code === 'AltRight') setCompatibleP2(false);
    };

    const reset = () => {
      setCompatibleP1(false);
      setCompatibleP2(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', reset);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') reset();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener(CHAIN_DUEL_LNURL_COMPAT_QR_EVENT, onCompat);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  return { compatibleP1, compatibleP2 };
}
