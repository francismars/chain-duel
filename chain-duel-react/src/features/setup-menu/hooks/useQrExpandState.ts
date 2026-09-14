import { useCallback, useEffect, useRef } from 'react';
import {
  EXPAND_DEBOUNCE_MS,
  EXPAND_SCALE_DOWN_MS,
} from '@/shared/constants/ui';
import type { WindowTimeout } from '@/shared/utils/timer';

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
  const backdropTimeoutRef = useRef<WindowTimeout | null>(null);
  const expandedRef = useRef({ left: false, right: false });
  const onExpandedChangeRef = useRef(onExpandedChange);
  const onBackdropVisibleChangeRef = useRef(onBackdropVisibleChange);
  onExpandedChangeRef.current = onExpandedChange;
  onBackdropVisibleChangeRef.current = onBackdropVisibleChange;

  const clearBackdropTimer = useCallback(() => {
    if (backdropTimeoutRef.current) {
      window.clearTimeout(backdropTimeoutRef.current);
      backdropTimeoutRef.current = null;
    }
  }, []);

  const scheduleBackdropOff = useCallback(() => {
    clearBackdropTimer();
    backdropTimeoutRef.current = window.setTimeout(() => {
      backdropTimeoutRef.current = null;
      if (!expandedRef.current.left && !expandedRef.current.right) {
        onBackdropVisibleChangeRef.current(false);
      }
    }, EXPAND_SCALE_DOWN_MS);
  }, [clearBackdropTimer]);

  const show = useCallback(
    (side: ExpandSide) => {
      const now = Date.now();
      if (now - (expandKeyUpTimeRef.current[side] ?? 0) < EXPAND_DEBOUNCE_MS)
        return;
      expandedRef.current[side] = true;
      clearBackdropTimer();
      onExpandedChangeRef.current({ [side]: true });
      onBackdropVisibleChangeRef.current(true);
    },
    [clearBackdropTimer]
  );

  const hide = useCallback(
    (side: ExpandSide) => {
      expandKeyUpTimeRef.current[side] = Date.now();
      expandedRef.current[side] = false;
      onExpandedChangeRef.current({ [side]: false });
      if (!expandedRef.current.left && !expandedRef.current.right) {
        scheduleBackdropOff();
      }
    },
    [scheduleBackdropOff]
  );

  useEffect(() => {
    const resetAll = () => {
      expandedRef.current = { left: false, right: false };
      onExpandedChangeRef.current({ left: false, right: false });
      clearBackdropTimer();
      onBackdropVisibleChangeRef.current(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ControlLeft') show('left');
      if (dualControls && e.code === 'ControlRight') show('right');
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ControlLeft') hide('left');
      if (dualControls && e.code === 'ControlRight') hide('right');
    };
    const onWindowBlur = () => {
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
      clearBackdropTimer();
    };
  }, [clearBackdropTimer, dualControls, hide, show]);
}
