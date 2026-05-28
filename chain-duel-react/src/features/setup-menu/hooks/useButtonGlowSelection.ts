import { RefObject, useEffect } from 'react';
import { setButtonGlow } from '@/shared/utils/buttonGlow';

type ButtonRefMap<T extends string> = Partial<Record<T, RefObject<HTMLButtonElement>>>;

export function useButtonGlowSelection<T extends string>(
  selected: T,
  refs: ButtonRefMap<T>,
) {
  useEffect(() => {
    (Object.keys(refs) as T[]).forEach((key) => {
      setButtonGlow(refs[key]?.current, selected === key);
    });
  }, [selected, refs]);
}
