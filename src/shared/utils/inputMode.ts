import { useEffect, useState } from 'react';

const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** True when the primary pointer is a finger (phones, tablets). */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
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
