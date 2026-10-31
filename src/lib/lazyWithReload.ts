import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { STORAGE_KEY_CHUNK_RELOAD } from '@/shared/constants/storageKeys';

/**
 * `React.lazy` that reloads once when a dynamic import fails.
 *
 * After a deploy, an open tab still requests the previous hashed chunks.
 * The first failure reloads so the browser loads the new `index.html`.
 * The import is left pending so React does not flash an error mid-reload.
 * A second failure in the same tab is rethrown: if the chunk is actually
 * missing, or `index.html` itself is cached, reloading again would loop.
 */
export function lazyWithReload<T extends ComponentType>(
  loader: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(() => loadWithReload(loader));
}

function loadWithReload<T>(loader: () => Promise<T>): Promise<T> {
  return loader().then(
    (value) => value,
    (error: unknown) => {
      if (!reloadOncePerTab()) throw error;
      return new Promise<T>(() => {});
    }
  );
}

function reloadOncePerTab(): boolean {
  try {
    if (sessionStorage.getItem(STORAGE_KEY_CHUNK_RELOAD) === '1') return false;
    sessionStorage.setItem(STORAGE_KEY_CHUNK_RELOAD, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
