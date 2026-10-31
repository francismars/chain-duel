import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { STORAGE_KEY_CHUNK_RELOAD } from '@/shared/constants/storageKeys';

/**
 * `React.lazy` that reloads once when a dynamic import fails.
 *
 * After a deploy, an open tab still requests the previous hashed chunks.
 * The first failure reloads so the browser loads the new `index.html`.
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
    (error: unknown) => {
      if (!reloadOncePerTab()) throw error;
      return new Promise<T>(() => {});
    }
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

function reloadOncePerTab(): boolean {
  try {
    if (sessionStorage.getItem(STORAGE_KEY_CHUNK_RELOAD) === '1') return false;
    sessionStorage.setItem(STORAGE_KEY_CHUNK_RELOAD, '1');
  } catch {
    return false;
  }
  Reflect.set(window, RELOAD_REQUESTED, true);
  window.location.reload();
  return true;
}
