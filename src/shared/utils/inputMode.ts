import { useEffect, useState } from 'react';

const COARSE_POINTER_QUERY = '(pointer: coarse)';

let coarseQuery: MediaQueryList | null = null;

/** True when the primary pointer is a finger (phones, tablets). Cheap enough per frame. */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  coarseQuery ??= window.matchMedia(COARSE_POINTER_QUERY);
  return coarseQuery.matches;
}

/** Live result of a CSS media query; re-renders when it flips. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Re-renders when the primary pointer switches between touch and mouse. */
export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY);
}

/** Phone-width layout (matches the 640px CSS breakpoint). */
export const PHONE_QUERY = '(max-width: 640px)';
