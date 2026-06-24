import { useEffect } from 'react';
import {
  applyInferredLayoutFromKeyEvent,
  autodetectAndApplyLayout,
  readLayoutSource,
} from '@/lib/controls/playerControls';

/** Auto-detect keyboard layout on mount and from the first few key presses. */
export function useKeyboardLayoutAutodetect(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    if (readLayoutSource() === 'auto') {
      void autodetectAndApplyLayout();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      applyInferredLayoutFromKeyEvent(event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
