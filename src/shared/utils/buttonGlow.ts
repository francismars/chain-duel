import { BUTTON_GLOW_ACTIVE_ANIMATION } from '@/shared/constants/ui';

/** Toggle menu button pulse. Inactive must be `none` — `0s` duration flickers. */
export function setButtonGlow(
  element: HTMLElement | null | undefined,
  active: boolean
): void {
  if (!element) return;
  element.style.animation = active ? BUTTON_GLOW_ACTIVE_ANIMATION : 'none';
}
