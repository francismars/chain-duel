import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { isLiveMatchPath } from '@/lib/pwa/isLiveMatchPath';
import './AppUpdatePrompt.css';

/** One kill-switch attempt per tab, so the unregistering worker cannot reload forever. */
const PWA_KILL_ATTEMPTED = 'chainduel_pwaKill';

/**
 * After the load event. requestIdleCallback when the browser has one,
 * otherwise a 5s timeout. Never during first paint.
 */
function afterLoadIdle(run: () => void): () => void {
  let cancelIdle: (() => void) | undefined;
  const startIdle = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => run());
      cancelIdle = () => window.cancelIdleCallback(id);
      return;
    }
    const id = window.setTimeout(run, 5000);
    cancelIdle = () => window.clearTimeout(id);
  };
  if (document.readyState === 'complete') {
    startIdle();
  } else {
    window.addEventListener('load', startIdle, { once: true });
  }
  return () => {
    window.removeEventListener('load', startIdle);
    cancelIdle?.();
  };
}

/**
 * A waiting service worker reloads the page once it takes control.
 * During a match that reload is postponed until the player leaves.
 * Registration waits until the first visit has finished loading.
 */
export function AppUpdatePrompt() {
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined
  );
  const updateServiceWorkerRef = useRef<
    (reloadPage?: boolean) => Promise<void>
  >(async () => {});
  const liveMatchRef = useRef(false);
  const reloadWhenSafeRef = useRef(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  liveMatchRef.current = isLiveMatchPath(pathname);
  const inMatch = liveMatchRef.current;

  useEffect(() => {
    let cancelled = false;
    const cancelSchedule = afterLoadIdle(() => {
      void (async () => {
        if (cancelled || !('serviceWorker' in navigator)) return;
        if (import.meta.env.VITE_PWA_DISABLED === 'true') {
          if (sessionStorage.getItem(PWA_KILL_ATTEMPTED) === '1') return;
          const existing = await navigator.serviceWorker.getRegistration();
          if (cancelled || !existing) return;
          sessionStorage.setItem(PWA_KILL_ATTEMPTED, '1');
        }
        const { registerSW } = await import('virtual:pwa-register');
        if (cancelled) return;
        updateServiceWorkerRef.current = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true);
          },
          onNeedReload() {
            if (liveMatchRef.current) {
              reloadWhenSafeRef.current = true;
              return;
            }
            window.location.reload();
          },
          onRegisteredSW(_url, registration) {
            registrationRef.current = registration;
          },
        });
      })();
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node) || !root.contains(target)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (target instanceof HTMLButtonElement) target.click();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    if (inMatch) return;
    if (reloadWhenSafeRef.current) {
      window.location.reload();
      return;
    }
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      void registrationRef.current?.update().catch(() => undefined);
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [inMatch, pathname]);

  if (!needRefresh || inMatch) return null;

  return (
    <div
      ref={rootRef}
      className="app-update"
      data-app-update=""
      role="region"
      aria-label="App update"
    >
      <p className="app-update__text">New version ready</p>
      <div className="app-update__actions">
        <button
          type="button"
          className="app-update__button"
          onClick={() => {
            void updateServiceWorkerRef.current(true);
          }}
        >
          Reload
        </button>
        <button
          type="button"
          className="app-update__button app-update__button--later"
          onClick={() => setNeedRefresh(false)}
        >
          Later
        </button>
      </div>
    </div>
  );
}
