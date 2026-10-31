import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isLiveMatchPath } from '@/lib/pwa/isLiveMatchPath';
import { STORAGE_KEY_CHUNK_RELOAD } from '@/shared/constants/storageKeys';

/** How long to wait for the new service worker to take control. */
const CONTROLLER_CHANGE_MS = 3000;

/**
 * `React.lazy` that reloads once when a dynamic import fails.
 *
 * After a deploy, an open tab still requests the previous hashed chunks.
 * The first failure reloads so the browser loads the new `index.html`.
 * When a service worker controls the page (and this is not a live match),
 * that reload first checks for a waiting worker: `registration.update()`,
 * then `{type:'SKIP_WAITING'}`, then reload on `controllerchange` or after
 * 3 seconds. A live match keeps the immediate reload.
 * The import is left pending so React does not flash an error mid-reload.
 * A second failure before any chunk loads successfully is rethrown: if the
 * chunk is actually missing, or `index.html` itself is cached, reloading
 * again would loop. A successful load clears that mark so a later deploy
 * can reload once more.
 */
export function lazyWithReload<T extends ComponentType>(
  loader: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(() => loadWithReload(loader));
}

/**
 * Set on this document once `location.reload()` has been requested.
 * It dies with the document, unlike the sessionStorage flag, so a chunk
 * that resolves while the reload is still in flight cannot clear the flag
 * and let the next document reload again.
 */
const RELOAD_REQUESTED = Symbol('chainduel.chunkReloadRequested');

function loadWithReload<T>(loader: () => Promise<T>): Promise<T> {
  return loader().then(
    (value) => {
      clearReloadFlag();
      return value;
    },
    (error: unknown) =>
      reloadOncePerTab().then((didReload) => {
        if (!didReload) throw error;
        return new Promise<T>(() => {});
      })
  );
}

function clearReloadFlag(): void {
  if (Reflect.get(window, RELOAD_REQUESTED) === true) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY_CHUNK_RELOAD);
  } catch {
    // Storage can be blocked. The chunk still loaded.
  }
}

function currentPathname(): string {
  const pathname = window.location?.pathname;
  return typeof pathname === 'string' ? pathname : '';
}

function serviceWorkerContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  return navigator.serviceWorker;
}

function reloadWhenControllerChanges(sw: ServiceWorkerContainer): void {
  let settled = false;
  const reloadNow = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    sw.removeEventListener('controllerchange', reloadNow);
    window.location.reload();
  };
  const timer = setTimeout(reloadNow, CONTROLLER_CHANGE_MS);
  sw.addEventListener('controllerchange', reloadNow);
}

/** `update()` can resolve while the new worker is still installing. */
function workerWaiting(
  registration: ServiceWorkerRegistration
): Promise<ServiceWorker | null> {
  if (registration.waiting) return Promise.resolve(registration.waiting);
  const installing = registration.installing;
  if (!installing) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      installing.removeEventListener('statechange', onState);
      resolve(registration.waiting);
    };
    const onState = () => {
      if (
        installing.state === 'installed' ||
        installing.state === 'redundant'
      ) {
        finish();
      }
    };
    const timer = setTimeout(finish, CONTROLLER_CHANGE_MS);
    installing.addEventListener('statechange', onState);
  });
}

async function reloadOncePerTab(): Promise<boolean> {
  try {
    if (sessionStorage.getItem(STORAGE_KEY_CHUNK_RELOAD) === '1') return false;
    sessionStorage.setItem(STORAGE_KEY_CHUNK_RELOAD, '1');
  } catch {
    return false;
  }
  Reflect.set(window, RELOAD_REQUESTED, true);

  const sw = serviceWorkerContainer();
  if (sw?.controller && !isLiveMatchPath(currentPathname())) {
    try {
      const registration = await sw.getRegistration();
      if (registration) {
        await registration.update();
        const waiting = await workerWaiting(registration);
        if (waiting) {
          waiting.postMessage({ type: 'SKIP_WAITING' });
          reloadWhenControllerChanges(sw);
          return true;
        }
      }
    } catch {
      // The new worker could not be checked. Reload the page anyway.
    }
  }

  window.location.reload();
  return true;
}
