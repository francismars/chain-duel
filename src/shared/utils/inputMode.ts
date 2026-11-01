import { useEffect, useState } from 'react';

const COARSE_POINTER_QUERY = '(pointer: coarse)';

let coarseQuery: MediaQueryList | null = null;

/**
 * UI debug: `?touch=portrait|landscape|on` fakes a phone in a desktop browser
 * (mouse drives the stick); `?touch=off` clears it. Kept for the tab session so
 * it survives in-app navigation.
 *   portrait  — board on top, stick area below
 *   landscape — 16:9 stage, stick anywhere
 *   on        — pick from the window's orientation
 */
export type TouchDebugMode = 'portrait' | 'landscape' | 'on';

const TOUCH_DEBUG_PARAM = 'touch';
const TOUCH_DEBUG_STORAGE_KEY = 'chainduel:touch-debug';

let touchDebugSearch: string | null = null;
let touchDebugMode: TouchDebugMode | null = null;

function parseTouchDebug(value: string | null): TouchDebugMode | 'off' | null {
  if (value == null) return null;
  const mode = value.trim().toLowerCase();
  switch (mode) {
    case 'portrait':
    case 'landscape':
    case 'on':
      return mode;
    case '':
    case '1':
    case 'true':
      return 'on';
    case 'off':
    case '0':
    case 'false':
      return 'off';
    default:
      return null;
  }
}

/** Forced touch layout from the URL / tab session, or null for real detection. */
export function readTouchDebugMode(): TouchDebugMode | null {
  if (typeof window === 'undefined') return null;
  const search = window.location.search;
  if (search === touchDebugSearch) return touchDebugMode;
  touchDebugSearch = search;

  const fromUrl = parseTouchDebug(
    new URLSearchParams(search).get(TOUCH_DEBUG_PARAM)
  );
  try {
    if (fromUrl === 'off') {
      window.sessionStorage.removeItem(TOUCH_DEBUG_STORAGE_KEY);
    } else if (fromUrl) {
      window.sessionStorage.setItem(TOUCH_DEBUG_STORAGE_KEY, fromUrl);
    }
    const stored = parseTouchDebug(
      window.sessionStorage.getItem(TOUCH_DEBUG_STORAGE_KEY)
    );
    touchDebugMode = stored === 'off' ? null : stored;
  } catch {
    touchDebugMode = fromUrl === 'off' ? null : fromUrl;
  }
  return touchDebugMode;
}

/** True when the primary pointer is a finger (phones, tablets). Cheap enough per frame. */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (readTouchDebugMode()) return true;
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
  return useMediaQuery(COARSE_POINTER_QUERY) || readTouchDebugMode() !== null;
}

/** Phone-width layout (matches the 640px CSS breakpoint). */
export const PHONE_QUERY = '(max-width: 640px)';
