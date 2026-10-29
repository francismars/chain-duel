import { useEffect, useRef, useState } from 'react';
import type {
  AxisDirection,
  PlayerControlSlot,
} from '@/lib/controls/playerControls';
import { useCoarsePointer } from '@/shared/utils/inputMode';
import {
  readTouchDpad,
  sendConfirm,
  sendDirection,
  swipeDirection,
  TAP_MAX_MS,
  TOUCH_DPAD_EVENT,
} from './touchInput';
import './TouchControls.css';

/** Taps on these are real UI, not steering. */
const UI_SELECTOR =
  'button, a, input, select, textarea, label, [role="button"], [role="dialog"], .corner-controls, .touch-dpad';

interface TouchControlsProps {
  /** Slot the finger drives right now; null = touch input off (e.g. spectator, 2 local humans). */
  getSlot: () => PlayerControlSlot | null;
  /** Whether a bare tap should send the confirm key (start / continue). */
  canTapConfirm?: () => boolean;
  /** Pause all touch input (replays, intros, exit dialog…). */
  active?: boolean;
}

interface Gesture {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  slot: PlayerControlSlot;
  held: AxisDirection | null;
  steered: boolean;
}

/**
 * Swipe anywhere to steer, tap to start / continue, optional on-screen D-pad.
 * Every gesture becomes the player's bound keyboard key, so game code needs no
 * touch-specific paths (same approach as gamepad input).
 */
export function TouchControls({
  getSlot,
  canTapConfirm,
  active = true,
}: TouchControlsProps) {
  const touch = useCoarsePointer();
  const [dpad, setDpad] = useState(readTouchDpad);
  const [showHint, setShowHint] = useState(true);
  const getSlotRef = useRef(getSlot);
  const canTapRef = useRef(canTapConfirm);
  getSlotRef.current = getSlot;
  canTapRef.current = canTapConfirm;

  useEffect(() => {
    const sync = () => setDpad(readTouchDpad());
    window.addEventListener(TOUCH_DPAD_EVENT, sync);
    return () => window.removeEventListener(TOUCH_DPAD_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!touch || !active) return;
    let gesture: Gesture | null = null;

    const release = () => {
      if (gesture?.held) sendDirection(gesture.slot, gesture.held, 'keyup');
      gesture = null;
    };

    const onDown = (event: PointerEvent) => {
      if (gesture || event.pointerType === 'mouse') return;
      if ((event.target as Element | null)?.closest?.(UI_SELECTOR)) return;
      const slot = getSlotRef.current();
      if (!slot) return;
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startedAt: performance.now(),
        slot,
        held: null,
        steered: false,
      };
    };

    const onMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const direction = swipeDirection(
        event.clientX - gesture.x,
        event.clientY - gesture.y
      );
      if (!direction) return;
      gesture.steered = true;
      if (direction !== gesture.held) {
        if (gesture.held) sendDirection(gesture.slot, gesture.held, 'keyup');
        sendDirection(gesture.slot, direction, 'keydown');
        gesture.held = direction;
        setShowHint(false);
      }
      // Measure the next turn from here, so one long drag can chain turns.
      gesture.x = event.clientX;
      gesture.y = event.clientY;
    };

    const onUp = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const tapped =
        !gesture.steered &&
        performance.now() - gesture.startedAt < TAP_MAX_MS &&
        (canTapRef.current?.() ?? true);
      const slot = gesture.slot;
      release();
      if (tapped) {
        sendConfirm(slot);
        setShowHint(false);
      }
    };

    const onCancel = (event: PointerEvent) => {
      if (gesture && event.pointerId === gesture.id) release();
    };

    document.documentElement.classList.add('touch-play');
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return () => {
      release();
      document.documentElement.classList.remove('touch-play');
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    };
  }, [touch, active]);

  if (!touch) return null;

  return (
    <>
      <div className="touch-rotate" role="status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <rect x="7" y="2" width="10" height="20" rx="1.5" strokeWidth="1.6" />
          <path d="M20 9a8 8 0 0 1-3 9" strokeWidth="1.6" />
          <path
            d="M17 18h-0.01M17 18l0.5-2.6M17 18l2.6 0.4"
            strokeWidth="1.6"
          />
        </svg>
        <p>Turn your phone sideways to play</p>
      </div>
      {active && showHint ? (
        <p className="touch-hint" aria-hidden>
          Swipe anywhere to steer
        </p>
      ) : null}
      {active && dpad ? <TouchDpad getSlot={getSlot} /> : null}
    </>
  );
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

  const press = (event: React.PointerEvent, direction: AxisDirection) => {
    const slot = getSlot();
    if (!slot) return;
    event.preventDefault();
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    heldRef.current.set(event.pointerId, [slot, direction]);
    sendDirection(slot, direction, 'keydown');
  };

  const lift = (event: React.PointerEvent) => {
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
