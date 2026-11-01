/** Stand-in for `virtual:pwa-register` while the dev service worker is off. */
export function registerSW(_options?: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onNeedReload?: () => void;
  onRegisteredSW?: (
    url: string,
    registration: ServiceWorkerRegistration | undefined
  ) => void;
}): (reloadPage?: boolean) => Promise<void> {
  return async () => {};
}
