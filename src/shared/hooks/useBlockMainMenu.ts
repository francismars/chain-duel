import { useLayoutEffect } from 'react';
import { REQUEST_MAIN_MENU_EVENT } from '@/shared/constants/menuNavigation';

/**
 * Cancel corner-menu Home and let the page show its own confirm.
 * Without this, `requestMainMenu` navigates to `/` immediately.
 */
export function useBlockMainMenu(active: boolean, onRequest: () => void): void {
  useLayoutEffect(() => {
    if (!active) return;
    const onRequestMainMenu = (event: Event) => {
      event.preventDefault();
      onRequest();
    };
    window.addEventListener(REQUEST_MAIN_MENU_EVENT, onRequestMainMenu);
    return () =>
      window.removeEventListener(REQUEST_MAIN_MENU_EVENT, onRequestMainMenu);
  }, [active, onRequest]);
}
