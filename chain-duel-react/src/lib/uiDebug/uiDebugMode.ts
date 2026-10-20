export const UI_DEBUG_STORAGE_KEY = 'chainduel.uiDebug';

export function readUiDebugEnabled(): boolean {
  try {
    return localStorage.getItem(UI_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeUiDebugEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(UI_DEBUG_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(UI_DEBUG_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('chainduel-ui-debug'));
}

/** `?debug` or a path/search that contains the word debug turns the mode on. */
export function urlRequestsUiDebug(href: string): boolean {
  return /(?:^|[/?&#=])debug(?:$|[/?&#=])/i.test(href);
}
