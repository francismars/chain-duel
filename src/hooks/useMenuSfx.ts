import { useCallback } from 'react';
import { useAudio, SFX } from '@/contexts/AudioContext';

/** Menu navigation (focus move) and activation (press) sounds for setup screens. */
export function useMenuSfx() {
  const { playSfx } = useAudio();
  const playSelect = useCallback(() => playSfx(SFX.MENU_SELECT), [playSfx]);
  const playConfirm = useCallback(() => playSfx(SFX.MENU_CONFIRM), [playSfx]);
  return { playSfx, playSelect, playConfirm };
}
