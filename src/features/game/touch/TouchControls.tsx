import { useEffect, useRef } from 'react';
import type { PlayerControlSlot } from '@/lib/controls/playerControls';
import { setTouchPlayTarget } from './touchPlayTarget';

interface TouchControlsProps {
  /** Slot the finger drives right now; null = touch input off (spectator, 2 local humans). */
  getSlot: () => PlayerControlSlot | null;
  /** Pause touch input (replays, intros, exit dialog…). */
  active?: boolean;
}

/**
 * Publishes the seat the landscape stick should drive.
 * Steering itself stays in TouchMatchFrame: one finger, one key stream.
 */
export function TouchControls({ getSlot, active = true }: TouchControlsProps) {
  const getSlotRef = useRef(getSlot);
  getSlotRef.current = getSlot;

  useEffect(() => {
    setTouchPlayTarget({
      getSlot: () => getSlotRef.current(),
      active: () => active,
    });
    return () => setTouchPlayTarget(null);
  }, [active]);

  return null;
}
