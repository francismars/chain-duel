import { useCallback, useEffect, useRef } from 'react';
import {
  EXPAND_DEBOUNCE_MS,
  EXPAND_SCALE_DOWN_MS,
} from '@/shared/constants/ui';

type ExpandSide = 'left' | 'right';
type ExpandStatus = Partial<Record<ExpandSide, boolean>>;

interface UseQrExpandStateArgs {
  onExpandedChange: (expanded: ExpandStatus) => void;
  onBackdropVisibleChange: (visible: boolean) => void;
  dualControls: boolean;
}

export function useQrExpandState({
  onExpandedChange,
  onBackdropVisibleChange,
  dualControls,
}: UseQrExpandStateArgs) {
  const expandKeyUpTimeRef = useRef<Partial<Record<ExpandSide, number>>>({});
  const backdropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (side: ExpandSide) => {
      const now = Date.now();
      if (now - (expandKeyUpTimeRef.current[side] ?? 0) < EXPAND_DEBOUNCE_MS) return;
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
      onExpandedChange({ [side]: true });
      onBackdropVisibleChange(true);
    },
    [onBackdropVisibleChange, onExpandedChange]
  );

  const hide = useCallback(
    (side: ExpandSide) => {
      expandKeyUpTimeRef.current[side] = Date.now();
      onExpandedChange({ [side]: false });
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
      backdropTimeoutRef.current = setTimeout(
        () => onBackdropVisibleChange(false),
        EXPAND_SCALE_DOWN_MS
      );
    },
    [onBackdropVisibleChange, onExpandedChange]
  );

  useEffect(() => {
    const resetAll = () => {
      onExpandedChange({ left: false, right: false });
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
      onBackdropVisibleChange(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ControlLeft') show('left');
      if (dualControls && e.code === 'ControlRight') show('right');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ControlLeft') hide('left');
      if (dualControls && e.code === 'ControlRight') hide('right');
      if (e.key === 'Control' || !e.ctrlKey) {
        resetAll();
      }
    };
    const onWindowBlur = () => {
      // Prevent sticky expanded state when keyup is lost after focus changes.
      resetAll();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetAll();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (backdropTimeoutRef.current) clearTimeout(backdropTimeoutRef.current);
    };
  }, [dualControls, hide, onBackdropVisibleChange, onExpandedChange, show]);
}
