import { useEffect, useState } from 'react';
import {
  readKeyboardLayoutId,
  type KeyboardLayoutId,
} from '@/lib/controls/playerControls';

export function useKeyboardLayout(): KeyboardLayoutId {
  const [layout, setLayout] = useState<KeyboardLayoutId>(() => readKeyboardLayoutId());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'chainduel_keyboardLayout') return;
      setLayout(readKeyboardLayoutId());
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ layout?: KeyboardLayoutId }>).detail;
      if (detail?.layout) {
        setLayout(detail.layout);
        return;
      }
      setLayout(readKeyboardLayoutId());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('chainduel:keyboard-layout', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('chainduel:keyboard-layout', onCustom as EventListener);
    };
  }, []);

  return layout;
}
