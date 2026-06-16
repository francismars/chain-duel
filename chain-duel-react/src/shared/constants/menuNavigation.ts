import type { NavigateFunction } from 'react-router-dom';
import { SETUP_MENU_KEY_GRACE_MS } from '@/shared/constants/timeouts';

/**
 * When Index navigates via keyboard (Enter/Space), the same key can be
 * processed again on the next page (capture/timing/gamepad synth), opening
 * cancel overlays etc. Next page reads this from location.state and ignores
 * the first confirm key only.
 */
export const CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM = 'chainDuelSuppressNextMenuConfirm';

export type MenuNavigationState = {
  [CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM]?: boolean;
};

/** Ignore gamepad hold-repeat on Index after MAIN MENU (ms). */
export const MAIN_MENU_CONFIRM_SUPPRESS_MS = 900;

/** Pass as `navigate('/', { state })` so Index ignores the ghost Space/Enter from gamepads. */
export function mainMenuReturnState(): MenuNavigationState {
  return { [CHAIN_DUEL_SUPPRESS_NEXT_MENU_CONFIRM]: true };
}

/** Navigate home and swallow ghost gamepad confirm on Index. */
export function navigateToMainMenu(navigate: NavigateFunction): void {
  navigate('/', { state: mainMenuReturnState() });
}

/** Ms to ignore confirm on Index after any mount (keyboard/gamepad timing). */
export function indexConfirmSuppressMs(fromMainMenuButton: boolean): number {
  return fromMainMenuButton ? MAIN_MENU_CONFIRM_SUPPRESS_MS : SETUP_MENU_KEY_GRACE_MS;
}

/**
 * Clears transient navigation state without dropping `?query` / hash.
 * `navigate('.', { replace: true, state: {} })` can strip the search string
 * (e.g. `/gamemenu?nostr=true` → `/gamemenu`), breaking Nostr vs Lightning.
 */
export function clearMenuNavigationState(
  navigate: NavigateFunction,
  loc: { pathname: string; search: string; hash: string }
) {
  navigate(
    { pathname: loc.pathname, search: loc.search, hash: loc.hash },
    { replace: true, state: {} }
  );
}
