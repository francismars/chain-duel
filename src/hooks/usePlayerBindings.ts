import { useEffect, useState } from 'react';

/** Re-render when custom key bindings change in localStorage. */
export function usePlayerBindingsRevision(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((value) => value + 1);
    const onStorage = (event: StorageEvent) => {
      if (
        event.key &&
        event.key !== 'chainduel_playerBindings' &&
        event.key !== 'chainduel_keyboardLayout'
      ) {
        return;
      }
      bump();
    };
    window.addEventListener('chainduel:player-bindings', bump);
    window.addEventListener('chainduel:keyboard-layout', bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('chainduel:player-bindings', bump);
      window.removeEventListener('chainduel:keyboard-layout', bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return revision;
}
