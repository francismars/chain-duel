import { useEffect, useState } from 'react';
import { EXPAND_SCALE_DOWN_MS } from '@/shared/constants/ui';

/**
 * Stays true while a QR is expanded and through its scale-down, so the code
 * keeps its z-index (and isolated blend) until it is back at rest size.
 */
export function useQrRaised(expanded: boolean): boolean {
  const [lingering, setLingering] = useState(false);

  useEffect(() => {
    if (expanded) {
      setLingering(true);
      return;
    }
    const id = window.setTimeout(
      () => setLingering(false),
      EXPAND_SCALE_DOWN_MS
    );
    return () => window.clearTimeout(id);
  }, [expanded]);

  return expanded || lingering;
}
