import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  AxisDirection,
  PlayerControlSlot,
} from '@/lib/controls/playerControls';
import { useCoarsePointer } from '@/shared/utils/inputMode';
import { setTouchPlayTarget } from './touchPlayTarget';
import { readTouchDpad, sendDirection, TOUCH_DPAD_EVENT } from './touchInput';
import './TouchControls.css';

interface TouchControlsProps {
  /** Slot the finger drives right now; null = touch input off (spectator, 2 local humans). */
  getSlot: () => PlayerControlSlot | null;
  /** Pause touch input (replays, intros, exit dialog…). */
  active?: boolean;
}

/**
 * Publishes the seat the landscape stick should drive, and an optional D-pad.
 * Steering itself stays in TouchMatchFrame: one finger, one key stream.
 */
export function TouchControls({ getSlot, active = true }: TouchControlsProps) {
  const touch = useCoarsePointer();
  const [dpad, setDpad] = useState(readTouchDpad);
  const getSlotRef = useRef(getSlot);
  getSlotRef.current = getSlot;

  useEffect(() => {
    setTouchPlayTarget({
      getSlot: () => getSlotRef.current(),
      active: () => active,
    });
    return () => setTouchPlayTarget(null);
  }, [active]);

  useEffect(() => {
    const sync = () => setDpad(readTouchDpad());
    window.addEventListener(TOUCH_DPAD_EVENT, sync);
    return () => window.removeEventListener(TOUCH_DPAD_EVENT, sync);
  }, []);

  if (!touch || !active || !dpad) return null;

  return <TouchDpad getSlot={getSlot} />;
}

const DPAD_DIRECTIONS: AxisDirection[] = ['up', 'left', 'right', 'down'];
const DPAD_ARROWS: Record<AxisDirection, string> = {
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
};

function TouchDpad({ getSlot }: { getSlot: () => PlayerControlSlot | null }) {
  const heldRef = useRef(new Map<number, [PlayerControlSlot, AxisDirection]>());

  useEffect(() => {
    const held = heldRef.current;
    return () => {
      held.forEach(([slot, direction]) =>
        sendDirection(slot, direction, 'keyup')
      );
      held.clear();
    };
  }, []);

  const press = (event: ReactPointerEvent, direction: AxisDirection) => {
    const slot = getSlot();
    if (!slot) return;
    event.preventDefault();
    heldRef.current.set(event.pointerId, [slot, direction]);
    sendDirection(slot, direction, 'keydown');
  };

  const lift = (event: ReactPointerEvent) => {
    const entry = heldRef.current.get(event.pointerId);
    if (!entry) return;
    heldRef.current.delete(event.pointerId);
    sendDirection(entry[0], entry[1], 'keyup');
  };

  return (
    <div className="touch-dpad" aria-label="Direction pad">
      {DPAD_DIRECTIONS.map((direction) => (
        <button
          key={direction}
          type="button"
          className={`touch-dpad__pad touch-dpad__pad--${direction}`}
          aria-label={direction}
          onPointerDown={(event) => press(event, direction)}
          onPointerUp={lift}
          onPointerCancel={lift}
          onPointerLeave={lift}
          onContextMenu={(event) => event.preventDefault()}
        >
          {DPAD_ARROWS[direction]}
        </button>
      ))}
    </div>
  );
}
