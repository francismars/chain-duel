import type { NavigateFunction } from 'react-router-dom';

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
