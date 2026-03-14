import { RefObject, useEffect } from 'react';
import {
  BUTTON_GLOW_ACTIVE_DURATION,
  BUTTON_GLOW_INACTIVE_DURATION,
} from '@/shared/constants/ui';

type ButtonRefMap<T extends string> = Partial<Record<T, RefObject<HTMLButtonElement>>>;

export function useButtonGlowSelection<T extends string>(
  selected: T,
  refs: ButtonRefMap<T>
) {
  useEffect(() => {
    (Object.keys(refs) as T[]).forEach((key) => {
      const ref = refs[key];
      if (!ref?.current) return;
      ref.current.style.animationDuration =
        selected === key ? BUTTON_GLOW_ACTIVE_DURATION : BUTTON_GLOW_INACTIVE_DURATION;
    });
  }, [selected, refs]);
}
