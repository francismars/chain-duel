import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isLiveMatchPath } from '@/lib/pwa/isLiveMatchPath';
import './AppUpdatePrompt.css';

/**
 * A waiting service worker reloads the page once it takes control.
 * During a match that reload is postponed until the player leaves.
 */
export function AppUpdatePrompt() {
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined
  );
  const liveMatchRef = useRef(false);
  const reloadWhenSafeRef = useRef(false);
  liveMatchRef.current = isLiveMatchPath(pathname);
  const inMatch = liveMatchRef.current;

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
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
            void updateServiceWorker(true);
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
