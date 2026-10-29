import { useEffect, useState } from 'react';

const COARSE_POINTER_QUERY = '(pointer: coarse)';

let coarseQuery: MediaQueryList | null = null;

/** True when the primary pointer is a finger (phones, tablets). Cheap enough per frame. */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  coarseQuery ??= window.matchMedia(COARSE_POINTER_QUERY);
  return coarseQuery.matches;
}

/** Re-renders when the primary pointer switches between touch and mouse. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(isCoarsePointer);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(COARSE_POINTER_QUERY);
    const onChange = () => setCoarse(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return coarse;
}
